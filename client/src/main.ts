import "./style.css";
import "./menu.css";
import { DECK_SIZE } from "../../shared/cards";
import { GAME_NAME } from "../../shared/constants";
import type { Mode, PlayerSnap, ServerMsg, Team } from "../../shared/protocol";
import { GameView } from "./game/view";
import { loadHeads } from "./game/textures";
import { loadModels } from "./game/glb";
import { Hud } from "./hud";
import { Menu } from "./menu";
import { authFailed, authSucceeded } from "./account";
import { closeAllSheets } from "./sheet";
import { app, emit, hello, net, store } from "./state";
import { h, toast } from "./ui";

const ui = document.getElementById("ui")!;
const stage = document.getElementById("stage")!;

let menu: Menu | null = null;
let game: { view: GameView; hud: Hud; solo: boolean } | null = null;

const connBanner = h("div", { class: "conn-banner", role: "status" }, h("i"), "Connexion au serveur…");
ui.appendChild(connBanner);

function updateConn() {
  connBanner.classList.toggle("show", !app.connected && !game);
}

// ---------- Partie ----------

function startGame(team: Team, players: PlayerSnap[], arena: number, mode: Mode) {
  stopGame();
  closeAllSheets();
  app.inGame = true;
  const solo = !!app.room?.solo || !app.room;
  menu?.hide();
  updateConn();
  let view: GameView | null = null;
  const hud = new Hud(ui, {
    team,
    myId: app.myId,
    players,
    backLabel: solo ? "Continuer" : "Retour au salon",
    onCardDown: (card, e) => view?.startDrag(card, e),
    onEmote: (emote) => net.send({ type: "emote", emote }),
    onBack: () => {
      const wasSolo = game?.solo ?? solo;
      stopGame();
      if (wasSolo) net.send({ type: "leave" });
      menu?.show();
    },
  });
  view = new GameView({
    container: stage,
    overlay: hud.overlay,
    team,
    arena,
    mode,
    // L'hologramme n'a d'intérêt que pour un allié humain
    onAim: mode === "2v2" && players.some((p) => p.tm === team && p.id !== app.myId && !p.bot)
      ? (card, x, y) => net.send(card ? { type: "aim", card, x, y } : { type: "aim", card: null })
      : undefined,
    getInsets: () => ({ top: hud.topHeight(), bottom: hud.bottomHeight() }),
    onPlay: (card, x, y) => net.send({ type: "play", card, x, y }),
    onSelect: (card, dragging) => hud.setSelected(card, dragging),
    onToast: (msg) => hud.toast(msg),
  });
  game = { view, hud, solo };
  requestAnimationFrame(() => view.resize());
}

function stopGame() {
  app.inGame = false;
  if (!game) return;
  game.view.dispose();
  game.hud.destroy();
  game = null;
  updateConn();
}

// ---------- Réseau ----------

net.onStatus = (ok) => {
  app.connected = ok;
  updateConn();
  emit("conn");
  if (!ok && game) {
    stopGame();
    app.room = null;
    menu?.show();
  }
};

net.onOpen = () => {
  const token = store.get("authToken");
  if (token) net.send({ type: "resume", token });
  if (app.name || token) hello();
};

net.on((msg: ServerMsg) => {
  switch (msg.type) {
    case "welcome":
      app.myId = msg.id;
      break;
    case "rooms":
      app.rooms = msg.rooms;
      emit("rooms");
      break;
    case "room":
      app.room = msg.room;
      if (!game) emit("room");
      break;
    case "start":
      menu?.setPlayBusy(true);
      assets.then(() => startGame(msg.team, msg.players, msg.arena ?? 0, msg.mode));
      break;
    case "state":
      if (game) {
        game.view.applyState(msg);
        game.hud.update(msg);
      }
      break;
    case "end":
      if (game) {
        const g = game;
        g.view.celebrate(msg.winner);
        setTimeout(() => g.hud.showEnd(msg.winner, msg.crowns, msg.trophies), 1700);
      }
      break;
    case "auth":
      if (msg.account) {
        const fresh = app.account !== msg.account.name;
        app.account = msg.account.name;
        app.name = msg.account.name;
        store.set("name", app.name);
        if (msg.token) store.set("authToken", msg.token);
        if (msg.deck && msg.deck.length === DECK_SIZE) {
          app.deck = msg.deck.slice();
          store.set("deck", JSON.stringify(app.deck));
          emit("deck");
        }
        authSucceeded();
        if (fresh && msg.token) toast(ui, `Bienvenue ${app.account} !`, true);
      } else {
        if (app.account) toast(ui, "Déconnecté");
        app.account = null;
        store.remove("authToken");
      }
      emit("auth");
      break;
    case "authError":
      if (!authFailed(msg.msg)) toast(ui, msg.msg);
      break;
    case "profile":
      app.profile = { trophies: msg.trophies, best: msg.best, wins: msg.wins, losses: msg.losses };
      emit("profile");
      break;
    case "emote":
      game?.view.showEmote(msg.tm, msg.name, msg.emote);
      break;
    case "error":
      menu?.setPlayBusy(false);
      if (game) game.hud.toast(msg.msg);
      else toast(ui, msg.msg);
      break;
  }
});

document.title = GAME_NAME;
menu = new Menu(ui);
updateConn();
// Les modèles 3D se chargent pendant qu'on navigue dans les menus ; une partie attend qu'ils soient prêts.
const assets = Promise.all([loadHeads(), loadModels()]).catch(() => undefined);
net.connect();
