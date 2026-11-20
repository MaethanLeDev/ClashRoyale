import type { IncomingMessage } from "node:http";

const MAX_CONNECTIONS_PER_IP = 12;
const AUTH_WINDOW_MS = 10 * 60_000;
const MAX_AUTH_PER_IP = 15;
const LOCK_WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_ACCOUNT = 8;
export const MAX_ROOMS = 200;
export const MAX_MESSAGE_BYTES = 16 * 1024;

const connections = new Map<string, number>();
const authAttempts = new Map<string, number[]>();
const accountFails = new Map<string, number[]>();

export function clientIp(req: IncomingMessage): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.socket.remoteAddress ?? "inconnue";
}

export function openConnection(ip: string): boolean {
  const n = connections.get(ip) ?? 0;
  if (n >= MAX_CONNECTIONS_PER_IP) return false;
  connections.set(ip, n + 1);
  return true;
}

export function closeConnection(ip: string) {
  const n = (connections.get(ip) ?? 1) - 1;
  if (n <= 0) connections.delete(ip);
  else connections.set(ip, n);
}

function recent(list: number[] | undefined, windowMs: number): number[] {
  const now = Date.now();
  return (list ?? []).filter((t) => now - t < windowMs);
}

export function authBlocked(ip: string, accountKey: string): string | null {
  const ipList = recent(authAttempts.get(ip), AUTH_WINDOW_MS);
  if (ipList.length >= MAX_AUTH_PER_IP) return "Trop de tentatives depuis cette connexion, réessaie dans quelques minutes";
  ipList.push(Date.now());
  authAttempts.set(ip, ipList);
  const fails = recent(accountFails.get(accountKey), LOCK_WINDOW_MS);
  if (fails.length >= MAX_FAILS_PER_ACCOUNT) return "Trop de mots de passe incorrects pour ce compte, réessaie dans 15 minutes";
  return null;
}

export function authFailed(accountKey: string) {
  const fails = recent(accountFails.get(accountKey), LOCK_WINDOW_MS);
  fails.push(Date.now());
  accountFails.set(accountKey, fails);
}

export function authSucceeded(accountKey: string) {
  accountFails.delete(accountKey);
}

export class MessageBudget {
  private tokens = 60;
  private last = Date.now();
  private strikes = 0;

  allow(): "ok" | "drop" | "kick" {
    const now = Date.now();
    this.tokens = Math.min(60, this.tokens + ((now - this.last) / 1000) * 30);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return "ok";
    }
    this.strikes++;
    return this.strikes > 200 ? "kick" : "drop";
  }
}

setInterval(() => {
  for (const [k, v] of authAttempts) if (!recent(v, AUTH_WINDOW_MS).length) authAttempts.delete(k);
  for (const [k, v] of accountFails) if (!recent(v, LOCK_WINDOW_MS).length) accountFails.delete(k);
}, 5 * 60_000).unref();
