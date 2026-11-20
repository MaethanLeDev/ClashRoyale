import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { defaultLayers, paramCount, type BrainFile } from "../shared/ai/brain";
import { mulberry32 } from "../shared/ai/match";
import { STYLES, type StyleDef } from "../shared/ai/styles";
import { AI_CARDS } from "../shared/ai/brain";
import type { Team } from "../shared/protocol";
import { gaussianInto, type OpponentSpec, type WorkerIn, type WorkerOut } from "./worker";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BRAINS = resolve(ROOT, "server", "brains");
const LOGS = resolve(ROOT, "training", "logs");
const CKPT = resolve(ROOT, "training", "checkpoints");

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  if (i >= 0) return "true";
  return def;
}

const workersCount = Number(arg("workers", String(Math.max(1, availableParallelism() - 1))));
const popHalf = Number(arg("pop", "48"));
const gamesPerMember = Number(arg("games", "8"));
const sigma = Number(arg("sigma", "0.03"));
const lr = Number(arg("lr", "0.012"));
const fresh = arg("fresh") === "true";

function brainPath(style: string) {
  return resolve(BRAINS, `${style}.json`);
}

function ckptPath(style: string) {
  return resolve(CKPT, `${style}.json`);
}

function loadBrain(style: string, checkpoint = false): BrainFile | null {
  const p = checkpoint ? ckptPath(style) : brainPath(style);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as BrainFile;
  } catch {
    return null;
  }
}

function saveBrain(b: BrainFile, checkpoint = false) {
  mkdirSync(checkpoint ? CKPT : BRAINS, { recursive: true });
  const p = checkpoint ? ckptPath(b.style) : brainPath(b.style);
  writeFileSync(p + ".tmp", JSON.stringify(b));
  renameSync(p + ".tmp", p);
}

function initParams(layers: number[], seed: number): Float32Array {
  const p = new Float32Array(paramCount(layers));
  const rng = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
  let off = 0;
  for (let l = 0; l < layers.length - 1; l++) {
    const nin = layers[l];
    const nout = layers[l + 1];
    const scale = (l === layers.length - 2 ? 0.3 : 1) / Math.sqrt(nin);
    for (let i = 0; i < nin * nout; i++) p[off + i] = g() * scale;
    off += nin * nout + nout;
  }
  return p;
}

class Pool {
  workers: Worker[] = [];
  private queue: { msg: WorkerIn; resolve: (r: WorkerOut) => void }[] = [];
  private idle: Worker[] = [];
  private pending = new Map<Worker, (r: WorkerOut) => void>();

  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./worker-entry.mjs", import.meta.url));
      w.on("message", (r: WorkerOut) => {
        const done = this.pending.get(w);
        this.pending.delete(w);
        this.idle.push(w);
        done?.(r);
        this.pump();
      });
      w.on("error", (err) => {
        console.error("Erreur dans un worker :", err);
        process.exit(1);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  broadcast(msg: WorkerIn) {
    for (const w of this.workers) w.postMessage(msg);
  }

  run(msg: WorkerIn): Promise<WorkerOut> {
    return new Promise((res) => {
      this.queue.push({ msg, resolve: res });
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(w, job.resolve);
      w.postMessage(job.msg);
    }
  }

  async close() {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

function centeredRanks(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length).fill(0);
  idx.forEach(([, i], r) => (out[i] = r / (values.length - 1) - 0.5));
  return out;
}

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`;
};

async function trainStyle(style: StyleDef, minutes: number, pool: Pool) {
  const layers = defaultLayers();
  const n = paramCount(layers);
  const published = fresh ? null : loadBrain(style.id);
  const existing = fresh ? null : loadBrain(style.id, true) ?? published;
  const compatible =
    existing && existing.params.length === n && JSON.stringify(existing.layers) === JSON.stringify(layers) &&
    JSON.stringify(existing.cards) === JSON.stringify(AI_CARDS);
  let theta = compatible ? Float32Array.from(existing!.params) : initParams(layers, 1234 + style.arena);
  let generations = compatible ? existing!.meta.generations : 0;
  let totalGames = compatible ? existing!.meta.games : 0;
  let lastWinRate = compatible ? existing!.meta.winRateVsHeuristic : 0;
  let lastScore = 0;
  let bestScore = published && published.params.length === n ? 0 : -1;

  console.log(`\n=== ${style.label} (arène ${style.arena + 1}, style "${style.id}") ===`);
  console.log(compatible ? `Reprise : ${generations} générations déjà faites, ${totalGames} parties.` : "Nouveau cerveau, on part de zéro.");
  console.log(`${n} paramètres · ${pool.workers.length} workers · population ${popHalf * 2} · ${gamesPerMember} parties par membre · ${minutes} min\n`);

  const league: OpponentSpec[] = [{ kind: "heuristic" }];
  const others: OpponentSpec[] = [];
  const otherNames: string[] = [];
  for (const s of STYLES) {
    if (s.id === style.id) continue;
    const b = loadBrain(s.id);
    if (b && b.params.length === n) {
      others.push({ kind: "brain", params: Float32Array.from(b.params), layers: b.layers, deck: b.deck });
      otherNames.push(s.label);
    }
  }
  const snapshots: OpponentSpec[] = [];
  const rebuildLeague = () => {
    league.length = 1;
    league.push(...others, ...snapshots);
    pool.broadcast({ type: "league", opponents: league });
  };

  pool.broadcast({ type: "setup", layers, deck: style.deck, reward: style.reward, sigma });
  rebuildLeague();

  const m = new Float32Array(n);
  const v = new Float32Array(n);
  const beta1 = 0.9;
  const beta2 = 0.999;
  let step = 0;
  const eps = new Float32Array(n);
  const grad = new Float32Array(n);
  const start = Date.now();
  const deadline = start + minutes * 60_000;
  const rng = mulberry32((Date.now() ^ (style.arena * 7919)) >>> 0);
  mkdirSync(LOGS, { recursive: true });
  const csv = resolve(LOGS, `${style.id}.csv`);
  if (!existsSync(csv)) appendFileSync(csv, "date,generation,games,meanFitness,winRateVsHeuristic,preshotsPerGame,anticipationsPerGame,gamesPerSecond,leagueScore\n");

  const pickOpp = (): number => {
    const r = rng();
    const isBoss = style.id === "boss";
    if (r < (isBoss ? 0.2 : 0.4) || league.length === 1) return 0;
    if (others.length && r < (isBoss ? 0.7 : 0.65)) return 1 + Math.floor(rng() * others.length);
    if (snapshots.length) return 1 + others.length + Math.floor(rng() * snapshots.length);
    return 0;
  };

  const evaluate = async (gamesPerOpponent: number): Promise<{ vsHeuristic: number; score: number; detail: string }> => {
    pool.broadcast({ type: "theta", theta });
    const opponents = 1 + others.length;
    const chunks = Math.max(1, Math.ceil(pool.workers.length / opponents));
    const per = Math.ceil(gamesPerOpponent / chunks);
    const jobs: Promise<WorkerOut>[] = [];
    for (let o = 0; o < opponents; o++) {
      for (let c = 0; c < chunks; c++) {
        const list = Array.from({ length: per }, (_, i) => ({ seed: (rng() * 2 ** 31) >>> 0, opp: o, side: ((c + i) % 2) as Team }));
        jobs.push(pool.run({ type: "job", id: o, noiseSeed: 0, sign: 0, games: list }));
      }
    }
    const res = await Promise.all(jobs);
    const rates: number[] = [];
    for (let o = 0; o < opponents; o++) {
      const mine = res.filter((r) => r.id === o);
      const games = mine.reduce((s, r) => s + r.games, 0);
      rates.push(mine.reduce((s, r) => s + r.wins, 0) / Math.max(1, games));
      totalGames += games;
    }
    const names = ["classique", ...otherNames];
    return {
      vsHeuristic: rates[0],
      score: rates.reduce((s, r) => s + r, 0) / rates.length,
      detail: rates.map((r, i) => `${names[i]} ${Math.round(r * 100)} %`).join(", "),
    };
  };

  if (bestScore >= 0 && published) {
    const current = theta;
    theta = Float32Array.from(published.params);
    const ev = await evaluate(Math.max(96, pool.workers.length * 8));
    bestScore = ev.score;
    theta = current;
    console.log(`Cerveau publié réévalué : score ${(bestScore * 100).toFixed(1)} % (${ev.detail}). C'est le record à battre.\n`);
  }

  let lastLog = 0;
  let lastSave = Date.now();
  let gamesThisRun = 0;
  while (Date.now() < deadline) {
    pool.broadcast({ type: "theta", theta });
    const seeds = Array.from({ length: popHalf }, () => (rng() * 2 ** 31) >>> 0);
    const games = Array.from({ length: gamesPerMember }, (_, i) => ({ seed: (rng() * 2 ** 31) >>> 0, opp: pickOpp(), side: (i % 2) as Team }));
    const jobs: Promise<WorkerOut>[] = [];
    for (let k = 0; k < popHalf; k++) {
      jobs.push(pool.run({ type: "job", id: 2 * k, noiseSeed: seeds[k], sign: 1, games }));
      jobs.push(pool.run({ type: "job", id: 2 * k + 1, noiseSeed: seeds[k], sign: -1, games }));
    }
    const results = await Promise.all(jobs);
    results.sort((a, b) => a.id - b.id);
    const fit = results.map((r) => r.fitness);
    const ranks = centeredRanks(fit);
    grad.fill(0);
    for (let k = 0; k < popHalf; k++) {
      const w = ranks[2 * k] - ranks[2 * k + 1];
      if (w === 0) continue;
      gaussianInto(seeds[k], eps);
      for (let i = 0; i < n; i++) grad[i] += w * eps[i];
    }
    step++;
    const scale = 1 / (2 * popHalf * sigma);
    const b1 = 1 - beta1 ** step;
    const b2 = 1 - beta2 ** step;
    for (let i = 0; i < n; i++) {
      const g = -grad[i] * scale + 0.005 * theta[i];
      m[i] = beta1 * m[i] + (1 - beta1) * g;
      v[i] = beta2 * v[i] + (1 - beta2) * g * g;
      theta[i] -= (lr * (m[i] / b1)) / (Math.sqrt(v[i] / b2) + 1e-8);
    }
    generations++;
    const played = results.reduce((s, r) => s + r.games, 0);
    totalGames += played;
    gamesThisRun += played;
    const meanFit = fit.reduce((s, f) => s + f, 0) / fit.length;
    const preshots = results.reduce((s, r) => s + r.preshots, 0) / played;
    const anticipations = results.reduce((s, r) => s + r.anticipations, 0) / played;

    if (generations % 20 === 0) {
      snapshots.push({ kind: "brain", params: Float32Array.from(theta), layers, deck: style.deck });
      if (snapshots.length > 6) snapshots.shift();
      rebuildLeague();
    }

    const now = Date.now();
    if (now - lastSave > 90_000 || now >= deadline) {
      const ev = await evaluate(Math.max(48, pool.workers.length * 4));
      lastWinRate = ev.vsHeuristic;
      lastScore = ev.score;
      lastSave = Date.now();
      const brain: BrainFile = {
        version: 1, style: style.id, label: style.label, deck: style.deck, cards: AI_CARDS, layers,
        params: Array.from(theta, (x) => Math.round(x * 1e5) / 1e5),
        meta: {
          generations, games: totalGames, winRateVsHeuristic: Math.round(lastWinRate * 1000) / 1000,
          leagueScore: Math.round(lastScore * 1000) / 1000, updatedAt: new Date().toISOString(),
        },
      };
      saveBrain(brain, true);
      const improved = lastScore >= bestScore;
      if (improved) {
        bestScore = lastScore;
        saveBrain(brain);
      }
      const gps = gamesThisRun / ((now - start) / 1000);
      appendFileSync(csv, `${brain.meta.updatedAt},${generations},${totalGames},${meanFit.toFixed(4)},${lastWinRate.toFixed(3)},${preshots.toFixed(3)},${anticipations.toFixed(3)},${gps.toFixed(1)},${lastScore.toFixed(3)}\n`);
      console.log(
        `  💾 test : score ${(lastScore * 100).toFixed(1)} % (${ev.detail})` +
          (improved ? " · nouveau meilleur, publié dans server/brains" : ` · record : ${(bestScore * 100).toFixed(1)} %`),
      );
    }
    if (now - lastLog > 5000) {
      lastLog = now;
      const gps = gamesThisRun / ((now - start) / 1000);
      const left = Math.max(0, deadline - now);
      console.log(
        `[${style.id}] gén ${generations} · ${totalGames.toLocaleString("fr-FR")} parties · ${gps.toFixed(0)} parties/s · ` +
          `fitness ${meanFit.toFixed(3)} · préshots ${preshots.toFixed(2)} · anticipations ${anticipations.toFixed(2)} par partie · dernier score ${(lastScore * 100).toFixed(0)} % · reste ${fmtTime(left)}`,
      );
    }
  }
}

async function main() {
  const which = arg("style", "night")!;
  const hours = Number(arg("hours", "8"));
  const pool = new Pool(workersCount);
  const t0 = Date.now();
  try {
    if (which === "night" || which === "all") {
      const total = STYLES.reduce((s, st) => s + st.minutesPerNight, 0);
      for (const st of STYLES) await trainStyle(st, (st.minutesPerNight / total) * hours * 60, pool);
    } else {
      const st = STYLES.find((s) => s.id === which);
      if (!st) {
        console.error(`Style inconnu "${which}". Choix : ${STYLES.map((s) => s.id).join(", ")}, night`);
        process.exit(1);
      }
      await trainStyle(st, Number(arg("minutes", "30")), pool);
    }
  } finally {
    await pool.close();
  }
  console.log(`\nTerminé en ${fmtTime(Date.now() - t0)}. Les cerveaux sont dans server/brains/.`);
}

main();
