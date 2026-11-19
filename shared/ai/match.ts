import { CARDS, DEFAULT_DECK, type CardId } from "../cards";
import { ARENA_H, DT } from "../constants";
import type { Team } from "../protocol";
import { Sim } from "../sim";
import { NeuralBot, type NeuralOptions } from "./brain";
import { Bot } from "./heuristic";
import type { RewardWeights } from "./styles";

export type Contender =
  | { kind: "heuristic"; slowness?: number }
  | { kind: "brain"; params: Float32Array; layers: number[]; deck: CardId[]; opts?: NeuralOptions };

export interface MatchStats {
  winner: Team | -1;
  crowns: [number, number];
  towerLost: [number, number];
  elixirLost: [number, number];
  preshots: [number, number];
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

export function playMatch(a: Contender, b: Contender, seed: number): MatchStats {
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
      return new NeuralBot(sim, id, c.params, c.layers, c.opts ?? TRAIN_OPTS, rng);
    });
    const spawned = new Map<number, number>();
    const stats: MatchStats = {
      winner: -1, crowns: [0, 0], towerLost: [0, 0], elixirLost: [0, 0], preshots: [0, 0], aggression: [0, 0], time: 0,
    };
    const spellCasts: { tm: Team; land: number }[] = [];
    let ticks = 0;
    while (sim.phase !== "ended" && ticks < 20 * 300) {
      sim.step(DT);
      for (const bot of bots) bot.update(DT);
      for (const u of sim.units) if (!spawned.has(u.id)) spawned.set(u.id, sim.time);
      for (const ev of sim.events) {
        if (ev.e === "die") {
          const card = CARDS[ev.c];
          stats.elixirLost[ev.tm] += card.count > 0 ? card.cost / card.count : 0;
        } else if (ev.e === "deploy") {
          const card = CARDS[ev.c];
          const ly = ev.tm === 0 ? ev.y : ARENA_H - ev.y;
          if (ly >= 13 && card.kind !== "spell") stats.aggression[ev.tm] += 1;
          if (card.kind === "spell" && card.spell) spellCasts.push({ tm: ev.tm, land: sim.time + card.spell.delay });
        } else if (ev.e === "hit" && ev.k === "spell") {
          const born = spawned.get(ev.id);
          const cast = spellCasts.find((s) => Math.abs(s.land - sim.time) < 0.11);
          if (born !== undefined && cast && sim.time - born <= 2.5) stats.preshots[cast.tm] += 1;
        }
      }
      sim.clearEvents();
      ticks++;
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
  f += Math.min(30, s.aggression[me]) * w.aggression;
  return f;
}
