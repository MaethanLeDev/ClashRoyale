import "./style.css";
import { CARD_IDS, CARDS, DECK_SIZE, DEFAULT_DECK, type CardDef, type CardId } from "../../shared/cards";
import { GAME_NAME, RESOURCE_NAME } from "../../shared/constants";
import type { Mode, PlayerSnap, RoomInfo, ServerMsg, Team } from "../../shared/protocol";
import { GameView } from "./game/view";
import { loadHeads } from "./game/textures";
import { Hud } from "./hud";
import { Net } from "./net";
import { cardEl, h, toast } from "./ui";

const ui = document.getElementById("ui")!;
const stage = document.getElementById("stage")!;
const net = new Net();

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible */
    }
  },
};

function loadDeck(): CardId[] {
  try {
    const raw = JSON.parse(store.get("deck") ?? "null");
    if (Array.isArray(raw) && raw.length === DECK_SIZE && new Set(raw).size === DECK_SIZE && raw.every((c) => c in CARDS)) return raw;
  } catch {
    /* deck invalide */
  }
  return DEFAULT_DECK.slice();
}

const app = {
  name: store.get("name") ?? "",
  deck: loadDeck(),
  myId: "",
  rooms: [] as RoomInfo[],
  room: null as RoomInfo | null,
  screen: "home" as "home" | "deck" | "room" | "game",
  connected: false,
  game: null as { view: GameView; hud: Hud } | null,
};

let current: HTMLElement | null = null;
const connBadge = h("div", { class: "conn" }, h("span", { class: "dot" }), "Connexion…");

function mount(el: HTMLElement) {
  current?.remove();
  current = el;
  ui.prepend(el);
}

function updateConn() {
  connBadge.classList.toggle("off", !app.connected);
  connBadge.lastChild!.textContent = app.connected ? "Connecté au serveur" : "Serveur injoignable, reconnexion…";
  connBadge.style.display = app.screen === "game" ? "none" : "";
}

function ensureName(): boolean {
  if (app.name.trim()) return true;
  toast(ui, "Choisis d'abord un pseudo !");
  (document.querySelector("#pseudo") as HTMLInputElement | null)?.focus();
  return false;
}

// ---------- Home ----------

function renderHome() {
  app.screen = "home";
  const pseudo = h("input", { id: "pseudo", type: "text", maxlength: "16", placeholder: "Ton pseudo", value: app.name }) as HTMLInputElement;
  pseudo.addEventListener("input", () => {
    app.name = pseudo.value.trim().slice(0, 16);
    store.set("name", app.name);
  });
  pseudo.addEventListener("change", () => net.send({ type: "hello", name: app.name, deck: app.deck }));

  const code = h("input", { type: "text", maxlength: "4", placeholder: "CODE", style: { textTransform: "uppercase", letterSpacing: "4px" } }) as HTMLInputElement;
  const join = () => {
    if (!ensureName()) return;
    const v = code.value.trim().toUpperCase();
    if (v.length !== 4) return toast(ui, "Le code fait 4 lettres");
    net.send({ type: "hello", name: app.name, deck: app.deck });
    net.send({ type: "join", roomId: v });
  };
  code.addEventListener("keydown", (e) => e.key === "Enter" && join());

  const go = (fn: () => void) => () => {
    if (!ensureName()) return;
    net.send({ type: "hello", name: app.name, deck: app.deck });
    fn();
  };

  const roomsList = h("div", { class: "rooms", id: "rooms" });
  const deckPreview = h("div", { class: "deck-preview" }, ...app.deck.map((c) => cardEl(c, { showName: false })));

  const el = h(
    "div",
    { class: "screen" },
    h(
      "div",
      { class: "screen-inner" },
      h("div", { class: "logo" }, "USMB", h("small", {}, "ARENA")),
      h("div", { class: "tagline" }, "Le jeu de cartes en temps réel de l'IUT. Pose tes potes, rase les tours."),
      h(
        "div",
        { class: "home-grid" },
        h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "panel" },
            h("h2", {}, "Joueur"),
            h("div", { class: "field" }, h("label", {}, "Pseudo"), pseudo),
            h("h2", { style: { marginTop: "18px" } }, "Jouer"),
            h(
              "div",
              { class: "stack" },
              h("button", { class: "btn gold big", onclick: go(() => net.send({ type: "solo", mode: "1v1" })) }, "⚔️  Entraînement 1v1 contre un bot"),
              h(
                "div",
                { class: "row" },
                h("button", { class: "btn", onclick: go(() => net.send({ type: "create", mode: "1v1" })) }, "Créer un salon 1v1"),
                h("button", { class: "btn", onclick: go(() => net.send({ type: "create", mode: "2v2" })) }, "Créer un salon 2v2"),
              ),
              h("div", { class: "field", style: { marginBottom: "0" } }, code, h("button", { class: "btn small", onclick: join }, "Rejoindre")),
            ),
          ),
          h(
            "div",
            { class: "panel" },
            h("div", { class: "topbar", style: { marginBottom: "10px" } }, h("h2", { style: { margin: "0", flex: "1" } }, "Mon deck"), h("button", { class: "btn small ghost", onclick: renderDeck }, "Voir les cartes")),
            deckPreview,
          ),
        ),
        h(
          "div",
          { class: "stack" },
          h("div", { class: "panel" }, h("h2", {}, "Salons ouverts sur le réseau"), roomsList),
          h(
            "div",
            { class: "panel help" },
            h("h2", {}, "Comment jouer"),
            h("div", {}, "Glisse une carte de ta main sur ton côté de l'arène, ou touche-la puis touche l'arène. Chaque carte coûte de la ", h("b", {}, RESOURCE_NAME.toLowerCase()), ", qui se recharge toute seule (x2 pendant la dernière minute)."),
            h("div", { style: { marginTop: "8px" } }, "Une tour d'angle détruite = ", h("b", {}, "1 couronne"), ". La tour principale = ", h("b", {}, "victoire immédiate"), ". Quand une tour d'angle tombe, tu peux aussi poser tes troupes dans la zone devant elle."),
          ),
        ),
      ),
    ),
    connBadge,
  );
  mount(el);
  renderRooms();
  updateConn();
}

function renderRooms() {
  const list = document.getElementById("rooms");
  if (!list) return;
  const open = app.rooms.filter((r) => r.status === "lobby");
  const playing = app.rooms.filter((r) => r.status === "playing");
  if (!app.rooms.length) {
    list.replaceChildren(h("div", { class: "empty" }, "Aucun salon pour l'instant. Crée-en un et donne le code à tes potes !"));
    return;
  }
  list.replaceChildren(
    ...[...open, ...playing].map((r) => {
      const host = r.players.find((p) => p.id === r.hostId)?.name ?? "?";
      const humans = r.players.filter((p) => !p.bot).length;
      const cap = r.mode === "1v1" ? 2 : 4;
      return h(
        "div",
        { class: "room-item" },
        h("div", { class: "code" }, r.id),
        h("div", { class: "meta" }, `${r.mode} · ${host} · ${humans}/${cap} joueurs${r.status === "playing" ? " · en jeu" : ""}`),
        r.status === "lobby"
          ? h("button", {
              class: "btn small",
              onclick: () => {
                if (!ensureName()) return;
                net.send({ type: "hello", name: app.name, deck: app.deck });
                net.send({ type: "join", roomId: r.id });
              },
            }, "Rejoindre")
          : null,
      );
    }),
  );
}

// ---------- Deck ----------

function fmt(v: number, unit = "") {
  return `${Math.round(v * 100) / 100}${unit}`;
}

function cardStats(c: CardDef): [string, string][] {
  const out: [string, string][] = [["Coût", `${c.cost} ${RESOURCE_NAME.toLowerCase()}`]];
  if (c.unit) {
    const u = c.unit;
    out.push(["Points de vie", String(u.hp)]);
    if (u.towerKiller) out.push(["Dégâts", "Rase la tour"]);
    else out.push(["Dégâts", String(u.damage)]);
    if (!u.towerKiller) out.push(["Dégâts/s", fmt(u.damage / u.hitSpeed)]);
    out.push(["Vitesse d'attaque", fmt(u.hitSpeed, " s")]);
    out.push(["Portée", u.range >= 2 ? fmt(u.range) : "Mêlée"]);
    if (u.speed > 0) out.push(["Vitesse", u.speed >= 1.5 ? "Très rapide" : u.speed >= 1.1 ? "Rapide" : u.speed >= 0.7 ? "Moyenne" : "Très lente"]);
    out.push(["Cible", u.targetsBuildingsOnly ? "Bâtiments" : "Sol"]);
    if (c.count > 1) out.push(["Nombre", `x${c.count}`]);
    if (u.lifetime) out.push(["Durée de vie", `${u.lifetime} s`]);
  }
  if (c.spell) {
    out.push(["Dégâts", String(c.spell.damage)]);
    out.push(["Dégâts aux tours", String(c.spell.towerDamage)]);
    out.push(["Gel", `${c.spell.freeze} s`]);
    out.push(["Rayon", fmt(c.spell.radius)]);
  }
  if (c.deployAnywhere) out.push(["Placement", "N'importe où"]);
  return out;
}

let swapIn: CardId | null = null;

function saveDeck() {
  store.set("deck", JSON.stringify(app.deck));
  if (app.deck.length === DECK_SIZE) net.send({ type: "deck", deck: app.deck });
}

function deckAction(id: CardId) {
  const inDeck = app.deck.includes(id);
  if (swapIn) {
    if (inDeck) {
      app.deck[app.deck.indexOf(id)] = swapIn;
      swapIn = null;
      saveDeck();
    } else {
      swapIn = id;
    }
    renderDeck();
    return;
  }
  showCard(id);
}

function showCard(id: CardId) {
  const c = CARDS[id];
  const close = () => backdrop.remove();
  const inDeck = app.deck.includes(id);
  const onDeckScreen = app.screen === "deck";
  let action: HTMLElement | null = null;
  if (onDeckScreen) {
    if (inDeck) {
      action = h("button", {
        class: "btn small red",
        onclick: () => {
          app.deck = app.deck.filter((x) => x !== id);
          saveDeck();
          close();
          renderDeck();
        },
      }, "Retirer du deck");
    } else if (app.deck.length < DECK_SIZE) {
      action = h("button", {
        class: "btn small gold",
        onclick: () => {
          app.deck.push(id);
          saveDeck();
          close();
          renderDeck();
        },
      }, "Ajouter au deck");
    } else {
      action = h("button", {
        class: "btn small gold",
        onclick: () => {
          swapIn = id;
          close();
          renderDeck();
        },
      }, "Échanger avec une carte du deck");
    }
  }
  const backdrop = h(
    "div",
    { class: "modal-backdrop", onclick: (e: Event) => e.target === backdrop && close() },
    h(
      "div",
      { class: "modal panel" },
      h(
        "div",
        { class: "card-detail" },
        cardEl(id),
        h(
          "div",
          {},
          h("h3", {}, c.title),
          h("span", { class: "role" }, `${c.role} · ${c.rarity}`),
          h("p", {}, c.description),
          h("div", { class: "stats" }, ...cardStats(c).map(([k, v]) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)))),
        ),
      ),
      h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "16px" } }, action, h("button", { class: "btn small ghost", onclick: close }, "Fermer")),
    ),
  );
  ui.appendChild(backdrop);
}

function renderDeck() {
  app.screen = "deck";
  const tile = (id: CardId) => {
    const el = cardEl(id);
    el.addEventListener("click", () => deckAction(id));
    if (swapIn && app.deck.includes(id)) el.classList.add("swap-target");
    if (swapIn === id) el.classList.add("swap-source");
    return el;
  };
  const slots: HTMLElement[] = app.deck.map(tile);
  while (slots.length < DECK_SIZE) slots.push(h("div", { class: "card empty-card" }, h("span", {}, "+")));
  const collection = CARD_IDS.filter((c) => !app.deck.includes(c));
  const avg = app.deck.length ? app.deck.reduce((s, c) => s + CARDS[c].cost, 0) / app.deck.length : 0;
  const back = () => {
    if (app.deck.length !== DECK_SIZE) return toast(ui, `Ton deck doit contenir ${DECK_SIZE} cartes`);
    swapIn = null;
    renderHome();
  };
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "screen-inner" },
        h("div", { class: "topbar" }, h("button", { class: "btn small ghost", onclick: back }, "← Retour"), h("h1", {}, "Mon deck")),
        swapIn
          ? h(
              "div",
              { class: "panel swap-banner" },
              h("span", {}, `Touche la carte du deck à remplacer par ${CARDS[swapIn].name}`),
              h("button", { class: "btn small ghost", onclick: () => ((swapIn = null), renderDeck()) }, "Annuler"),
            )
          : null,
        h(
          "div",
          { class: "panel" },
          h("div", { class: "help", style: { marginBottom: "14px" } }, `${app.deck.length}/${DECK_SIZE} cartes · coût moyen ${avg.toFixed(1)} ${RESOURCE_NAME.toLowerCase()}. Touche une carte pour voir ses stats ou la changer.`),
          h("div", { class: "deck-grid" }, ...slots),
        ),
        h(
          "div",
          { class: "panel", style: { marginTop: "18px" } },
          h("h2", {}, "Collection"),
          collection.length
            ? h("div", { class: "deck-grid" }, ...collection.map(tile))
            : h("div", { class: "empty" }, "Toutes tes cartes sont dans ton deck."),
        ),
      ),
      connBadge,
    ),
  );
  updateConn();
}

// ---------- Room ----------

function renderRoom() {
  const room = app.room;
  if (!room) return renderHome();
  app.screen = "room";
  const isHost = room.hostId === app.myId;
  const per = room.mode === "1v1" ? 1 : 2;
  const col = (team: Team) => {
    const players = room.players.filter((p) => p.team === team);
    const slots: HTMLElement[] = players.map((p) =>
      h(
        "div",
        { class: `slot ${p.id === app.myId ? "me" : ""}` },
        h("div", { class: "avatar" }, p.bot ? "🤖" : p.name.slice(0, 1).toUpperCase()),
        h("span", {}, p.name),
        p.id === room.hostId ? h("span", { class: "tag" }, "Hôte") : p.bot ? h("span", { class: "tag" }, "Bot") : null,
      ),
    );
    while (slots.length < per) slots.push(h("div", { class: "slot empty-slot" }, "En attente d'un joueur… (sinon un bot)"));
    return h("div", { class: `team-col t${team}` }, h("h3", {}, team === 0 ? "Équipe Bleue" : "Équipe Rouge"), ...slots);
  };
  const modeSel = h(
    "div",
    { class: "segmented" },
    ...(["1v1", "2v2"] as Mode[]).map((m) =>
      h("button", { class: room.mode === m ? "on" : "", disabled: !isHost ? "true" : undefined, onclick: () => isHost && net.send({ type: "mode", mode: m }) }, m),
    ),
  );
  const leave = () => net.send({ type: "leave" });
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "screen-inner" },
        h("div", { class: "topbar" }, h("button", { class: "btn small ghost", onclick: leave }, "← Quitter"), h("h1", {}, "Salon"), modeSel),
        h("div", { class: "room-code" }, h("div", { class: "label" }, "Code du salon"), h("div", { class: "value" }, room.id)),
        h("div", { class: "panel" }, h("div", { class: "teams" }, col(0), h("div", { class: "vs" }, "VS"), col(1))),
        h(
          "div",
          { class: "row", style: { marginTop: "18px" } },
          h("button", { class: "btn ghost", onclick: () => net.send({ type: "team" }) }, "Changer d'équipe"),
          isHost ? h("button", { class: "btn ghost", onclick: () => net.send({ type: "addBot" }) }, "+ Bot") : null,
          isHost ? h("button", { class: "btn ghost", onclick: () => net.send({ type: "removeBot" }) }, "− Bot") : null,
        ),
        h(
          "div",
          { style: { marginTop: "18px", textAlign: "center" } },
          isHost
            ? h("button", { class: "btn gold big", onclick: () => net.send({ type: "start" }) }, "Lancer la partie")
            : h("div", { class: "help" }, "En attente que l'hôte lance la partie…"),
          h("div", { class: "help", style: { marginTop: "10px" } }, "Les places vides sont complétées par des bots au lancement."),
        ),
      ),
      connBadge,
    ),
  );
  updateConn();
}

// ---------- Game ----------

function startGame(team: Team, players: PlayerSnap[]) {
  stopGame();
  app.screen = "game";
  current?.remove();
  current = null;
  updateConn();
  let view: GameView | null = null;
  const hud = new Hud(ui, {
    team,
    myId: app.myId,
    players,
    onCardDown: (card, e) => view?.startDrag(card, e),
    onEmote: (emote) => net.send({ type: "emote", emote }),
    onBack: () => {
      stopGame();
      if (app.room) renderRoom();
      else renderHome();
    },
  });
  view = new GameView({
    container: stage,
    overlay: hud.overlay,
    team,
    getInsets: () => ({ top: hud.topHeight(), bottom: hud.bottomHeight() }),
    onPlay: (card, x, y) => net.send({ type: "play", card, x, y }),
    onSelect: (card, dragging) => hud.setSelected(card, dragging),
    onToast: (msg) => hud.toast(msg),
  });
  app.game = { view, hud };
  requestAnimationFrame(() => view.resize());
}

function stopGame() {
  if (!app.game) return;
  app.game.view.dispose();
  app.game.hud.destroy();
  app.game = null;
}

// ---------- Network ----------

net.onStatus = (ok) => {
  app.connected = ok;
  updateConn();
  if (!ok && app.screen === "game") {
    stopGame();
    renderHome();
  }
};

net.onOpen = () => {
  if (app.name) net.send({ type: "hello", name: app.name, deck: app.deck });
};

net.on((msg: ServerMsg) => {
  switch (msg.type) {
    case "welcome":
      app.myId = msg.id;
      break;
    case "rooms":
      app.rooms = msg.rooms;
      if (app.screen === "home") renderRooms();
      break;
    case "room":
      app.room = msg.room;
      if (app.screen === "game") break;
      if (msg.room) renderRoom();
      else if (app.screen === "room") renderHome();
      break;
    case "start":
      startGame(msg.team, msg.players);
      break;
    case "state":
      if (app.game) {
        app.game.view.applyState(msg);
        app.game.hud.update(msg);
      }
      break;
    case "end":
      app.game?.hud.showEnd(msg.winner, msg.crowns);
      break;
    case "emote":
      app.game?.view.showEmote(msg.tm, msg.name, msg.emote);
      break;
    case "error":
      if (app.game) app.game.hud.toast(msg.msg);
      else toast(ui, msg.msg);
      break;
  }
});

document.title = GAME_NAME;
loadHeads().then(() => {
  renderHome();
  net.connect();
});
