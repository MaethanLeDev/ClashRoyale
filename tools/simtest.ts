import { DEFAULT_DECK } from "../shared/cards";
import { DT } from "../shared/constants";
import { Sim } from "../shared/sim";
import { Bot } from "../shared/ai/heuristic";

const games = Number(process.argv[2] ?? 10);
const results = { 0: 0, 1: 0, "-1": 0 } as Record<string, number>;
const plays: Record<string, number> = {};
let totalTime = 0;
for (let g = 0; g < games; g++) {
  const sim = new Sim();
  sim.addPlayer("a", "A", 0, DEFAULT_DECK, true);
  sim.addPlayer("b", "B", 1, DEFAULT_DECK, true);
  const bots = [new Bot(sim, "a"), new Bot(sim, "b")];
  let steps = 0;
  while (sim.phase !== "ended" && steps < 20 * 60 * 6) {
    for (const b of bots) b.update(DT);
    sim.step(DT);
    for (const e of sim.events) if (e.e === "deploy") plays[e.c] = (plays[e.c] ?? 0) + 1;
    sim.clearEvents();
    steps++;
    for (const u of sim.units) {
      if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) throw new Error("NaN position " + u.card);
      if (u.y > 15.05 && u.y < 16.95 && Math.min(Math.abs(u.x - 3.5), Math.abs(u.x - 14.5)) > 1.01) {
        throw new Error(`unit in river ${u.card} ${u.x.toFixed(2)} ${u.y.toFixed(2)}`);
      }
    }
  }
  results[String(sim.winner)]++;
  totalTime += sim.time;
  console.log(`game ${g}: winner=${sim.winner} crowns=${sim.crowns} time=${sim.time.toFixed(0)}s overtime=${sim.overtime}`);
}
console.log(results, "avg time", (totalTime / games).toFixed(0), plays);
