import { CARDS, DEFAULT_DECK, unitValue, type CardId } from "../cards";
import { ARENA_H, ARENA_W, DT, RIVER_Y } from "../constants";
import type { Team } from "../protocol";
import { Sim } from "../sim";
import { NeuralBot, type NeuralOptions } from "./brain";
import { Bot } from "./heuristic";
import type { RewardWeights } from "./styles";

export type Contender =
  | { kind: "heuristic"; slowness?: number }
  | { kind: "brain"; params: Float32Array; layers: number[]; deck: CardId[]; cards?: CardId[]; opts?: NeuralOptions };

export interface MatchStats {
  winner: Team | -1;
  crowns: [number, number];
  towerLost: [number, number];
  elixirLost: [number, number];
  preshots: [number, number];
  anticipations: [number, number];
  distinctCards: [number, number];
  avgElixir: [number, number];
  aggression: [number, number];
  time: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRAIN_OPTS: NeuralOptions = { think: 0.35, epsilon: 0, temperature: 0 };

export function playMatch(a: Contender, b: Contender, seed: number, trace?: (team: Team, action: number) => void): MatchStats {
  const realRandom = Math.random;
  const rng = mulberry32(seed);
  Math.random = rng;
  try {
    const sim = new Sim();
    const contenders = [a, b];
    const bots = contenders.map((c, i) => {
      const id = i === 0 ? "a" : "b";
      const team = i as Team;
      if (c.kind === "heuristic") {
        sim.addPlayer(id, id, team, DEFAULT_DECK, true);
        return new Bot(sim, id, c.slowness ?? 0);
      }
      sim.addPlayer(id, id, team, c.deck, true);
      const bot = new NeuralBot(sim, id, c.params, c.layers, c.opts ?? TRAIN_OPTS, rng, c.cards);
      if (trace) bot.onPlay = (action) => trace(team, action);
      return bot;
    });
    const spawned = new Map<number, number>();
    const stats: MatchStats = {
      winner: -1, crowns: [0, 0], towerLost: [0, 0], elixirLost: [0, 0], preshots: [0, 0], anticipations: [0, 0], distinctCards: [0, 0], avgElixir: [0, 0], aggression: [0, 0], time: 0,
    };
    const spellCasts: { tm: Team; land: number }[] = [];
    let pending: { tm: Team; lane: number; t: number }[] = [];
    const played = [new Set<string>(), new Set<string>()];
    const elixirSum = [0, 0];
    let elixirTicks = 0;
    let ticks = 0;
    while (sim.phase !== "ended" && ticks < 20 * 300) {
      sim.step(DT);
      for (const bot of bots) bot.update(DT);
      for (const u of sim.units) if (!spawned.has(u.id)) spawned.set(u.id, sim.time);
      for (const ev of sim.events) {
        if (ev.e === "die") {
          const card = CARDS[ev.c];
          stats.elixirLost[ev.tm] += unitValue(ev.c);
        } else if (ev.e === "deploy") {
          const card = CARDS[ev.c];
          const ly = ev.tm === 0 ? ev.y : ARENA_H - ev.y;
          if (ly >= 13 && card.kind !== "spell") stats.aggression[ev.tm] += 1;
          if (card.kind === "spell" && card.spell) spellCasts.push({ tm: ev.tm, land: sim.time + card.spell.delay });
          played[ev.tm].add(ev.c);
          const lane = ev.x < ARENA_W / 2 ? 0 : 1;
          if (card.kind !== "spell" && !card.deployAnywhere) {
            const enemyTeam: Team = ev.tm === 0 ? 1 : 0;
            const hit = pending.find((p) => p.tm === enemyTeam && p.lane === lane && sim.time - p.t <= 4);
            if (hit) {
              stats.anticipations[enemyTeam] += 1;
              pending = pending.filter((p) => p !== hit);
            }
            if (ly < RIVER_Y - 1) {
              const calm = !sim.units.some((u) => u.team !== ev.tm && (u.x < ARENA_W / 2 ? 0 : 1) === lane && (ev.tm === 0 ? u.y : ARENA_H - u.y) < RIVER_Y + 1);
              if (calm) pending.push({ tm: ev.tm, lane, t: sim.time });
            }
          }
          pending = pending.filter((p) => sim.time - p.t <= 4);
        } else if (ev.e === "hit" && ev.k === "spell") {
          const born = spawned.get(ev.id);
          const cast = spellCasts.find((s) => Math.abs(s.land - sim.time) < 0.11);
          if (born !== undefined && cast && sim.time - born <= 2.5) stats.preshots[cast.tm] += 1;
        }
      }
      sim.clearEvents();
      ticks++;
      if (sim.phase === "playing" || sim.phase === "overtime") {
        for (const pl of sim.players.values()) elixirSum[pl.team] += pl.elixir;
        elixirTicks++;
      }
    }
    stats.winner = sim.winner ?? -1;
    stats.crowns = [sim.crowns[0], sim.crowns[1]];
    for (const team of [0, 1] as Team[]) {
      const ts = sim.towers.filter((t) => t.team === team);
      const max = ts.reduce((s, t) => s + t.maxHp, 0);
      const hp = ts.reduce((s, t) => s + Math.max(0, t.alive ? t.hp : 0), 0);
      stats.towerLost[team] = 1 - hp / max;
    }
    stats.time = sim.time;
    stats.distinctCards = [played[0].size, played[1].size];
    stats.avgElixir = [elixirSum[0] / Math.max(1, elixirTicks), elixirSum[1] / Math.max(1, elixirTicks)];
    return stats;
  } finally {
    Math.random = realRandom;
  }
}

export function fitnessFor(s: MatchStats, me: Team, w: RewardWeights): number {
  const them: Team = me === 0 ? 1 : 0;
  const outcome = s.winner === -1 ? 0 : s.winner === me ? 1 : -1;
  let f = outcome * w.win;
  f += ((s.crowns[me] - s.crowns[them]) / 3) * w.crowns;
  f += s.towerLost[them] * w.towerDealt;
  f -= s.towerLost[me] * w.towerTaken;
  f += Math.max(-1, Math.min(1, (s.elixirLost[them] - s.elixirLost[me]) / 30)) * w.trade;
  f += Math.min(8, s.preshots[me]) * w.preshot;
  f += Math.min(8, s.anticipations[me]) * w.anticipation;
  f += (s.distinctCards[me] / 8) * w.variety;
  f += Math.min(30, s.aggression[me]) * w.aggression;
  return f;
}
