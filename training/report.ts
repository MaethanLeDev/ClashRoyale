import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionCard, brainSpace, describeAction, spaceFor, ANCHORS, type BrainFile } from "../shared/ai/brain";
import { playMatch, type Contender } from "../shared/ai/match";
import { STYLES } from "../shared/ai/styles";
import { CARDS } from "../shared/cards";
import type { Team } from "../shared/protocol";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const GAMES = Number(process.argv[process.argv.indexOf("--games") + 1]) || 40;
const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

const spark = (values: number[]) => {
  const bars = "▁▂▃▄▅▆▇█";
  if (!values.length) return "";
  const step = Math.max(1, Math.ceil(values.length / 40));
  const pts: number[] = [];
  for (let i = 0; i < values.length; i += step) pts.push(values[i]);
  return pts.map((v) => bars[Math.max(0, Math.min(7, Math.round(v * 7)))]).join("");
};

const bots: { id: string; label: string; c: Contender }[] = [{ id: "classique", label: "Bot classique", c: { kind: "heuristic" } }];

say("# Rapport d'entraînement USMB Arena");
say("");
say(`Généré le ${new Date().toLocaleString("fr-FR")}`);
say("");
say("## Cerveaux");
say("");
say("| Bot | Arène | Générations | Parties jouées | % vs classique | Score ligue | Mis à jour |");
say("|---|---|---|---|---|---|---|");
for (const st of STYLES) {
  const file = resolve(ROOT, "server", "brains", `${st.id}.json`);
  if (!existsSync(file)) {
    say(`| ${st.label} | ${st.arena + 1} | — | — | pas encore de cerveau | — | — |`);
    continue;
  }
  const b = JSON.parse(readFileSync(file, "utf8")) as BrainFile;
  const ok = !!brainSpace(b);
  say(`| ${st.label} | ${st.arena + 1} | ${b.meta.generations} | ${b.meta.games.toLocaleString("fr-FR")} | ${(b.meta.winRateVsHeuristic * 100).toFixed(1)} % | ${b.meta.leagueScore !== undefined ? `${(b.meta.leagueScore * 100).toFixed(1)} %` : "—"} | ${new Date(b.meta.updatedAt).toLocaleString("fr-FR")}${ok ? "" : " (incompatible)"} |`);
  if (ok) bots.push({ id: st.id, label: st.label, c: { kind: "brain", params: Float32Array.from(b.params), layers: b.layers, deck: b.deck, cards: b.cards } });
}

say("");
say("## Progression pendant l'entraînement");
say("");
say("Pourcentage de victoires contre le bot classique, mesuré toutes les 90 s (de gauche à droite) :");
say("");
say("```");
for (const st of STYLES) {
  const csv = resolve(ROOT, "training", "logs", `${st.id}.csv`);
  if (!existsSync(csv)) continue;
  const rows = readFileSync(csv, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const wr = rows.map((r) => Number(r[4])).filter((v) => Number.isFinite(v));
  const gps = rows.map((r) => Number(r[r.length - 1])).filter((v) => Number.isFinite(v));
  const last = wr[wr.length - 1] ?? 0;
  say(`${st.label.padEnd(20)} ${spark(wr)}  ${(last * 100).toFixed(0)} %  (${gps.length ? gps[gps.length - 1].toFixed(0) : "?"} parties/s)`);
}
say("```");

say("");
say(`## Tournoi (${GAMES} parties par duel, côtés alternés)`);
say("");
const usage = new Map<string, Map<number, number>>();
const habits = new Map<string, { elixir: number; distinct: number; games: number }>();
const results: number[][] = bots.map(() => bots.map(() => NaN));
let seed = 99;
for (let i = 0; i < bots.length; i++) {
  for (let j = i + 1; j < bots.length; j++) {
    let wi = 0;
    let wj = 0;
    for (let g = 0; g < GAMES; g++) {
      const swap = g % 2 === 1;
      const [A, B] = swap ? [bots[j], bots[i]] : [bots[i], bots[j]];
      const s = playMatch(A.c, B.c, seed++, (team: Team, action: number) => {
        const who = team === 0 ? A.id : B.id;
        if (!usage.has(who)) usage.set(who, new Map());
        const m = usage.get(who)!;
        m.set(action, (m.get(action) ?? 0) + 1);
      });
      for (const [team, bot] of [[0, A], [1, B]] as const) {
        const hb = habits.get(bot.id) ?? { elixir: 0, distinct: 0, games: 0 };
        hb.elixir += s.avgElixir[team];
        hb.distinct += s.distinctCards[team];
        hb.games++;
        habits.set(bot.id, hb);
      }
      const winnerBot = s.winner === -1 ? null : s.winner === 0 ? A : B;
      if (winnerBot === bots[i]) wi++;
      else if (winnerBot === bots[j]) wj++;
    }
    results[i][j] = wi / GAMES;
    results[j][i] = wj / GAMES;
    process.stderr.write(".");
  }
}
process.stderr.write("\n");
say(`| Ligne bat colonne | ${bots.map((b) => b.label).join(" | ")} |`);
say(`|---|${bots.map(() => "---").join("|")}|`);
for (let i = 0; i < bots.length; i++) {
  say(`| **${bots[i].label}** | ${bots.map((_, j) => (i === j ? "—" : `${Math.round(results[i][j] * 100)} %`)).join(" | ")} |`);
}

say("");
say("## Ce que chaque bot joue le plus");
for (const b of bots.slice(1)) {
  const m = usage.get(b.id);
  if (!m) continue;
  const space = spaceFor(b.c.kind === "brain" && b.c.cards ? b.c.cards : []);
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  say("");
  say(`**${b.label}** (${total} cartes jouées)`);
  say("");
  const byCard = new Map<string, number>();
  for (const [a, n] of m) {
    const card = actionCard(a, space);
    if (!card) continue;
    byCard.set(CARDS[card].name, (byCard.get(CARDS[card].name) ?? 0) + n);
  }
  const hb = habits.get(b.id);
  if (hb) say(`- Caféine moyenne ${(hb.elixir / hb.games).toFixed(1)} · ${(hb.distinct / hb.games).toFixed(1)} cartes différentes jouées par partie (sur 8)`);
  say(`- Cartes : ${[...byCard].sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${Math.round((n / total) * 100)} %`).join(", ")}`);
  const top = [...m].sort((x, y) => y[1] - x[1]).slice(0, 6);
  say(`- Coups favoris : ${top.map(([a, n]) => `${describeAction(a, space)} (${n})`).join(", ")}`);
  const imad = [...m].filter(([a]) => actionCard(a, space) === "imad");
  if (imad.length) {
    const tot = imad.reduce((s, [, n]) => s + n, 0);
    const magnet = imad.filter(([a]) => ANCHORS[(a - 1) % ANCHORS.length].name.startsWith("aimant")).reduce((s, [, n]) => s + n, 0);
    say(`- QG d'Imad posé en position d'aimant : ${Math.round((magnet / tot) * 100)} % des fois`);
  }
}

const out = resolve(ROOT, "training", "rapport.md");
writeFileSync(out, lines.join("\n") + "\n");
console.log(`\nRapport écrit dans training/rapport.md`);
