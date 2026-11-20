import { CARDS, type CardId } from "../cards";
import { ARENA_H, ARENA_W, BRIDGES_X, MAX_ELIXIR, RIVER_Y } from "../constants";
import type { Team } from "../protocol";
import { canDeployAt, snapTile } from "../rules";
import type { Sim, SimPlayer } from "../sim";

export const AI_CARDS: CardId[] = ["goutier", "midas", "valere", "tordeux", "natis", "samy", "imad", "niels", "nazar", "tarit"];

export interface BrainFile {
  version: 1;
  style: string;
  label: string;
  deck: CardId[];
  cards: CardId[];
  layers: number[];
  params: number[];
  meta: {
    generations: number;
    games: number;
    winRateVsHeuristic: number;
    leagueScore?: number;
    updatedAt: string;
  };
}

interface Anchor {
  name: string;
  resolve(ctx: Ctx): [number, number] | null;
}

interface Ctx {
  sim: Sim;
  team: Team;
  enemy: Team;
  ly(y: number): number;
  abs(ly: number): number;
  threats: Sim["units"];
}

const LANES = [BRIDGES_X[0], BRIDGES_X[1]];
const inward = (laneX: number, d: number) => laneX + (laneX < ARENA_W / 2 ? d : -d);

function laneAnchors(i: number): Anchor[] {
  const lx = LANES[i];
  const side = i === 0 ? "G" : "D";
  return [
    { name: `arrière ${side}`, resolve: (c) => [lx, c.abs(3.5)] },
    { name: `défense ${side}`, resolve: (c) => [inward(lx, 1.5), c.abs(9.5)] },
    { name: `pont ${side}`, resolve: (c) => [lx, c.abs(14)] },
    { name: `pont adverse ${side}`, resolve: (c) => [lx, c.abs(18.5)] },
    { name: `tour adverse ${side}`, resolve: (c) => [inward(lx, 1.2), c.abs(24.5)] },
    { name: `fond adverse ${side}`, resolve: (c) => [lx, c.abs(28.5)] },
  ];
}

export const ANCHORS: Anchor[] = [
  ...laneAnchors(0),
  ...laneAnchors(1),
  { name: "aimant côté G", resolve: (c) => [ARENA_W / 2 - 0.5, c.abs(9.5)] },
  { name: "aimant côté D", resolve: (c) => [ARENA_W / 2 + 0.5, c.abs(9.5)] },
  { name: "devant le roi", resolve: (c) => [ARENA_W / 2, c.abs(5.5)] },
  {
    name: "intercepter",
    resolve: (c) => {
      if (!c.threats.length) return null;
      const lead = c.threats.reduce((a, b) => (c.ly(a.y) < c.ly(b.y) ? a : b));
      return [lead.x, c.abs(Math.min(14, Math.max(1.5, c.ly(lead.y) - 2.5)))];
    },
  },
  {
    name: "sur la menace",
    resolve: (c) => {
      if (!c.threats.length) return null;
      let w = 0;
      let x = 0;
      let y = 0;
      for (const u of c.threats) {
        w += u.hp;
        x += u.x * u.hp;
        y += u.y * u.hp;
      }
      return [x / w, y / w];
    },
  },
];

export const ACTION_COUNT = 1 + AI_CARDS.length * ANCHORS.length;

export function describeAction(a: number): string {
  if (a === 0) return "attendre";
  const card = AI_CARDS[Math.floor((a - 1) / ANCHORS.length)];
  return `${CARDS[card].name} → ${ANCHORS[(a - 1) % ANCHORS.length].name}`;
}

const ZONES = 4;
const PER_ZONE = 5;
export const INPUT_SIZE = 2 * ZONES * PER_ZONE + 8 + 5 + AI_CARDS.length * 3 + 6 + 3 + AI_CARDS.length * 2;

export interface Memory {
  lastEnemyCard: CardId | null;
  lastEnemyLy: number;
  lastEnemyLane: number;
  lastEnemyTime: number;
  lastEnemyPlayer: string | null;
  enemyPlays: Map<string, CardId[]>;
}

export function newMemory(): Memory {
  return { lastEnemyCard: null, lastEnemyLy: 0, lastEnemyLane: 0, lastEnemyTime: -99, lastEnemyPlayer: null, enemyPlays: new Map() };
}

export function enemyCycle(mem: Memory): Map<CardId, "inHand" | "cycling"> {
  const out = new Map<CardId, "inHand" | "cycling">();
  const plays = mem.lastEnemyPlayer ? mem.enemyPlays.get(mem.lastEnemyPlayer) : undefined;
  if (!plays) return out;
  for (let i = plays.length - 1; i >= 0; i--) {
    const card = plays[i];
    if (out.has(card)) continue;
    const since = plays.length - 1 - i;
    out.set(card, since >= 4 ? "inHand" : "cycling");
  }
  return out;
}

function ctxFor(sim: Sim, p: SimPlayer): Ctx {
  const team = p.team;
  const enemy: Team = team === 0 ? 1 : 0;
  const ly = (y: number) => (team === 0 ? y : ARENA_H - y);
  const abs = (l: number) => (team === 0 ? l : ARENA_H - l);
  const threats = sim.units.filter((u) => u.team !== team && u.hp > 0 && ly(u.y) < RIVER_Y + 1.5);
  return { sim, team, enemy, ly, abs, threats };
}

function zoneOf(ly: number): number {
  if (ly < 7) return 0;
  if (ly < RIVER_Y) return 1;
  if (ly < 25) return 2;
  return 3;
}

export function encode(sim: Sim, p: SimPlayer, mem: Memory, out: Float32Array): Float32Array {
  out.fill(0);
  const c = ctxFor(sim, p);
  let o = 0;
  for (const u of sim.units) {
    if (u.hp <= 0) continue;
    const lane = u.x < ARENA_W / 2 ? 0 : 1;
    const base = (lane * ZONES + zoneOf(c.ly(u.y))) * PER_ZONE;
    const dps = u.stats.hitSpeed > 0 ? u.stats.damage / u.stats.hitSpeed : 0;
    if (u.team === c.team) {
      out[base + 1] += u.hp / 2000;
      out[base + 4] += dps / 300;
    } else {
      out[base] += u.hp / 2000;
      if (u.stats.targetsBuildingsOnly) out[base + 2] += u.hp / 2000;
      out[base + 3] += dps / 300;
    }
  }
  o = 2 * ZONES * PER_ZONE;
  const towerOrder = (team: Team) =>
    sim.towers.filter((t) => t.team === team).sort((a, b) => (a.kind === b.kind ? a.x - b.x : a.kind === "king" ? 1 : -1));
  for (const team of [c.team, c.enemy]) {
    const ts = towerOrder(team);
    for (const t of ts) out[o++] = t.alive ? t.hp / t.maxHp : 0;
    const king = ts.find((t) => t.kind === "king");
    out[o++] = king && king.active ? 1 : 0;
  }
  const enemyPlayers = [...sim.players.values()].filter((q) => q.team !== c.team);
  const enemyElixir = enemyPlayers.reduce((s, q) => s + q.elixir, 0) / Math.max(1, enemyPlayers.length);
  out[o++] = p.elixir / MAX_ELIXIR;
  out[o++] = enemyElixir / MAX_ELIXIR;
  out[o++] = Math.min(1, sim.time / 180);
  out[o++] = sim.overtime ? 1 : 0;
  out[o++] = sim.doubleElixir ? 1 : 0;
  for (let i = 0; i < AI_CARDS.length; i++) {
    const id = AI_CARDS[i];
    const inHand = p.hand.includes(id);
    out[o + i * 3] = inHand ? 1 : 0;
    out[o + i * 3 + 1] = inHand && p.elixir >= CARDS[id].cost ? 1 : 0;
    out[o + i * 3 + 2] = p.queue[0] === id ? 1 : 0;
  }
  o += AI_CARDS.length * 3;
  const since = sim.time - mem.lastEnemyTime;
  const fresh = Math.exp(-since / 2);
  out[o++] = fresh;
  out[o++] = mem.lastEnemyLane === 0 ? fresh : 0;
  out[o++] = mem.lastEnemyLane === 1 ? fresh : 0;
  out[o++] = (mem.lastEnemyLy / ARENA_H) * fresh;
  out[o++] = mem.lastEnemyCard ? (CARDS[mem.lastEnemyCard].cost / 10) * fresh : 0;
  out[o++] = mem.lastEnemyCard && CARDS[mem.lastEnemyCard].unit?.targetsBuildingsOnly ? fresh : 0;
  if (c.threats.length) {
    const lead = c.threats.reduce((a, b) => (c.ly(a.y) < c.ly(b.y) ? a : b));
    out[o++] = c.ly(lead.y) / ARENA_H;
    out[o++] = lead.x / ARENA_W;
    out[o++] = Math.min(1, c.threats.length / 10);
  } else {
    o += 3;
  }
  const cycle = enemyCycle(mem);
  for (let i = 0; i < AI_CARDS.length; i++) {
    const st = cycle.get(AI_CARDS[i]);
    out[o + i * 2] = st ? 1 : 0;
    out[o + i * 2 + 1] = st === "inHand" ? 1 : 0;
  }
  o += AI_CARDS.length * 2;
  return out;
}

export function observeEvents(sim: Sim, p: SimPlayer, mem: Memory) {
  for (const ev of sim.events) {
    if (ev.e !== "deploy" || ev.tm === p.team) continue;
    mem.lastEnemyCard = ev.c;
    mem.lastEnemyLy = p.team === 0 ? ev.y : ARENA_H - ev.y;
    mem.lastEnemyLane = ev.x < ARENA_W / 2 ? 0 : 1;
    mem.lastEnemyTime = sim.time;
    mem.lastEnemyPlayer = ev.by;
    const list = mem.enemyPlays.get(ev.by) ?? [];
    list.push(ev.c);
    if (list.length > 40) list.splice(0, list.length - 40);
    mem.enemyPlays.set(ev.by, list);
  }
}

export function resolveAction(
  sim: Sim,
  p: SimPlayer,
  action: number,
  cache?: Ctx,
  requireElixir = true,
): { card: CardId; x: number; y: number } | null {
  if (action <= 0) return null;
  const card = AI_CARDS[Math.floor((action - 1) / ANCHORS.length)];
  if (!p.hand.includes(card)) return null;
  if (requireElixir && p.elixir < CARDS[card].cost) return null;
  const c = cache ?? ctxFor(sim, p);
  const pos = ANCHORS[(action - 1) % ANCHORS.length].resolve(c);
  if (!pos) return null;
  const x = snapTile(pos[0], ARENA_W);
  const y = snapTile(pos[1], ARENA_H);
  const buildings = sim.units.filter((u) => u.building && u.hp > 0);
  if (!canDeployAt(p.team, CARDS[card], x, y, sim.towers, buildings)) return null;
  return { card, x, y };
}

export function validMask(sim: Sim, p: SimPlayer, mask: Uint8Array): Uint8Array {
  mask.fill(0);
  mask[0] = 1;
  const c = ctxFor(sim, p);
  for (let ci = 0; ci < AI_CARDS.length; ci++) {
    const card = AI_CARDS[ci];
    if (!p.hand.includes(card)) continue;
    for (let ai = 0; ai < ANCHORS.length; ai++) {
      const a = 1 + ci * ANCHORS.length + ai;
      if (resolveAction(sim, p, a, c, false)) mask[a] = 1;
    }
  }
  return mask;
}

export function paramCount(layers: number[]): number {
  let n = 0;
  for (let i = 0; i < layers.length - 1; i++) n += layers[i] * layers[i + 1] + layers[i + 1];
  return n;
}

export class MLP {
  private acts: Float32Array[];

  constructor(public layers: number[], public params: Float32Array) {
    if (params.length !== paramCount(layers)) throw new Error(`Taille de cerveau invalide : ${params.length} au lieu de ${paramCount(layers)}`);
    this.acts = layers.map((n) => new Float32Array(n));
  }

  forward(input: Float32Array): Float32Array {
    this.acts[0].set(input);
    let off = 0;
    const L = this.layers;
    for (let l = 0; l < L.length - 1; l++) {
      const inp = this.acts[l];
      const out = this.acts[l + 1];
      const nin = L[l];
      const nout = L[l + 1];
      const p = this.params;
      const bOff = off + nin * nout;
      const last = l === L.length - 2;
      for (let j = 0; j < nout; j++) {
        let s = p[bOff + j];
        const row = off + j * nin;
        for (let i = 0; i < nin; i++) s += p[row + i] * inp[i];
        out[j] = last ? s : Math.tanh(s);
      }
      off = bOff + nout;
    }
    return this.acts[L.length - 1];
  }
}

export function defaultLayers(): number[] {
  return [INPUT_SIZE, 64, 48, ACTION_COUNT];
}

export interface NeuralOptions {
  think: number;
  epsilon: number;
  temperature: number;
}

export class NeuralBot {
  private mlp: MLP;
  private input = new Float32Array(INPUT_SIZE);
  private mask = new Uint8Array(ACTION_COUNT);
  private mem = newMemory();
  private timer: number;
  lastAction = 0;
  onPlay?: (action: number) => void;

  constructor(
    private sim: Sim,
    public playerId: string,
    params: Float32Array,
    layers: number[],
    private opts: NeuralOptions = { think: 0.35, epsilon: 0, temperature: 0 },
    private rng: () => number = Math.random,
  ) {
    this.mlp = new MLP(layers, params);
    this.timer = opts.think * (0.5 + this.rng());
  }

  update(dt: number) {
    const p = this.sim.players.get(this.playerId);
    if (!p) return;
    observeEvents(this.sim, p, this.mem);
    if (this.sim.phase !== "playing" && this.sim.phase !== "overtime") return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.opts.think * (0.8 + this.rng() * 0.4);
    const action = this.decide(p);
    this.lastAction = action;
    if (action === 0) return;
    const r = resolveAction(this.sim, p, action, undefined, false);
    if (!r || p.elixir < CARDS[r.card].cost) return;
    if (!this.sim.play(p.id, r.card, r.x, r.y)) this.onPlay?.(action);
  }

  private decide(p: SimPlayer): number {
    encode(this.sim, p, this.mem, this.input);
    validMask(this.sim, p, this.mask);
    const logits = this.mlp.forward(this.input);
    if (this.opts.epsilon > 0 && this.rng() < this.opts.epsilon) {
      const valid: number[] = [];
      for (let a = 0; a < ACTION_COUNT; a++) if (this.mask[a]) valid.push(a);
      return valid[Math.floor(this.rng() * valid.length)];
    }
    if (this.opts.temperature > 0) {
      let max = -Infinity;
      for (let a = 0; a < ACTION_COUNT; a++) if (this.mask[a] && logits[a] > max) max = logits[a];
      let sum = 0;
      const probs = new Float32Array(ACTION_COUNT);
      for (let a = 0; a < ACTION_COUNT; a++) {
        if (!this.mask[a]) continue;
        probs[a] = Math.exp((logits[a] - max) / this.opts.temperature);
        sum += probs[a];
      }
      let r = this.rng() * sum;
      for (let a = 0; a < ACTION_COUNT; a++) {
        if (!this.mask[a]) continue;
        r -= probs[a];
        if (r <= 0) return a;
      }
    }
    let best = 0;
    let bestV = -Infinity;
    for (let a = 0; a < ACTION_COUNT; a++) {
      if (this.mask[a] && logits[a] > bestV) {
        bestV = logits[a];
        best = a;
      }
    }
    return best;
  }
}
