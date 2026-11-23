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
  /** Attaques lancées quand l'adversaire était à sec, qui ont vraiment fait mal. */
  punishes: [number, number];
  /** Poussées adverses subies à sec (moins de 2 de caféine) qui ont fait mal. */
  caughtBroke: [number, number];
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
      winner: -1, crowns: [0, 0], towerLost: [0, 0], elixirLost: [0, 0], preshots: [0, 0], anticipations: [0, 0], distinctCards: [0, 0], avgElixir: [0, 0], aggression: [0, 0], punishes: [0, 0], caughtBroke: [0, 0], time: 0,
    };
    const spellCasts: { tm: Team; land: number; cast: number }[] = [];
    // Préshot : défense posée « à l'aveugle » dans un couloir calme…
    let pending: { tm: Team; lane: number; t: number }[] = [];
    // …puis poussée adverse dans ce couloir juste après : on regarde si la défense a vraiment tenu.
    let windows: { tm: Team; lane: number; end: number; hpStart: number; mine: number; theirs: number }[] = [];
    // Gestion de la caféine : punir un adversaire à sec, ne pas se faire prendre à sec.
    let elixirWatch: { tm: Team; kind: "punish" | "broke"; lane: number; end: number; hpStart: number }[] = [];
    const elixirOf = (team: Team) => {
      const ps = [...sim.players.values()].filter((q) => q.team === team);
      return ps.reduce((s2, q) => s2 + q.elixir, 0) / Math.max(1, ps.length);
    };
    const laneHp = (team: Team, lane: number) =>
      sim.towers
        .filter((t) => t.team === team && t.alive && (t.kind === "king" || (t.x < ARENA_W / 2 ? 0 : 1) === lane))
        .reduce((s2, t) => s2 + Math.max(0, t.hp), 0);
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
          stats.elixirLost[ev.tm] += unitValue(ev.c);
          const lane = ev.x < ARENA_W / 2 ? 0 : 1;
          for (const w of windows) {
            if (w.lane !== lane) continue;
            if (ev.tm === w.tm) w.mine += unitValue(ev.c);
            else w.theirs += unitValue(ev.c);
          }
        } else if (ev.e === "deploy") {
          const card = CARDS[ev.c];
          const ly = ev.tm === 0 ? ev.y : ARENA_H - ev.y;
          if (ly >= 13 && card.kind !== "spell") stats.aggression[ev.tm] += 1;
          if (card.kind === "spell" && card.spell) spellCasts.push({ tm: ev.tm, land: sim.time + card.spell.delay, cast: sim.time });
          played[ev.tm].add(ev.c);
          const lane = ev.x < ARENA_W / 2 ? 0 : 1;
          const enemyTeam: Team = ev.tm === 0 ? 1 : 0;
          if (card.kind === "troop") {
            const offensive = ly >= RIVER_Y - 3 || !!card.unit?.targetsBuildingsOnly || card.deployAnywhere;
            // Attaque lancée alors que l'adversaire est (presque) à 0 : bien vu si sa tour encaisse
            if (offensive && elixirOf(enemyTeam) <= 2.5) {
              elixirWatch.push({ tm: ev.tm, kind: "punish", lane, end: sim.time + 10, hpStart: laneHp(enemyTeam, lane) });
            }
            // Poussée adverse (troupe de 3+ caféine) alors qu'on n'a plus de quoi répondre
            if (card.cost >= 3 && elixirOf(enemyTeam) < 2) {
              elixirWatch.push({ tm: enemyTeam, kind: "broke", lane, end: sim.time + 8, hpStart: laneHp(enemyTeam, lane) });
            }
          }
          // Une poussée adverse (troupe, y compris lancée ou creusée) arrive dans un couloir déjà défendu :
          // la défense a été posée 0,15 à 2,5 s avant, trop tard pour que l'adversaire change d'avis.
          if (card.kind === "troop") {
            const hit = pending.find((p) => p.tm === enemyTeam && p.lane === lane && sim.time - p.t >= 0.15 && sim.time - p.t <= 2.5);
            if (hit) {
              pending = pending.filter((p) => p !== hit);
              windows.push({ tm: enemyTeam, lane, end: sim.time + 9, hpStart: laneHp(enemyTeam, lane), mine: 0, theirs: 0 });
            }
          }
          // Défenseur (troupe qui attaque les unités, ou bâtiment) posé dans sa moitié, sur un couloir calme
          const defender = card.kind === "building" || (card.kind === "troop" && !!card.unit && !card.unit.targetsBuildingsOnly);
          if (defender && !card.deployAnywhere && ly <= RIVER_Y - 3) {
            const calm = !sim.units.some((u) => u.team !== ev.tm && (u.x < ARENA_W / 2 ? 0 : 1) === lane && (ev.tm === 0 ? u.y : ARENA_H - u.y) < RIVER_Y + 1);
            if (calm) pending.push({ tm: ev.tm, lane, t: sim.time });
          }
          pending = pending.filter((p) => sim.time - p.t <= 2.5);
        } else if (ev.e === "hit" && ev.k === "spell") {
          const born = spawned.get(ev.id);
          const cast = spellCasts.find((s) => Math.abs(s.land - sim.time) < 0.11);
          // Vrai préshot de sort : lancé AVANT que la troupe touchée soit posée (on a lu où l'adversaire allait jouer)
          if (born !== undefined && cast && born >= cast.cast - 0.05) stats.preshots[cast.tm] += 1;
        }
      }
      sim.clearEvents();
      if (elixirWatch.length) {
        const keep: typeof elixirWatch = [];
        for (const w of elixirWatch) {
          if (sim.time < w.end) {
            keep.push(w);
            continue;
          }
          if (w.kind === "punish") {
            const target: Team = w.tm === 0 ? 1 : 0;
            if (w.hpStart - laneHp(target, w.lane) >= 250) stats.punishes[w.tm] += 1;
          } else if (w.hpStart - laneHp(w.tm, w.lane) >= 400) stats.caughtBroke[w.tm] += 1;
        }
        elixirWatch = keep;
      }
      // Fin de fenêtre : préshot réussi si l'adversaire a perdu plus que nous dans ce couloir et que la tour a tenu
      if (windows.length) {
        const keep: typeof windows = [];
        for (const w of windows) {
          if (sim.time < w.end) {
            keep.push(w);
            continue;
          }
          if (w.theirs > 0 && w.theirs >= w.mine * 0.8 && w.hpStart - laneHp(w.tm, w.lane) <= 300) stats.anticipations[w.tm] += 1;
        }
        windows = keep;
      }
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
  f += Math.min(6, s.punishes[me]) * (w.punish ?? 0);
  f -= Math.min(6, s.caughtBroke[me]) * (w.broke ?? 0);
  return f;
}
