import type { CardId } from "./cards";
import type { TowerKind } from "./constants";

export type Mode = "1v1" | "2v2";
export type Team = 0 | 1;
export type Phase = "countdown" | "playing" | "overtime" | "tiebreak" | "ended";

export const UNIT_STATE = { deploying: 0, moving: 1, attacking: 2, frozen: 3, idle: 4 } as const;

export interface UnitSnap {
  id: number;
  c: CardId;
  tm: Team;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  st: number;
  f: number;
}

export interface TowerSnap {
  id: number;
  tm: Team;
  k: TowerKind;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  a: boolean;
  fz: boolean;
}

export interface ProjSnap {
  id: number;
  k: string;
  tm: Team;
  x: number;
  y: number;
  h: number;
}

export interface PlayerSnap {
  id: string;
  name: string;
  tm: Team;
  bot: boolean;
}

export type GameEvent =
  | { e: "deploy"; c: CardId; x: number; y: number; tm: Team; by: string }
  | { e: "attack"; id: number; tid: number }
  | { e: "hit"; id: number; x: number; y: number; dmg: number; k: string }
  | { e: "die"; id: number; x: number; y: number; c: CardId; tm: Team }
  | { e: "tower"; id: number; tm: Team; x: number; y: number; k: TowerKind }
  | { e: "spell"; c: CardId; x: number; y: number; r: number; tm: Team }
  | { e: "spellCast"; c: CardId; x: number; y: number; r: number; tm: Team; delay: number }
  | { e: "smash"; id: number; tid: number; x: number; y: number }
  | { e: "explode"; x: number; y: number; r: number; tm: Team }
  | { e: "tiebreak" }
  | { e: "splash"; x: number; y: number; r: number; tm: Team };

export interface StateMsg {
  type: "state";
  t: number;
  phase: Phase;
  left: number;
  dbl: boolean;
  crowns: [number, number];
  units: UnitSnap[];
  towers: TowerSnap[];
  proj: ProjSnap[];
  hand: CardId[];
  next: CardId | null;
  el: number;
  ev: GameEvent[];
  winner: Team | -1 | null;
  spec?: number;
}

export interface RoomPlayer {
  id: string;
  name: string;
  team: Team;
  bot: boolean;
  ready: boolean;
  account: boolean;
}

export interface RoomInfo {
  id: string;
  mode: Mode;
  hostId: string;
  status: "lobby" | "playing";
  arena: number;
  spectators: number;
  botStyle: { label: string; description: string } | null;
  players: RoomPlayer[];
}

export type ClientMsg =
  | { type: "hello"; name: string; deck?: CardId[] }
  | { type: "create"; mode: Mode }
  | { type: "join"; roomId: string }
  | { type: "leave" }
  | { type: "addBot" }
  | { type: "removeBot" }
  | { type: "team" }
  | { type: "mode"; mode: Mode }
  | { type: "start" }
  | { type: "solo"; mode: Mode }
  | { type: "deck"; deck: CardId[] }
  | { type: "play"; card: CardId; x: number; y: number }
  | { type: "emote"; emote: string }
  | { type: "ready"; ready: boolean }
  | { type: "spectate"; roomId: string }
  | { type: "stopSpectating" }
  | { type: "register"; name: string; password: string }
  | { type: "login"; name: string; password: string }
  | { type: "resume"; token: string }
  | { type: "logout"; token?: string };

export type ServerMsg =
  | { type: "welcome"; id: string }
  | { type: "rooms"; rooms: RoomInfo[] }
  | { type: "room"; room: RoomInfo | null }
  | { type: "start"; team: Team; mode: Mode; players: PlayerSnap[]; you: string; arena: number; spectator?: boolean }
  | { type: "spectateEnd" }
  | { type: "profile"; trophies: number; best: number; wins: number; losses: number }
  | { type: "auth"; account: { name: string } | null; token?: string; deck?: CardId[] }
  | { type: "authError"; msg: string }
  | StateMsg
  | { type: "end"; winner: Team | -1; crowns: [number, number]; trophies?: { delta: number; total: number } }
  | { type: "emote"; from: string; name: string; tm: Team; emote: string; spectator?: boolean }
  | { type: "error"; msg: string };
