import "./style.css";
import { CARD_IDS, CARDS, DECK_SIZE, DEFAULT_DECK, type CardDef, type CardId } from "../../shared/cards";
import { GAME_NAME, RESOURCE_NAME } from "../../shared/constants";
import type { Mode, PlayerSnap, RoomInfo, ServerMsg, Team } from "../../shared/protocol";
import { GameView } from "./game/view";
import { loadHeads } from "./game/textures";
import { loadModels } from "./game/glb";
import { Hud } from "./hud";
import { Net } from "./net";
import { ARENAS, arenaFor } from "../../shared/arenas";
import { createPreview, type Preview } from "./preview";
import { createShowcase, hasShowcase, type Showcase } from "./game/showcase";
import { getTilt, onTilt, setTilt } from "./settings";
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
  remove(key: string) {
    try {
      localStorage.removeItem(key);
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
  account: null as string | null,
  deck: loadDeck(),
  myId: "",
  rooms: [] as RoomInfo[],
  room: null as RoomInfo | null,
  screen: "home" as "home" | "deck" | "room" | "game" | "road",
  profile: { trophies: 0, best: 0, wins: 0, losses: 0 },
  connected: false,
  game: null as { view: GameView; hud: Hud } | null,
};

let current: HTMLElement | null = null;
const connBadge = h("div", { class: "conn" }, h("span", { class: "dot" }), "Connexion…");

let diorama: { arena: number; box: HTMLElement; preview: Preview | null } | null = null;

function disposeDiorama() {
  diorama?.preview?.dispose();
  diorama = null;
}

function dioramaFor(arena: number): HTMLElement {
  if (diorama && diorama.arena === arena) return diorama.box;
  disposeDiorama();
  const box = h("div", { class: "diorama" });
  const d: { arena: number; box: HTMLElement; preview: Preview | null } = { arena, box, preview: null };
  diorama = d;
  requestAnimationFrame(() => {
    if (diorama === d) d.preview = createPreview(box, arena, 0.12);
  });
  return box;
}

function mount(el: HTMLElement, keepDiorama = false) {
  if (!keepDiorama) disposeDiorama();
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

function buildProfileBar(): HTMLElement {
  const arena = arenaFor(app.profile.trophies);
  const bar = h(
    "div",
    { class: "profile-bar", id: "profile-bar", onclick: renderRoad },
    h("div", { class: "icon" }, arena.icon),
    h("div", { class: "info" }, h("div", { class: "trophies" }, `🏆 ${app.profile.trophies}`), h("div", { class: "arena-name" }, `Arène ${arena.id + 1} · ${arena.name}`)),
    h("span", { class: "btn small ghost" }, "Voie des trophées"),
  );
  bar.style.setProperty("--a1", arena.colors[0]);
  bar.style.setProperty("--a2", arena.colors[1]);
  return bar;
}

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
  const profileBar = buildProfileBar();

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
            profileBar,
            app.account
              ? h(
                  "div",
                  { class: "account-row" },
                  h("span", {}, "👤 Connecté : ", h("b", {}, app.account)),
                  h("button", { class: "btn small ghost", onclick: doLogout }, "Se déconnecter"),
                )
              : h(
                  "div",
                  {},
                  h("div", { class: "field" }, h("label", {}, "Pseudo"), pseudo),
                  h(
                    "div",
                    { class: "account-row" },
                    h("span", { class: "help" }, "Tu joues en invité."),
                    h("button", { class: "btn small ghost", onclick: () => showAuth("login") }, "Se connecter"),
                    h("button", { class: "btn small", onclick: () => showAuth("register") }, "Créer un compte"),
                  ),
                ),
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
          h(
            "div",
            { class: "panel" },
            h("div", { class: "topbar", style: { marginBottom: "0" } }, h("h2", { style: { margin: "0", flex: "1" } }, "Réglages"), h("button", { class: "btn small ghost", onclick: () => showCameraSettings() }, "🎥 Caméra")),
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
        h(
          "div",
          { class: "meta" },
          r.status === "playing"
            ? `${r.mode} · ${r.players.map((p) => p.name).join(" vs ")} · en jeu${r.spectators ? ` · 👁 ${r.spectators}` : ""}`
            : `${r.mode} · ${host} · ${humans}/${cap} joueurs`,
        ),
        r.status === "lobby"
          ? h("button", {
              class: "btn small",
              onclick: () => {
                if (!ensureName()) return;
                net.send({ type: "hello", name: app.name, deck: app.deck });
                net.send({ type: "join", roomId: r.id });
              },
            }, "Rejoindre")
          : h("button", {
              class: "btn small ghost",
              onclick: () => {
                if (!ensureName()) return;
                net.send({ type: "hello", name: app.name, deck: app.deck });
                net.send({ type: "spectate", roomId: r.id });
              },
            }, "👁 Regarder"),
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
  let showcase: Showcase | null = null;
  const close = () => {
    showcase?.dispose();
    backdrop.remove();
  };
  const stage = hasShowcase(id) ? h("div", { class: "showcase" }, h("span", { class: "showcase-hint" }, "Glisse pour tourner")) : null;
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
      stage,
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
  if (stage) showcase = createShowcase(stage, id);
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
    if (app.room) renderRoom();
    else renderHome();
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

// ---------- Trophées & réglages ----------

function previewModal(title: string, arena: number, extra: HTMLElement | null, wide = false) {
  let preview: Preview | null = null;
  const box = h("div", { class: `preview-box ${wide ? "wide" : ""}` });
  const close = () => {
    preview?.dispose();
    backdrop.remove();
  };
  const backdrop = h(
    "div",
    { class: "modal-backdrop", onclick: (e: Event) => e.target === backdrop && close() },
    h(
      "div",
      { class: "modal panel" },
      h("h2", {}, title),
      box,
      extra,
      h("div", { style: { textAlign: "right", marginTop: "14px" } }, h("button", { class: "btn small", onclick: close }, "Fermer")),
    ),
  );
  ui.appendChild(backdrop);
  requestAnimationFrame(() => (preview = createPreview(box, arena)));
}

function showCameraSettings() {
  const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(getTilt() * 100)) }) as HTMLInputElement;
  slider.addEventListener("input", () => setTilt(Number(slider.value) / 100));
  const off = onTilt((t) => (slider.value = String(Math.round(t * 100))));
  const extra = h(
    "div",
    {},
    h("div", { class: "tilt-row" }, h("span", {}, "Vue du dessus"), slider, h("span", {}, "Immersive")),
    h("div", { class: "help", style: { marginTop: "10px" } }, "Sur PC, la molette de la souris règle aussi la caméra en pleine partie. En jeu, le bouton 🎥 ouvre ce réglage."),
  );
  previewModal("Caméra", arenaFor(app.profile.trophies).id, extra);
  const obs = new MutationObserver(() => {
    if (!extra.isConnected) {
      off();
      obs.disconnect();
    }
  });
  obs.observe(ui, { childList: true });
}

function renderRoad() {
  app.screen = "road";
  const t = app.profile.trophies;
  const steps: HTMLElement[] = [];
  ARENAS.forEach((a, i) => {
    const next = ARENAS[i + 1];
    const unlocked = t >= a.trophies;
    const current = unlocked && (!next || t < next.trophies);
    const step = h(
      "div",
      { class: `road-step ${unlocked ? "" : "locked"} ${current ? "current" : ""}` },
      h("div", { class: "big-icon" }, a.icon),
      h("div", {}, h("h3", {}, `Arène ${a.id + 1} · ${a.name}`), h("p", {}, a.tagline)),
      h(
        "div",
        { class: "actions", style: { display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" } },
        h("div", { class: "req" }, unlocked ? (current ? "Tu es ici" : "Débloquée") : `🏆 ${a.trophies}`),
        h("button", { class: "btn small ghost", onclick: () => previewModal(a.name, a.id, null, true) }, "Aperçu 3D"),
      ),
    );
    step.style.setProperty("--a1", a.colors[0]);
    step.style.setProperty("--a2", a.colors[1]);
    steps.push(step);
    if (next) {
      const span = next.trophies - a.trophies;
      const frac = Math.max(0, Math.min(1, (t - a.trophies) / span));
      const fill = h("div", { class: "fill" });
      fill.style.height = `${frac * 100}%`;
      steps.push(h("div", { class: "road-link" }, fill));
    }
  });
  const p = app.profile;
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "screen-inner", style: { maxWidth: "720px" } },
        h("div", { class: "topbar" }, h("button", { class: "btn small ghost", onclick: renderHome }, "← Retour"), h("h1", {}, "Voie des trophées")),
        h(
          "div",
          { class: "panel help", style: { marginBottom: "18px" } },
          h("b", {}, `🏆 ${p.trophies} trophées`),
          ` · record ${p.best} · ${p.wins} victoires, ${p.losses} défaites. Victoire +30, défaite −20 (moitié contre des bots). La partie se joue dans l'arène du joueur le mieux classé.`,
        ),
        h("div", { class: "road" }, ...steps),
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
        p.account ? h("span", { class: "tag", title: "Compte" }, "👤") : null,
        p.id === room.hostId
          ? h("span", { class: "tag" }, "Hôte")
          : p.bot
            ? h("span", { class: "tag" }, "Bot")
            : h("span", { class: `tag ${p.ready ? "ready" : "not-ready"}` }, p.ready ? "Prêt ✓" : "Pas prêt"),
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
  const me = room.players.find((p) => p.id === app.myId);
  const waiting = room.players.filter((p) => !p.bot && p.id !== room.hostId && !p.ready).map((p) => p.name);
  const arena = ARENAS[room.arena] ?? ARENAS[0];
  const stage = h(
    "div",
    { class: "diorama-wrap" },
    dioramaFor(arena.id),
    h(
      "div",
      { class: "diorama-label" },
      h("div", { class: "arena-title" }, `${arena.icon} Arène ${arena.id + 1} · ${arena.name}`),
      room.botStyle ? h("div", { class: "bot-style" }, `Bots : ${room.botStyle.label} — ${room.botStyle.description}`) : null,
    ),
  );
  const deckPanel = h(
    "div",
    { class: "panel", style: { marginTop: "18px" } },
    h(
      "div",
      { class: "topbar", style: { marginBottom: "10px" } },
      h("h2", { style: { margin: "0", flex: "1" } }, "Ton deck"),
      h("button", {
        class: "btn small ghost",
        onclick: () => {
          if (me?.ready) net.send({ type: "ready", ready: false });
          renderDeck();
        },
      }, "Changer de deck"),
    ),
    h("div", { class: "deck-preview" }, ...app.deck.map((c) => cardEl(c, { showName: false }))),
  );
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "screen-inner" },
        h("div", { class: "topbar" }, h("button", { class: "btn small ghost", onclick: leave }, "← Quitter"), h("h1", {}, "Salon"), modeSel),
        h("div", { class: "room-code" }, h("div", { class: "label" }, "Code du salon"), h("div", { class: "value" }, room.id)),
        stage,
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
            ? waiting.length
              ? h("div", {}, h("button", { class: "btn gold big", disabled: "true" }, "Lancer la partie"), h("div", { class: "help", style: { marginTop: "8px" } }, `En attente de : ${waiting.join(", ")}`))
              : h("button", { class: "btn gold big", onclick: () => net.send({ type: "start" }) }, "Lancer la partie")
            : h(
                "div",
                {},
                h(
                  "button",
                  { class: `btn big ${me?.ready ? "ghost" : "gold"}`, onclick: () => net.send({ type: "ready", ready: !me?.ready }) },
                  me?.ready ? "Je ne suis plus prêt" : "Je suis prêt !",
                ),
                h("div", { class: "help", style: { marginTop: "8px" } }, me?.ready ? "L'hôte peut lancer la partie dès que tout le monde est prêt." : "Choisis ton deck, puis indique que tu es prêt."),
              ),
          h("div", { class: "help", style: { marginTop: "10px" } }, "Les places vides sont complétées par des bots au lancement."),
        ),
        deckPanel,
      ),
      connBadge,
    ),
    true,
  );
  updateConn();
}

// ---------- Game ----------

let spectating: { players: PlayerSnap[]; arena: number; team: Team } | null = null;

function leaveSpectating() {
  net.send({ type: "stopSpectating" });
  spectating = null;
  stopGame();
  renderHome();
}

function startGame(team: Team, players: PlayerSnap[], arena: number, spectator = false) {
  spectating = spectator ? { players, arena, team } : null;
  stopGame();
  for (const m of document.querySelectorAll(".modal-backdrop")) m.remove();
  authModal = null;
  swapIn = null;
  disposeDiorama();
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
      if (spectator) return leaveSpectating();
      stopGame();
      if (app.room) renderRoom();
      else renderHome();
    },
    spectator,
    onSwitchSide: () => {
      if (!spectating) return;
      startGame(spectating.team === 0 ? 1 : 0, spectating.players, spectating.arena, true);
    },
  });
  view = new GameView({
    container: stage,
    overlay: hud.overlay,
    team,
    arena,
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
  const token = store.get("authToken");
  if (token) net.send({ type: "resume", token });
  if (app.name || token) net.send({ type: "hello", name: app.name, deck: app.deck });
};

let authModal: { el: HTMLElement; error: HTMLElement } | null = null;

function showAuth(mode: "login" | "register") {
  authModal?.el.remove();
  const name = h("input", { type: "text", maxlength: "16", placeholder: "Pseudo", value: app.name, autocomplete: "username" }) as HTMLInputElement;
  const pass = h("input", { type: "password", placeholder: "Mot de passe", autocomplete: mode === "login" ? "current-password" : "new-password" }) as HTMLInputElement;
  const confirm = h("input", { type: "password", placeholder: "Confirme le mot de passe", autocomplete: "new-password" }) as HTMLInputElement;
  const error = h("div", { class: "auth-error" });
  const submit = () => {
    error.textContent = "";
    if (mode === "register" && pass.value !== confirm.value) {
      error.textContent = "Les deux mots de passe ne sont pas identiques";
      return;
    }
    net.send({ type: mode, name: name.value, password: pass.value });
  };
  for (const input of [name, pass, confirm]) input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  const close = () => {
    backdrop.remove();
    authModal = null;
  };
  const backdrop = h(
    "div",
    { class: "modal-backdrop", onclick: (e: Event) => e.target === backdrop && close() },
    h(
      "div",
      { class: "modal panel auth-modal" },
      h(
        "div",
        { class: "segmented" },
        h("button", { class: mode === "login" ? "on" : "", onclick: () => showAuth("login") }, "Connexion"),
        h("button", { class: mode === "register" ? "on" : "", onclick: () => showAuth("register") }, "Créer un compte"),
      ),
      h(
        "div",
        { class: "help", style: { margin: "12px 0" } },
        mode === "login"
          ? "Connecte-toi pour retrouver tes trophées et ton deck depuis n'importe quel PC."
          : "Ton pseudo sera protégé par ton mot de passe. Tes trophées d'invité sont repris si tu gardes le même pseudo.",
      ),
      h("div", { class: "stack" }, name, pass, mode === "register" ? confirm : null, error),
      h(
        "div",
        { class: "row", style: { marginTop: "16px", justifyContent: "flex-end" } },
        h("button", { class: "btn small ghost", onclick: close }, "Annuler"),
        h("button", { class: "btn small gold", onclick: submit }, mode === "login" ? "Se connecter" : "Créer le compte"),
      ),
    ),
  );
  ui.appendChild(backdrop);
  authModal = { el: backdrop, error };
  (app.name ? pass : name).focus();
}

function doLogout() {
  net.send({ type: "logout", token: store.get("authToken") ?? undefined });
  store.remove("authToken");
  app.name = "";
  store.remove("name");
}

function refreshScreen() {
  if (app.screen === "home") renderHome();
  else if (app.screen === "room") renderRoom();
  else if (app.screen === "deck") renderDeck();
}

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
      if (msg.room) {
        if (app.screen === "room" || app.screen === "home") renderRoom();
      } else if (app.screen === "room") renderHome();
      break;
    case "start":
      startGame(msg.team, msg.players, msg.arena ?? 0, !!msg.spectator);
      break;
    case "state":
      if (app.game) {
        app.game.view.applyState(msg);
        app.game.hud.update(msg);
      }
      break;
    case "end":
      if (app.game) {
        const g = app.game;
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
        }
        if (authModal) {
          authModal.el.remove();
          authModal = null;
        }
        if (fresh && msg.token) toast(ui, `Bienvenue ${app.account} !`, true);
      } else {
        if (app.account) toast(ui, "Déconnecté");
        app.account = null;
        store.remove("authToken");
      }
      if (app.screen !== "game") refreshScreen();
      break;
    case "authError":
      if (authModal) authModal.error.textContent = msg.msg;
      else toast(ui, msg.msg);
      break;
    case "profile":
      app.profile = { trophies: msg.trophies, best: msg.best, wins: msg.wins, losses: msg.losses };
      if (app.screen === "home") document.getElementById("profile-bar")?.replaceWith(buildProfileBar());
      if (app.screen === "road") renderRoad();
      break;
    case "emote":
      if (msg.spectator) app.game?.hud.crowdEmote(msg.name, msg.emote);
      else app.game?.view.showEmote(msg.tm, msg.name, msg.emote);
      break;
    case "spectateEnd":
      if (spectating) {
        spectating = null;
        stopGame();
        renderHome();
        toast(ui, "La partie a été interrompue");
      }
      break;
    case "error":
      if (app.game) app.game.hud.toast(msg.msg);
      else toast(ui, msg.msg);
      break;
  }
});

document.title = GAME_NAME;
Promise.all([loadHeads(), loadModels()]).then(() => {
  renderHome();
  net.connect();
});
