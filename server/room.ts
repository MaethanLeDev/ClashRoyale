import { CARD_IDS, DEFAULT_DECK, DECK_SIZE, type CardId } from "../shared/cards";
import { DT } from "../shared/constants";
import type { Mode, RoomInfo, RoomPlayer, ServerMsg, Team } from "../shared/protocol";
import { Sim } from "../shared/sim";
import { Bot } from "../shared/ai/heuristic";
import { emoteById } from "../shared/emotes";
import { botDeck, brainSummary, createBot, type BotLike } from "./brains";
import { arenaFor } from "../shared/arenas";
import { profileOf, recordResult, type Identity } from "./db";

export interface Client {
  id: string;
  name: string;
  deck: CardId[];
  roomId: string | null;
  identity: Identity;
  send(msg: ServerMsg): void;
}

const BOT_NAMES = ["Bot Pascal", "Bot Hélène", "Bot Gérard", "Bot Sylvie", "Bot Thierry", "Bot Nadine"];

export function sanitizeDeck(deck: unknown): CardId[] {
  if (!Array.isArray(deck)) return DEFAULT_DECK.slice();
  const ids = [...new Set(deck.filter((c): c is CardId => typeof c === "string" && CARD_IDS.includes(c as CardId)))];
  if (ids.length !== DECK_SIZE) return DEFAULT_DECK.slice();
  return ids;
}

interface Slot extends RoomPlayer {
  client?: Client;
}

export class Room {
  status: "lobby" | "playing" = "lobby";
  slots: Slot[] = [];
  sim: Sim | null = null;
  bots: BotLike[] = [];
  private timer: NodeJS.Timeout | null = null;
  private botCounter = 0;
  /** Partie contre les bots lancée depuis « Jouer » : n'apparaît pas dans les combats amicaux. */
  solo = false;

  constructor(
    public id: string,
    public mode: Mode,
    public hostId: string,
    private onChange: () => void,
  ) {}

  get perTeam(): number {
    return this.mode === "1v1" ? 1 : 2;
  }

  get humans(): Slot[] {
    return this.slots.filter((s) => !s.bot && s.client);
  }

  private topTrophies(): number {
    return Math.max(0, ...this.humans.map((s) => profileOf(s.client!.identity).trophies));
  }

  info(): RoomInfo {
    const arena = arenaFor(this.topTrophies()).id;
    return {
      id: this.id, mode: this.mode, hostId: this.hostId, status: this.status, arena, solo: this.solo,
      botStyle: brainSummary(arena),
      players: this.slots.map(({ id, name, team, bot, ready, account }) => ({ id, name, team, bot, ready, account })),
    };
  }

  broadcast(msg: ServerMsg) {
    for (const s of this.slots) s.client?.send(msg);
  }

  private teamCount(team: Team): number {
    return this.slots.filter((s) => s.team === team).length;
  }

  private freeTeam(): Team | null {
    const a = this.teamCount(0);
    const b = this.teamCount(1);
    if (a >= this.perTeam && b >= this.perTeam) return null;
    if (a >= this.perTeam) return 1;
    if (b >= this.perTeam) return 0;
    return a <= b ? 0 : 1;
  }

  addClient(c: Client): string | null {
    if (this.status !== "lobby") return "La partie est déjà lancée";
    let team = this.freeTeam();
    if (team === null) {
      const bot = [...this.slots].reverse().find((s) => s.bot);
      if (!bot) return "Le salon est plein";
      this.slots = this.slots.filter((s) => s !== bot);
      team = bot.team;
    }
    this.slots.push({ id: c.id, name: c.name, team, bot: false, ready: false, account: c.identity.kind === "account", client: c });
    c.roomId = this.id;
    this.changed();
    return null;
  }

  removeClient(c: Client) {
    const slot = this.slots.find((s) => s.id === c.id);
    c.roomId = null;
    if (!slot) return;
    if (this.status === "playing" && this.sim) {
      slot.client = undefined;
      slot.bot = true;
      slot.name = `${slot.name} (bot)`;
      this.bots.push(new Bot(this.sim, slot.id));
      const p = this.sim.players.get(slot.id);
      if (p) p.bot = true;
    } else {
      this.slots = this.slots.filter((s) => s !== slot);
    }
    if (this.hostId === c.id) {
      const next = this.humans[0];
      if (next) this.hostId = next.id;
    }
    if (!this.humans.length) this.stop();
    this.changed();
  }

  addBot(): string | null {
    if (this.status !== "lobby") return "Partie en cours";
    const team = this.freeTeam();
    if (team === null) return "Le salon est plein";
    const name = BOT_NAMES[this.botCounter++ % BOT_NAMES.length];
    this.slots.push({ id: `bot-${this.id}-${this.botCounter}`, name, team, bot: true, ready: true, account: false });
    this.changed();
    return null;
  }

  removeBot() {
    const bot = [...this.slots].reverse().find((s) => s.bot);
    if (bot) this.slots = this.slots.filter((s) => s !== bot);
    this.changed();
  }

  switchTeam(c: Client): string | null {
    if (this.status !== "lobby") return "Partie en cours";
    const slot = this.slots.find((s) => s.id === c.id);
    if (!slot) return null;
    const other: Team = slot.team === 0 ? 1 : 0;
    if (this.teamCount(other) >= this.perTeam) {
      const swap = this.slots.find((s) => s.team === other && s.bot);
      if (!swap) return "L'autre équipe est pleine";
      swap.team = slot.team;
    }
    slot.team = other;
    this.changed();
    return null;
  }

  setMode(mode: Mode) {
    if (this.status !== "lobby") return;
    this.mode = mode;
    while (this.teamCount(0) > this.perTeam || this.teamCount(1) > this.perTeam) {
      const extra = [...this.slots].reverse().find((s) => this.teamCount(s.team) > this.perTeam);
      if (!extra) break;
      if (!extra.bot && this.freeTeam() !== null) {
        extra.team = extra.team === 0 ? 1 : 0;
        continue;
      }
      if (extra.bot) {
        this.slots = this.slots.filter((s) => s !== extra);
        continue;
      }
      break;
    }
    this.changed();
  }

  setReady(c: Client, ready: boolean) {
    const slot = this.slots.find((s) => s.id === c.id);
    if (!slot || this.status !== "lobby") return;
    slot.ready = ready;
    this.changed();
  }

  refreshClient(c: Client) {
    const slot = this.slots.find((s) => s.id === c.id);
    if (!slot) return;
    slot.name = c.name;
    slot.account = c.identity.kind === "account";
    this.changed();
  }

  start(): string | null {
    if (this.status !== "lobby") return "Partie déjà en cours";
    const waiting = this.humans.filter((s) => s.id !== this.hostId && !s.ready).map((s) => s.name);
    if (waiting.length) return `En attente de : ${waiting.join(", ")}`;
    while (this.freeTeam() !== null) this.addBot();
    const sim = new Sim(this.mode);
    if (process.env.DEV_MATCH_SECONDS) sim.timeLeft = Number(process.env.DEV_MATCH_SECONDS);
    this.sim = sim;
    this.bots = [];
    const trophies = this.topTrophies();
    const arena = arenaFor(trophies).id;
    const style = brainSummary(arena);
    if (style) {
      this.slots.filter((s) => s.bot && s.id.startsWith("bot-")).forEach((s, i) => (s.name = i === 0 ? style.label : `${style.label} ${i + 1}`));
    }
    for (const s of this.slots) {
      sim.addPlayer(s.id, s.name, s.team, s.client ? s.client.deck : s.bot ? botDeck(arena) : DEFAULT_DECK, s.bot);
      if (s.bot) this.bots.push(createBot(sim, s.id, arena, trophies));
    }
    this.status = "playing";
    const players = this.slots.map((s) => ({ id: s.id, name: s.name, tm: s.team, bot: s.bot }));
    for (const s of this.slots) {
      s.client?.send({ type: "start", team: s.team, mode: this.mode, players, you: s.id, arena });
    }
    this.timer = setInterval(() => this.tick(), DT * 1000);
    this.changed();
    return null;
  }

  play(c: Client, card: CardId, x: number, y: number): string | null {
    if (!this.sim) return "Pas de partie";
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "Position invalide";
    return this.sim.play(c.id, card, x, y);
  }

  aim(c: Client, card: CardId | null, x: number, y: number) {
    if (!this.sim || this.mode !== "2v2") return;
    this.sim.setAim(c.id, card, x, y);
  }

  emote(c: Client, emote: string) {
    const slot = this.slots.find((s) => s.id === c.id);
    if (!slot || !this.sim) return;
    if (!emoteById(emote)) return;
    this.broadcast({ type: "emote", from: c.id, name: slot.name, tm: slot.team, emote });
  }

  private tick() {
    const sim = this.sim;
    if (!sim) return;
    sim.step(DT);
    for (const b of this.bots) b.update(DT);
    const base = sim.baseSnapshot();
    sim.clearEvents();
    for (const s of this.slots) {
      if (s.client) s.client.send(sim.snapshotFor(s.id, base));
    }
    if (sim.phase === "ended") {
      const winner = sim.winner ?? -1;
      for (const s of this.slots) {
        if (!s.client) continue;
        const opponentsAllBots = this.slots.filter((o) => o.team !== s.team).every((o) => o.bot);
        const result = winner === -1 ? "draw" : winner === s.team ? "win" : "loss";
        const { delta, profile } = recordResult(s.client.identity, result, opponentsAllBots);
        s.client.send({ type: "end", winner, crowns: sim.crowns, trophies: { delta, total: profile.trophies } });
        s.client.send({ type: "profile", trophies: profile.trophies, best: profile.best, wins: profile.wins, losses: profile.losses });
      }
      this.stop();
      this.slots = this.slots.filter((s) => !s.bot || s.id.startsWith("bot-"));
      for (const s of this.slots) if (!s.bot) s.ready = false;
      this.changed();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status = "lobby";
    this.sim = null;
    this.bots = [];
  }

  private changed() {
    this.broadcast({ type: "room", room: this.info() });
    this.onChange();
  }
}
