import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TROPHY_LOSS, TROPHY_WIN } from "../shared/arenas";
import type { CardId } from "../shared/cards";

export interface Stats {
  trophies: number;
  best: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Account extends Stats {
  name: string;
  salt: string;
  hash: string;
  createdAt: string;
  deck?: CardId[];
}

interface Guest extends Stats {
  name: string;
}

interface DbShape {
  version: 1;
  accounts: Record<string, Account>;
  guests: Record<string, Guest>;
  sessions: Record<string, { key: string; expires: number }>;
}

export type Identity = { kind: "account"; key: string } | { kind: "guest"; name: string };

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)), "data");
const FILE = resolve(ROOT, "db.json");
const LEGACY = resolve(ROOT, "profiles.json");
const BACKUPS = resolve(ROOT, "backups");
const KEEP_BACKUPS = 14;
const SESSION_DAYS = 60;

let db: DbShape = { version: 1, accounts: {}, guests: {}, sessions: {} };
let saveTimer: NodeJS.Timeout | null = null;

try {
  if (existsSync(FILE)) {
    db = { ...db, ...JSON.parse(readFileSync(FILE, "utf8")) };
  } else if (existsSync(LEGACY)) {
    const legacy = JSON.parse(readFileSync(LEGACY, "utf8")) as Record<string, Guest>;
    for (const [k, p] of Object.entries(legacy)) db.guests[k] = { name: p.name, trophies: p.trophies, best: p.best, wins: p.wins, losses: p.losses, draws: p.draws ?? 0 };
    scheduleSave();
  }
} catch (err) {
  console.error("  Impossible de lire data/db.json, on repart d'une base vide :", (err as Error).message);
}

export const keyOf = (name: string) => name.trim().toLowerCase();

function emptyStats(): Stats {
  return { trophies: 0, best: 0, wins: 0, losses: 0, draws: 0 };
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function newSession(key: string): string {
  const token = randomBytes(24).toString("hex");
  db.sessions[token] = { key, expires: Date.now() + SESSION_DAYS * 86_400_000 };
  scheduleSave();
  return token;
}

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 3 || name.length > 16) return "Le pseudo doit faire entre 3 et 16 caractères";
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return "Le pseudo ne peut contenir que des lettres, chiffres, espaces, _ . -";
  return null;
}

export function isRegistered(name: string): boolean {
  return keyOf(name) in db.accounts;
}

export function register(rawName: string, password: string): { account: Account; key: string; token: string } | string {
  const name = rawName.trim();
  const invalid = validateName(name);
  if (invalid) return invalid;
  if (password.length < 4) return "Le mot de passe doit faire au moins 4 caractères";
  if (password.length > 200) return "Mot de passe trop long";
  const key = keyOf(name);
  if (db.accounts[key]) return "Ce pseudo est déjà pris";
  const salt = randomBytes(16).toString("hex");
  const guest = db.guests[key];
  const account: Account = {
    name, salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString(),
    ...(guest ? { trophies: guest.trophies, best: guest.best, wins: guest.wins, losses: guest.losses, draws: guest.draws } : emptyStats()),
  };
  db.accounts[key] = account;
  delete db.guests[key];
  return { account, key, token: newSession(key) };
}

export function login(rawName: string, password: string): { account: Account; key: string; token: string } | string {
  const key = keyOf(rawName);
  const account = db.accounts[key];
  const wrong = "Pseudo ou mot de passe incorrect";
  if (!account) return wrong;
  const expected = Buffer.from(account.hash, "hex");
  const actual = Buffer.from(hashPassword(password, account.salt), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return wrong;
  return { account, key, token: newSession(key) };
}

export function resume(token: string): { account: Account; key: string } | null {
  const s = db.sessions[token];
  if (!s) return null;
  if (s.expires < Date.now() || !db.accounts[s.key]) {
    delete db.sessions[token];
    scheduleSave();
    return null;
  }
  return { account: db.accounts[s.key], key: s.key };
}

export function logout(token: string) {
  if (db.sessions[token]) {
    delete db.sessions[token];
    scheduleSave();
  }
}

export function saveDeck(key: string, deck: CardId[]) {
  const a = db.accounts[key];
  if (!a) return;
  a.deck = deck.slice();
  scheduleSave();
}

function statsOf(id: Identity): Stats {
  if (id.kind === "account") return db.accounts[id.key] ?? emptyStats();
  const key = keyOf(id.name);
  db.guests[key] ??= { name: id.name, ...emptyStats() };
  return db.guests[key];
}

export function profileOf(id: Identity): Stats {
  return statsOf(id);
}

export function recordResult(id: Identity, result: "win" | "loss" | "draw", vsBotsOnly: boolean): { delta: number; profile: Stats } {
  const p = statsOf(id);
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

function backup() {
  try {
    if (!existsSync(FILE)) return;
    mkdirSync(BACKUPS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = resolve(BACKUPS, `db-${day}.json`);
    if (!existsSync(target)) copyFileSync(FILE, target);
    const files = readdirSync(BACKUPS).filter((f) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) rmSync(resolve(BACKUPS, old));
  } catch (err) {
    console.error("  Sauvegarde quotidienne impossible :", (err as Error).message);
  }
}

backup();
setInterval(backup, 3 * 3_600_000).unref();

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const now = Date.now();
      for (const [t, s] of Object.entries(db.sessions)) if (s.expires < now) delete db.sessions[t];
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE + ".tmp", JSON.stringify(db, null, 2));
      renameSync(FILE + ".tmp", FILE);
    } catch (err) {
      console.error("  Sauvegarde de la base impossible :", (err as Error).message);
    }
  }, 300);
}
