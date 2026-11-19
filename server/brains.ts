import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DECK, type CardId } from "../shared/cards";
import { AI_CARDS, ACTION_COUNT, INPUT_SIZE, NeuralBot, paramCount, type BrainFile } from "../shared/ai/brain";
import { Bot } from "../shared/ai/heuristic";
import { arenaProgress, heuristicSlowness, neuralDifficulty, styleForArena } from "../shared/ai/styles";
import type { Sim } from "../shared/sim";

const DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "brains");
const cache = new Map<string, { mtime: number; brain: BrainFile; params: Float32Array } | null>();

export interface BotLike {
  playerId: string;
  update(dt: number): void;
}

function load(style: string) {
  const file = resolve(DIR, `${style}.json`);
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  const hit = cache.get(style);
  if (hit && hit.mtime === mtime) return hit;
  try {
    const brain = JSON.parse(readFileSync(file, "utf8")) as BrainFile;
    const ok =
      brain.layers[0] === INPUT_SIZE && brain.layers[brain.layers.length - 1] === ACTION_COUNT &&
      brain.params.length === paramCount(brain.layers) && JSON.stringify(brain.cards) === JSON.stringify(AI_CARDS);
    if (!ok) {
      console.warn(`  Cerveau ${style}.json incompatible avec cette version du jeu, bot classique utilisé.`);
      cache.set(style, null);
      return null;
    }
    const entry = { mtime, brain, params: Float32Array.from(brain.params) };
    cache.set(style, entry);
    console.log(`  Cerveau "${brain.label}" chargé (${brain.meta.games.toLocaleString("fr-FR")} parties d'entraînement).`);
    return entry;
  } catch {
    return null;
  }
}

export function botDeck(arena: number): CardId[] {
  const style = styleForArena(arena);
  if (!style) return DEFAULT_DECK;
  return load(style.id)?.brain.deck ?? DEFAULT_DECK;
}

export function createBot(sim: Sim, playerId: string, arena: number, trophies: number): BotLike {
  const progress = arenaProgress(trophies, arena);
  const style = styleForArena(arena);
  const entry = style ? load(style.id) : null;
  if (!entry) return new Bot(sim, playerId, heuristicSlowness(progress));
  return new NeuralBot(sim, playerId, entry.params, entry.brain.layers, neuralDifficulty(arena, progress));
}

export function brainSummary(arena: number): { label: string; description: string } | null {
  const style = styleForArena(arena);
  if (!style || !load(style.id)) return null;
  return { label: style.label, description: style.description };
}
