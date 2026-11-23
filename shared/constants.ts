export const GAME_NAME = "USMB Arena";
export const RESOURCE_NAME = "Caféine";

export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_Y = 16;
export const RIVER_HALF = 1;
export const BRIDGES_X = [3.5, 14.5];
export const BRIDGE_HALF = 1;

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const MAX_ELIXIR = 10;
export const START_ELIXIR = 5;
export const ELIXIR_PER_SEC = 1 / 2.8;
export const MATCH_TIME = 180;
export const DOUBLE_TIME_AT = 60;
export const OVERTIME = 60;
export const COUNTDOWN = 3;
export const HAND_SIZE = 4;
export const DEPLOY_TIME = 1;

export type TowerKind = "princess" | "king";

export interface TowerDef {
  kind: TowerKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  range: number;
  damage: number;
  hitSpeed: number;
}

export const TOWER_LAYOUT: TowerDef[] = [
  { kind: "king", x: 9, y: 3, radius: 1.8, hp: 4200, range: 7.5, damage: 110, hitSpeed: 1.0 },
  { kind: "princess", x: 3.5, y: 6.5, radius: 1.4, hp: 2600, range: 8, damage: 90, hitSpeed: 0.8 },
  { kind: "princess", x: 14.5, y: 6.5, radius: 1.4, hp: 2600, range: 8, damage: 90, hitSpeed: 0.8 },
];

/** Écart horizontal entre les deux tours du roi en 2v2 : elles se chevauchent un peu (rayon 1,8). */
export const KING_2V2_OFFSET = 1.4;

/** En 2v2, chaque tour du roi a deux fois plus de vie (leur sort est lié : si l'une tombe, l'équipe perd). */
export const KING_2V2_HP_MULT = 2;

/** En 2v2, chaque joueur a sa tour du roi ; les deux sont imbriquées au centre. */
export function towerLayout(mode: "1v1" | "2v2"): TowerDef[] {
  if (mode === "1v1") return TOWER_LAYOUT;
  const out: TowerDef[] = [];
  for (const def of TOWER_LAYOUT) {
    if (def.kind !== "king") out.push(def);
    else for (const dx of [-KING_2V2_OFFSET, KING_2V2_OFFSET]) out.push({ ...def, x: def.x + dx, hp: def.hp * KING_2V2_HP_MULT });
  }
  return out;
}

export function mirrorY(y: number): number {
  return ARENA_H - y;
}
