// Vérifie la mesure du préshot sur des parties réelles (bot classique et anciens cerveaux).
import { readFileSync } from "node:fs";
import { playMatch, type Contender } from "../shared/ai/match";
import type { BrainFile } from "../shared/ai/brain";

const load = (f: string): Contender => {
  const b = JSON.parse(readFileSync(f, "utf8")) as BrainFile;
  return { kind: "brain", params: Float32Array.from(b.params), layers: b.layers, deck: b.deck, cards: b.cards };
};
const classic: Contender = { kind: "heuristic" };
const pairs: [string, Contender, Contender][] = [
  ["classique vs classique", classic, classic],
  ["ancien Devin vs classique", load("training/sauvegarde-cerveaux-2026-11-22/preshot.json"), classic],
  ["ancien Mur vs classique", load("training/sauvegarde-cerveaux-2026-11-22/defense.json"), classic],
  ["ancien Rusheur vs classique", load("training/sauvegarde-cerveaux-2026-11-22/rush.json"), classic],
];
for (const [name, a, b] of pairs) {
  let ant = [0, 0];
  let pre = [0, 0];
  let pun = [0, 0];
  let brk = [0, 0];
  let el = [0, 0];
  const N = 30;
  for (let g = 0; g < N; g++) {
    const s = playMatch(a, b, 700 + g);
    ant = [ant[0] + s.anticipations[0], ant[1] + s.anticipations[1]];
    pre = [pre[0] + s.preshots[0], pre[1] + s.preshots[1]];
    pun = [pun[0] + s.punishes[0], pun[1] + s.punishes[1]];
    brk = [brk[0] + s.caughtBroke[0], brk[1] + s.caughtBroke[1]];
    el = [el[0] + s.avgElixir[0], el[1] + s.avgElixir[1]];
  }
  console.log(`${name.padEnd(28)} préshots réussis/partie : ${(ant[0] / N).toFixed(2)} vs ${(ant[1] / N).toFixed(2)} · sorts : ${(pre[0] / N).toFixed(2)} vs ${(pre[1] / N).toFixed(2)} · punitions : ${(pun[0] / N).toFixed(2)} vs ${(pun[1] / N).toFixed(2)} · pris à sec : ${(brk[0] / N).toFixed(2)} vs ${(brk[1] / N).toFixed(2)} · caféine moy. ${(el[0] / N).toFixed(1)} vs ${(el[1] / N).toFixed(1)}`);
}
