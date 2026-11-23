import { CARDS, DECK_SIZE, DEFAULT_DECK, type CardId } from "../../shared/cards";
import type { Mode, RoomInfo } from "../../shared/protocol";
import { Net } from "./net";

export const store = {
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

export const net = new Net();

export const app = {
  name: store.get("name") ?? "",
  account: null as string | null,
  deck: loadDeck(),
  myId: "",
  rooms: [] as RoomInfo[],
  room: null as RoomInfo | null,
  profile: { trophies: 0, best: 0, wins: 0, losses: 0 },
  connected: false,
  mode: (store.get("mode") === "2v2" ? "2v2" : "1v1") as Mode,
  inGame: false,
};

export function hello() {
  net.send({ type: "hello", name: app.name, deck: app.deck });
}

export function setName(name: string) {
  app.name = name.trim().slice(0, 16);
  store.set("name", app.name);
  emit("profile");
}

export function setDeck(deck: CardId[]) {
  app.deck = deck.slice();
  store.set("deck", JSON.stringify(app.deck));
  if (app.deck.length === DECK_SIZE) net.send({ type: "deck", deck: app.deck });
  emit("deck");
}

export function setMode(mode: Mode) {
  app.mode = mode;
  store.set("mode", mode);
  emit("mode");
}

// Petit bus d'événements : chaque écran se met à jour lui-même sans tout reconstruire.
export type AppEvent = "profile" | "rooms" | "room" | "auth" | "deck" | "conn" | "mode";
const listeners = new Map<AppEvent, Set<() => void>>();

export function on(evt: AppEvent, fn: () => void): () => void {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt)!.add(fn);
  return () => listeners.get(evt)?.delete(fn);
}

export function emit(evt: AppEvent) {
  for (const fn of listeners.get(evt) ?? []) fn();
}

export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* pas de vibreur */
  }
}
