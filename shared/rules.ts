import type { CardDef } from "./cards";
import { ARENA_H, ARENA_W, BRIDGES_X, RIVER_HALF, RIVER_Y, TOWER_LAYOUT, type TowerKind } from "./constants";
import type { Team } from "./protocol";

export interface TowerLite {
  team: Team;
  kind: TowerKind;
  x: number;
  y: number;
  alive: boolean;
}

export interface BuildingLite {
  x: number;
  y: number;
  radius: number;
}

const RIVER_LO = RIVER_Y - RIVER_HALF;
const RIVER_HI = RIVER_Y + RIVER_HALF;
export const POCKET_DEPTH = 4.5;

export function towerRadius(kind: TowerKind): number {
  return TOWER_LAYOUT.find((t) => t.kind === kind)!.radius;
}

export function pocketOpen(team: Team, leftLane: boolean, towers: TowerLite[]): boolean {
  const enemy: Team = team === 0 ? 1 : 0;
  const laneX = leftLane ? BRIDGES_X[0] : BRIDGES_X[1];
  const t = towers.find((v) => v.team === enemy && v.kind === "princess" && v.x === laneX);
  return !!t && !t.alive;
}

export function inRiver(y: number): boolean {
  return y > RIVER_LO - 0.5 && y < RIVER_HI + 0.5;
}

export function canDeployAt(
  team: Team,
  card: CardDef,
  x: number,
  y: number,
  towers: TowerLite[],
  buildings: BuildingLite[],
): boolean {
  if (x < 0.5 || x > ARENA_W - 0.5 || y < 0.5 || y > ARENA_H - 0.5) return false;
  if (card.deployAnywhere) return card.kind === "spell" || !inRiver(y);
  if (inRiver(y)) return false;
  const ly = team === 0 ? y : ARENA_H - y;
  let ok = ly <= RIVER_LO - 0.5;
  if (!ok && ly >= RIVER_HI + 0.5 && ly <= RIVER_HI + POCKET_DEPTH) {
    ok = pocketOpen(team, x < ARENA_W / 2, towers);
  }
  if (!ok) return false;
  if (card.kind === "building" && card.unit) {
    const r = card.unit.radius;
    for (const t of towers) if (t.alive && Math.hypot(t.x - x, t.y - y) < towerRadius(t.kind) + r) return false;
    for (const b of buildings) if (Math.hypot(b.x - x, b.y - y) < b.radius + r) return false;
  }
  return true;
}

export function snapTile(v: number, max: number): number {
  return Math.min(max - 0.5, Math.max(0.5, Math.floor(v) + 0.5));
}

export function nearestDeployable(
  team: Team,
  card: CardDef,
  x: number,
  y: number,
  towers: TowerLite[],
  buildings: BuildingLite[],
): { x: number; y: number } | null {
  const sx = snapTile(x, ARENA_W);
  const sy = snapTile(y, ARENA_H);
  if (canDeployAt(team, card, sx, sy, towers, buildings)) return { x: sx, y: sy };
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0.5; ty < ARENA_H; ty += 1) {
    for (let tx = 0.5; tx < ARENA_W; tx += 1) {
      const d = (tx - x) ** 2 + (ty - y) ** 2;
      if (d >= bestD) continue;
      if (!canDeployAt(team, card, tx, ty, towers, buildings)) continue;
      bestD = d;
      best = { x: tx, y: ty };
    }
  }
  return best;
}
