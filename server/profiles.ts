import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TROPHY_LOSS, TROPHY_WIN } from "../shared/arenas";

export interface Profile {
  name: string;
  trophies: number;
  best: number;
  wins: number;
  losses: number;
  draws: number;
}

const FILE = resolve(fileURLToPath(new URL("..", import.meta.url)), "data", "profiles.json");
let profiles: Record<string, Profile> = {};
let saveTimer: NodeJS.Timeout | null = null;

try {
  if (existsSync(FILE)) profiles = JSON.parse(readFileSync(FILE, "utf8"));
} catch (err) {
  console.error("  Impossible de lire data/profiles.json, on repart de zéro :", (err as Error).message);
}

const keyOf = (name: string) => name.trim().toLowerCase();

export function getProfile(name: string): Profile {
  const key = keyOf(name);
  profiles[key] ??= { name, trophies: 0, best: 0, wins: 0, losses: 0, draws: 0 };
  profiles[key].name = name;
  return profiles[key];
}

export function recordResult(name: string, result: "win" | "loss" | "draw", vsBotsOnly: boolean): { delta: number; profile: Profile } {
  const p = getProfile(name);
  const factor = vsBotsOnly ? 0.5 : 1;
  let delta = 0;
  if (result === "win") {
    delta = Math.round(TROPHY_WIN * factor);
    p.wins++;
  } else if (result === "loss") {
    delta = -Math.min(p.trophies, Math.round(TROPHY_LOSS * factor));
    p.losses++;
  } else {
    p.draws++;
  }
  p.trophies += delta;
  p.best = Math.max(p.best, p.trophies);
  scheduleSave();
  return { delta, profile: p };
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE + ".tmp", JSON.stringify(profiles, null, 2));
      renameSync(FILE + ".tmp", FILE);
    } catch (err) {
      console.error("  Sauvegarde des profils impossible :", (err as Error).message);
    }
  }, 500);
}
