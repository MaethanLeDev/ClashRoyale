import type { CardId } from "../cards";
import { ARENAS } from "../arenas";
import type { NeuralOptions } from "./brain";

export interface RewardWeights {
  win: number;
  crowns: number;
  towerDealt: number;
  towerTaken: number;
  trade: number;
  preshot: number;
  anticipation: number;
  aggression: number;
  variety: number;
}

export interface StyleDef {
  id: string;
  arena: number;
  label: string;
  description: string;
  deck: CardId[];
  reward: RewardWeights;
  minutesPerNight: number;
}

export const STYLES: StyleDef[] = [
  {
    id: "rush",
    arena: 1,
    label: "Le Rusheur",
    description: "Pousse sans arrêt au pont et cherche les tours le plus vite possible.",
    deck: ["tarit", "natis", "nazar", "midas", "goutier", "valere", "tordeux", "niels"],
    reward: { win: 1, crowns: 0.4, towerDealt: 1.2, towerTaken: 0.3, trade: 0.1, preshot: 0, anticipation: 0, aggression: 0.015, variety: 0.25 },
    minutesPerNight: 75,
  },
  {
    id: "defense",
    arena: 2,
    label: "Le Mur",
    description: "Défend tout, gagne les échanges de caféine et punit en contre-attaque.",
    deck: ["imad", "valere", "tordeux", "goutier", "niels", "natis", "nazar", "samy"],
    reward: { win: 1, crowns: 0.2, towerDealt: 0.3, towerTaken: 1.2, trade: 0.6, preshot: 0, anticipation: 0.03, aggression: 0, variety: 0.3 },
    minutesPerNight: 75,
  },
  {
    id: "preshot",
    arena: 3,
    label: "Le Devin",
    description: "Compte ton cycle et ta caféine, et pose sa défense ou son Papy Niels avant même que tu joues.",
    deck: ["niels", "midas", "nazar", "goutier", "valere", "tordeux", "imad", "tarit"],
    reward: { win: 1, crowns: 0.2, towerDealt: 0.4, towerTaken: 0.4, trade: 0.2, preshot: 0.15, anticipation: 0.12, aggression: 0, variety: 0.25 },
    minutesPerNight: 120,
  },
  {
    id: "boss",
    arena: 4,
    label: "Le Boss du Volcan",
    description: "Entraîné plus longtemps que tous les autres, contre tous les autres. Aucune pitié.",
    deck: ["samy", "valere", "tordeux", "niels", "nazar", "goutier", "natis", "tarit"],
    reward: { win: 1.5, crowns: 0.5, towerDealt: 0.3, towerTaken: 0.3, trade: 0.1, preshot: 0.03, anticipation: 0.03, aggression: 0, variety: 0.2 },
    minutesPerNight: 210,
  },
];

export function styleForArena(arena: number): StyleDef | undefined {
  return STYLES.find((s) => s.arena === arena);
}

export function arenaProgress(trophies: number, arena: number): number {
  const a = ARENAS[arena];
  const next = ARENAS[arena + 1];
  const span = next ? next.trophies - a.trophies : 1000;
  return Math.max(0, Math.min(1, (trophies - a.trophies) / span));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function neuralDifficulty(arena: number, progress: number): NeuralOptions {
  if (arena >= 4) {
    return { think: lerp(0.4, 0.22, progress), epsilon: lerp(0.04, 0, progress), temperature: lerp(0.08, 0, progress) };
  }
  const base = arena / 4;
  const d = Math.min(1, base * 0.6 + progress * 0.4);
  return { think: lerp(0.95, 0.35, d), epsilon: lerp(0.22, 0.03, d), temperature: lerp(0.5, 0.05, d) };
}

export function heuristicSlowness(progress: number): number {
  return lerp(1, 0, progress);
}
