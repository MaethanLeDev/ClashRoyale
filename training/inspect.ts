// Coup d'œil rapide sur un cerveau en cours d'entraînement (sans attendre le rapport complet).
// npm run train:inspect -- rush            → dernier point de reprise (training/checkpoints)
// npm run train:inspect -- rush --published → cerveau publié (server/brains)
// --games 40 pour plus de parties contre le bot classique.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionCard, brainSpace, describeAction, type BrainFile } from "../shared/ai/brain";
import { playMatch, type Contender } from "../shared/ai/match";
import { CARDS } from "../shared/cards";
import type { Team } from "../shared/protocol";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const style = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "rush";
const published = process.argv.includes("--published");
const gi = process.argv.indexOf("--games");
const GAMES = gi > 0 ? Number(process.argv[gi + 1]) || 24 : 24;

const file = resolve(ROOT, published ? "server/brains" : "training/checkpoints", `${style}.json`);
if (!existsSync(file)) {
  console.log(`Pas encore de cerveau pour « ${style} » (${file}).`);
  process.exit(0);
}
const b = JSON.parse(readFileSync(file, "utf8")) as BrainFile;
const space = brainSpace(b);
if (!space) {
  console.log(`Cerveau « ${style} » incompatible avec le code actuel.`);
  process.exit(0);
}
const me: Contender = { kind: "brain", params: Float32Array.from(b.params), layers: b.layers, deck: b.deck, cards: b.cards };
const classic: Contender = { kind: "heuristic" };

const usage = new Map<number, number>();
let wins = 0;
let draws = 0;
let elixir = 0;
let distinct = 0;
let crownsFor = 0;
let crownsAgainst = 0;
let duration = 0;
for (let g = 0; g < GAMES; g++) {
  const side: Team = (g % 2) as Team;
  const [A, B] = side === 0 ? [me, classic] : [classic, me];
  const s = playMatch(A, B, 5000 + g, (team, action) => {
    if (team === side) usage.set(action, (usage.get(action) ?? 0) + 1);
  });
  if (s.winner === side) wins++;
  else if (s.winner === -1) draws++;
  elixir += s.avgElixir[side];
  distinct += s.distinctCards[side];
  crownsFor += s.crowns[side];
  crownsAgainst += s.crowns[side === 0 ? 1 : 0];
  duration += s.time;
}

const total = [...usage.values()].reduce((s, v) => s + v, 0);
const byCard = new Map<string, number>();
for (const id of b.deck) byCard.set(CARDS[id].name, 0);
for (const [a, n] of usage) {
  const card = actionCard(a, space);
  if (card) byCard.set(CARDS[card].name, (byCard.get(CARDS[card].name) ?? 0) + n);
}
const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)} %`;

console.log(`${b.label} · gén ${b.meta.generations} · ${b.meta.games.toLocaleString("fr-FR")} parties · score ligue ${((b.meta.leagueScore ?? 0) * 100).toFixed(0)} % · ${b.meta.updatedAt}`);
console.log(`Contre le bot classique (${GAMES} parties) : ${Math.round((wins / GAMES) * 100)} % de victoires, ${draws} nul(s), couronnes ${(crownsFor / GAMES).toFixed(1)} – ${(crownsAgainst / GAMES).toFixed(1)}, partie moyenne ${Math.round(duration / GAMES)} s`);
console.log(`Caféine moyenne en réserve ${(elixir / GAMES).toFixed(1)} · ${(distinct / GAMES).toFixed(1)} cartes différentes par partie (sur 8) · ${(total / GAMES).toFixed(1)} cartes posées par partie`);
console.log(`Cartes : ${[...byCard].sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${pct(n)}`).join(", ")}`);
const top = [...usage].sort((x, y) => y[1] - x[1]).slice(0, 6);
console.log(`Coups favoris : ${top.map(([a, n]) => `${describeAction(a, space)} ${pct(n)}`).join(", ")}`);
