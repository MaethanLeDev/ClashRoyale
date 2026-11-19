import { DEFAULT_DECK } from "../../shared/cards";
import { DT } from "../../shared/constants";
import { Sim } from "../../shared/sim";
import { Bot } from "../../shared/ai/heuristic";
import { GameView } from "./game/view";

export interface Preview {
  dispose(): void;
}

export function createPreview(container: HTMLElement, arena: number, orbit = 0): Preview {
  const overlay = document.createElement("div");
  overlay.className = "preview-overlay";
  container.appendChild(overlay);
  const view = new GameView({
    container,
    overlay,
    team: 0,
    arena,
    preview: true,
    orbit,
    getInsets: () => ({ top: 0, bottom: 0 }),
    onPlay: () => {},
    onSelect: () => {},
    onToast: () => {},
  });
  let sim: Sim;
  let bots: Bot[];
  const reset = () => {
    sim = new Sim();
    sim.phase = "playing";
    sim.addPlayer("a", "Bleu", 0, DEFAULT_DECK, true);
    sim.addPlayer("b", "Rouge", 1, DEFAULT_DECK, true);
    for (const p of sim.players.values()) p.elixir = 8;
    bots = [new Bot(sim, "a"), new Bot(sim, "b")];
  };
  reset();
  const timer = setInterval(() => {
    for (const b of bots) b.update(DT);
    sim.step(DT);
    view.applyState(sim.snapshotFor(null));
    sim.clearEvents();
    if (sim.phase === "ended" || sim.time > 70) reset();
  }, DT * 1000);
  return {
    dispose() {
      clearInterval(timer);
      view.dispose();
      overlay.remove();
    },
  };
}
