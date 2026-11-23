import { parentPort } from "node:worker_threads";
import type { CardId } from "../shared/cards";
import type { Team } from "../shared/protocol";
import { fitnessFor, mulberry32, playMatch, type Contender } from "../shared/ai/match";
import type { RewardWeights } from "../shared/ai/styles";

export interface OpponentSpec {
  kind: "heuristic" | "brain";
  params?: Float32Array;
  layers?: number[];
  deck?: CardId[];
  cards?: CardId[];
}

export type WorkerIn =
  | { type: "setup"; layers: number[]; deck: CardId[]; reward: RewardWeights; sigma: number }
  | { type: "theta"; theta: Float32Array }
  | { type: "league"; opponents: OpponentSpec[] }
  | { type: "job"; id: number; noiseSeed: number; sign: 1 | -1 | 0; games: { seed: number; opp: number; side: Team }[] };

export interface WorkerOut {
  type: "result";
  id: number;
  fitness: number;
  wins: number;
  games: number;
  preshots: number;
  anticipations: number;
}

let layers: number[] = [];
let deck: CardId[] = [];
let reward: RewardWeights;
let sigma = 0.04;
let theta = new Float32Array(0);
let league: OpponentSpec[] = [];
let work = new Float32Array(0);

export function gaussianInto(seed: number, out: Float32Array) {
  const rng = mulberry32(seed);
  for (let i = 0; i < out.length; i += 2) {
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < out.length) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
}

function contender(spec: OpponentSpec): Contender {
  if (spec.kind === "heuristic") return { kind: "heuristic" };
  return { kind: "brain", params: spec.params!, layers: spec.layers!, deck: spec.deck!, cards: spec.cards };
}

parentPort?.on("message", (msg: WorkerIn) => {
  if (msg.type === "setup") {
    layers = msg.layers;
    deck = msg.deck;
    reward = msg.reward;
    sigma = msg.sigma;
    return;
  }
  if (msg.type === "theta") {
    theta = msg.theta;
    work = new Float32Array(theta.length);
    return;
  }
  if (msg.type === "league") {
    league = msg.opponents;
    return;
  }
  if (msg.sign === 0) {
    work.set(theta);
  } else {
    gaussianInto(msg.noiseSeed, work);
    for (let i = 0; i < work.length; i++) work[i] = theta[i] + msg.sign * sigma * work[i];
  }
  const me: Contender = { kind: "brain", params: work, layers, deck };
  let fitness = 0;
  let wins = 0;
  let preshots = 0;
  let anticipations = 0;
  for (const g of msg.games) {
    const opp = contender(league[g.opp] ?? { kind: "heuristic" });
    const s = g.side === 0 ? playMatch(me, opp, g.seed) : playMatch(opp, me, g.seed);
    fitness += fitnessFor(s, g.side, reward);
    if (s.winner === g.side) wins++;
    preshots += s.preshots[g.side];
    anticipations += s.anticipations[g.side];
  }
  const out: WorkerOut = { type: "result", id: msg.id, fitness: fitness / msg.games.length, wins, games: msg.games.length, preshots, anticipations };
  parentPort!.postMessage(out);
});
