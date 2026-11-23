import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DECK, type CardId } from "../shared/cards";
import { brainSpace, NeuralBot, type BrainFile } from "../shared/ai/brain";
import { Bot } from "../shared/ai/heuristic";
import { arenaProgress, heuristicSlowness, neuralDifficulty, styleForArena, STYLES } from "../shared/ai/styles";
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
    if (!brainSpace(brain)) {
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
  return new NeuralBot(sim, playerId, entry.params, entry.brain.layers, neuralDifficulty(arena, progress), Math.random, entry.brain.cards);
}

export function brainSummary(arena: number): { label: string; description: string } | null {
  const style = styleForArena(arena);
  if (!style || !load(style.id)) return null;
  return { label: style.label, description: style.description };
}

/** Entraînement : bot choisi par le joueur (« classic » ou id de style), à pleine puissance. */
export interface PracticeBot {
  arena: number;
  label: string;
  deck: CardId[];
  create(sim: Sim, playerId: string): BotLike;
}

export function practiceBot(id: string): PracticeBot {
  const style = STYLES.find((s) => s.id === id);
  const entry = style ? load(style.id) : null;
  if (!style || !entry) {
    // Bot classique, sans ralentissement volontaire
    return { arena: style?.arena ?? 0, label: style ? style.label : "Bot classique", deck: DEFAULT_DECK, create: (sim, pid) => new Bot(sim, pid, 0) };
  }
  return {
    arena: style.arena,
    label: style.label,
    deck: entry.brain.deck,
    create: (sim, pid) => new NeuralBot(sim, pid, entry.params, entry.brain.layers, neuralDifficulty(style.arena, 1), Math.random, entry.brain.cards),
  };
}
