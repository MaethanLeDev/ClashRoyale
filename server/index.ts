import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { CARD_IDS, CARDS, type CardId } from "../shared/cards";
import { STYLES } from "../shared/ai/styles";
import { GAME_NAME } from "../shared/constants";
import type { ClientMsg, ServerMsg } from "../shared/protocol";
import { Room, sanitizeDeck, validDeck, type Client } from "./room";
import { isRegistered, keyOf, login, logout, profileOf, register, resume, saveDeck, type Account } from "./db";
import { authBlocked, authFailed, authSucceeded, clientIp, closeConnection, MAX_MESSAGE_BYTES, MAX_ROOMS, MessageBudget, openConnection } from "./guard";

const PORTS = process.env.PORT ? [Number(process.env.PORT)] : [3000, 8080, 8000, 5050, 4321, 0];
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = normalize(join(ROOT, url));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");
  if (!existsSync(file)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(`${GAME_NAME} : le client n'est pas compilé. Lance "npm run build" puis "npm start", ou "npm run dev".`);
    return;
  }
  const rel = file.slice(ROOT.length).replace(/\\/g, "/");
  const cache = rel.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : extname(file) === ".html"
      ? "no-cache"
      : "public, max-age=3600";
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": cache });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  maxPayload: MAX_MESSAGE_BYTES,
  perMessageDeflate: { threshold: 512, zlibDeflateOptions: { level: 3 } },
});
const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();
let counter = 0;

function roomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function publishRooms() {
  const list = [...rooms.values()].filter((r) => r.humans.length > 0 && (!r.solo || r.status === "playing")).map((r) => r.info());
  for (const c of clients.values()) if (!c.roomId) c.send({ type: "rooms", rooms: list });
}

function stopSpectating(c: Client) {
  if (!c.spectating) return;
  rooms.get(c.spectating)?.removeSpectator(c);
  c.spectating = null;
}

function leaveRoom(c: Client) {
  stopSpectating(c);
  if (!c.roomId) return;
  const room = rooms.get(c.roomId);
  room?.removeClient(c);
  if (room && !room.humans.length) rooms.delete(room.id);
  c.send({ type: "room", room: null });
  publishRooms();
}

function createRoom(c: Client, mode: "1v1" | "2v2", solo = false): Room | null {
  leaveRoom(c);
  if (rooms.size >= MAX_ROOMS) {
    c.send({ type: "error", msg: "Le serveur est plein, réessaie dans un moment" });
    return null;
  }
  const room = new Room(roomCode(), mode, c.id, publishRooms);
  room.solo = solo;
  rooms.set(room.id, room);
  room.addClient(c);
  return room;
}

wss.on("connection", (ws: WebSocket, req) => {
  const ip = clientIp(req);
  if (!openConnection(ip)) {
    ws.close(1008, "Trop de connexions");
    return;
  }
  const budget = new MessageBudget();
  const id = `p${++counter}-${Math.random().toString(36).slice(2, 7)}`;
  const client: Client = {
    id, name: "Joueur", deck: sanitizeDeck(null), roomId: null, spectating: null, identity: { kind: "guest", name: "Joueur" },
    send(msg: ServerMsg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  clients.set(id, client);
  client.send({ type: "welcome", id });

  // Un deck refusé ne remplace plus le deck en cours par le deck par défaut sans prévenir :
  // on garde le précédent et on explique (souvent : serveur pas à jour après l'ajout de cartes).
  const acceptDeck = (raw: unknown) => {
    const deck = validDeck(raw);
    if (!deck) {
      const unknown = Array.isArray(raw) ? raw.filter((c) => typeof c !== "string" || !CARD_IDS.includes(c as CardId)) : [];
      console.warn(`Deck refusé pour ${client.name} :`, JSON.stringify(raw));
      fail(
        unknown.length
          ? `Le serveur ne connaît pas ${unknown.length > 1 ? "ces cartes" : "cette carte"} : ${unknown.join(", ")}. Il doit être mis à jour.`
          : "Deck invalide, le précédent est conservé.",
      );
      return;
    }
    client.deck = deck;
    if (client.identity.kind === "account") saveDeck(client.identity.key, deck);
  };
  const roomOf = () => (client.roomId ? rooms.get(client.roomId) : undefined);
  const fail = (msg: string | null) => msg && client.send({ type: "error", msg });
  const sendProfile = () => {
    const p = profileOf(client.identity);
    client.send({ type: "profile", trophies: p.trophies, best: p.best, wins: p.wins, losses: p.losses });
  };
  const signIn = (account: Account, key: string, token?: string) => {
    client.identity = { kind: "account", key };
    client.name = account.name;
    if (account.deck) client.deck = sanitizeDeck(account.deck);
    else saveDeck(key, client.deck);
    client.send({ type: "auth", account: { name: account.name }, token, deck: client.deck });
    sendProfile();
    roomOf()?.refreshClient(client);
    publishRooms();
  };

  ws.on("message", (raw) => {
    const verdict = budget.allow();
    if (verdict === "kick") {
      ws.close(1008, "Trop de messages");
      return;
    }
    if (verdict === "drop") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const room = roomOf();
    switch (msg.type) {
      case "hello": {
        if (msg.deck) acceptDeck(msg.deck);
        if (client.identity.kind === "account") {
          sendProfile();
          break;
        }
        const wanted = String(msg.name ?? "").trim().slice(0, 16) || "Joueur";
        if (isRegistered(wanted)) {
          client.name = `${wanted} (invité)`.slice(0, 24);
          client.identity = { kind: "guest", name: client.name };
          fail(`Le pseudo « ${wanted} » est protégé par un mot de passe : connecte-toi pour l'utiliser.`);
        } else {
          client.name = wanted;
          client.identity = { kind: "guest", name: wanted };
        }
        sendProfile();
        roomOf()?.refreshClient(client);
        publishRooms();
        break;
      }
      case "deck":
        acceptDeck(msg.deck);
        break;
      case "register": {
        const blocked = authBlocked(ip, "register");
        if (blocked) return void client.send({ type: "authError", msg: blocked });
        const r = register(String(msg.name ?? ""), String(msg.password ?? ""));
        if (typeof r === "string") client.send({ type: "authError", msg: r });
        else signIn(r.account, r.key, r.token);
        break;
      }
      case "login": {
        const key = keyOf(String(msg.name ?? ""));
        const blocked = authBlocked(ip, key);
        if (blocked) return void client.send({ type: "authError", msg: blocked });
        const r = login(String(msg.name ?? ""), String(msg.password ?? ""));
        if (typeof r === "string") {
          authFailed(key);
          client.send({ type: "authError", msg: r });
        } else {
          authSucceeded(key);
          signIn(r.account, r.key, r.token);
        }
        break;
      }
      case "resume": {
        const r = resume(String(msg.token ?? ""));
        if (r) signIn(r.account, r.key);
        else client.send({ type: "auth", account: null });
        break;
      }
      case "logout":
        if (msg.token) logout(String(msg.token));
        client.identity = { kind: "guest", name: "Joueur" };
        client.name = "Joueur";
        client.send({ type: "auth", account: null });
        sendProfile();
        roomOf()?.refreshClient(client);
        break;
      case "ready":
        if (room) room.setReady(client, !!msg.ready);
        break;
      case "create":
        createRoom(client, msg.mode === "2v2" ? "2v2" : "1v1");
        break;
      case "solo": {
        const r = createRoom(client, msg.mode === "2v2" ? "2v2" : "1v1", true);
        if (r) fail(r.start());
        break;
      }
      case "practice": {
        const bot = String(msg.bot ?? "");
        if (bot !== "classic" && !STYLES.some((st) => st.id === bot)) return fail("Bot inconnu");
        const r = createRoom(client, "1v1", true);
        if (r) {
          r.practice = bot;
          fail(r.start());
        }
        break;
      }
      case "join": {
        const target = rooms.get(String(msg.roomId).toUpperCase());
        if (!target) return fail("Salon introuvable");
        if (target === room) return;
        leaveRoom(client);
        fail(target.addClient(client));
        break;
      }
      case "leave":
        leaveRoom(client);
        break;
      case "addBot":
        if (room && room.hostId === client.id) fail(room.addBot());
        break;
      case "removeBot":
        if (room && room.hostId === client.id) room.removeBot();
        break;
      case "team":
        if (room) fail(room.switchTeam(client));
        break;
      case "mode":
        if (room && room.hostId === client.id) room.setMode(msg.mode === "2v2" ? "2v2" : "1v1");
        break;
      case "start":
        if (room && room.hostId === client.id) fail(room.start());
        break;
      case "play":
        if (room && msg.card in CARDS) fail(room.play(client, msg.card, Number(msg.x), Number(msg.y)));
        break;
      case "aim":
        if (room) room.aim(client, msg.card && msg.card in CARDS ? msg.card : null, Number(msg.x), Number(msg.y));
        break;
      case "emote":
        if (room) room.emote(client, String(msg.emote));
        else if (client.spectating) rooms.get(client.spectating)?.spectatorEmote(client, String(msg.emote));
        break;
      case "spectate": {
        const target = rooms.get(String(msg.roomId).toUpperCase());
        if (!target) return fail("Partie introuvable");
        leaveRoom(client);
        fail(target.addSpectator(client));
        publishRooms();
        break;
      }
      case "stopSpectating":
        stopSpectating(client);
        publishRooms();
        break;
    }
  });

  ws.on("close", () => {
    leaveRoom(client);
    clients.delete(id);
    closeConnection(ip);
  });
});

wss.on("error", () => {});

function printAddresses(port: number) {
  console.log(`\n  ${GAME_NAME} — serveur lancé sur le port ${port}\n`);
  console.log(`  Sur cette machine :   http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  Sur le réseau local : http://${a.address}:${port}`);
    }
  }
  console.log("");
}

function listen(i: number) {
  const port = PORTS[i];
  const onListening = () => {
    http.off("error", onError);
    const addr = http.address();
    printAddresses(typeof addr === "object" && addr ? addr.port : port);
  };
  const onError = (err: NodeJS.ErrnoException) => {
    http.off("listening", onListening);
    const blocked = err.code === "EACCES" || err.code === "EADDRINUSE";
    const reason = err.code === "EADDRINUSE" ? "déjà utilisé" : "bloqué par le système";
    if (blocked && i + 1 < PORTS.length) {
      const next = PORTS[i + 1] || "automatique";
      console.log(`  Port ${port} ${reason}, essai du port ${next}…`);
      listen(i + 1);
      return;
    }
    console.error(`\n  Impossible de démarrer le serveur sur le port ${port} (${err.code ?? err.message}).`);
    console.error(`  Essaie un autre port, par exemple sous PowerShell :  $env:PORT=8080; npm start\n`);
    process.exit(1);
  };
  http.once("error", onError);
  http.once("listening", onListening);
  http.listen(port, "0.0.0.0");
}

listen(0);
