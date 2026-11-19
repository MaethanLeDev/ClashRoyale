import { CARDS, type CardId } from "../cards";
import { ARENA_H, ARENA_W, BRIDGES_X, RIVER_Y } from "../constants";
import type { Sim, SimPlayer } from "../sim";

export class Bot {
  private think = 1 + Math.random();
  private saveUntil = 0;

  constructor(private sim: Sim, public playerId: string, private slowness = 0) {}

  private get player(): SimPlayer | undefined {
    return this.sim.players.get(this.playerId);
  }

  private toAbs(team: number, x: number, ly: number): [number, number] {
    return [x, team === 0 ? ly : ARENA_H - ly];
  }

  private local(team: number, y: number): number {
    return team === 0 ? y : ARENA_H - y;
  }

  update(dt: number) {
    const p = this.player;
    if (!p) return;
    if (this.sim.phase !== "playing" && this.sim.phase !== "overtime") return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = (0.5 + Math.random() * 0.9) * (1 + this.slowness * 1.5);

    const team = p.team;
    const threats = this.sim.units.filter((u) => u.team !== team && this.local(team, u.y) < RIVER_Y + 1.5);
    const threatHp = threats.reduce((s, u) => s + u.hp, 0);
    const affordable = p.hand.filter((c) => CARDS[c].cost <= p.elixir);
    if (!affordable.length) return;

    if (threats.length) {
      this.defend(p, threats, affordable, threatHp);
      return;
    }

    if (p.hand.includes("samy") && p.elixir < 10 && this.sim.time > this.saveUntil && Math.random() < 0.5) {
      this.saveUntil = this.sim.time + 12;
    }
    if (this.sim.time < this.saveUntil) {
      if (p.elixir >= 10 && p.hand.includes("samy")) {
        const lane = BRIDGES_X[Math.random() < 0.5 ? 0 : 1];
        this.tryPlay(p, "samy", lane, 11);
        this.saveUntil = 0;
      }
      return;
    }

    const threshold = this.sim.doubleElixir ? 6 : 8;
    if (p.elixir < threshold) return;
    const attackCards = affordable.filter((c) => c !== "samy" && c !== "niels" && c !== "imad");
    if (!attackCards.length) return;
    const card = attackCards[Math.floor(Math.random() * attackCards.length)];
    const enemy = team === 0 ? 1 : 0;
    const laneIdx = this.weakLane(enemy);
    const lane = BRIDGES_X[laneIdx];
    if (card === "midas" || card === "nazar") {
      const target =
        this.sim.towers.find((t) => t.team === enemy && t.alive && t.kind === "princess" && t.x === lane) ??
        this.sim.towers.find((t) => t.team === enemy && t.alive);
      if (target) {
        const ly = this.local(team, target.y) - 2.2;
        const [x, y] = this.toAbs(team, target.x + (lane < 9 ? 1.5 : -1.5), ly);
        this.sim.play(p.id, card, x, y);
      }
      return;
    }
    const ly = card === "natis" || card === "tordeux" ? 9 : card === "tarit" ? 11 : 13.2;
    this.tryPlay(p, card, lane + (Math.random() - 0.5), ly);
  }

  private weakLane(enemy: number): number {
    const left = this.sim.towers.find((t) => t.team === enemy && t.kind === "princess" && t.x === BRIDGES_X[0]);
    const right = this.sim.towers.find((t) => t.team === enemy && t.kind === "princess" && t.x === BRIDGES_X[1]);
    const lh = left && left.alive ? left.hp : 0;
    const rh = right && right.alive ? right.hp : 0;
    if (Math.abs(lh - rh) < 200) return Math.random() < 0.5 ? 0 : 1;
    return lh < rh ? 0 : 1;
  }

  private defend(p: SimPlayer, threats: Sim["units"], affordable: CardId[], threatHp: number) {
    const team = p.team;
    const lead = threats.reduce((a, b) => (this.local(team, a.y) < this.local(team, b.y) ? a : b));
    const leadLy = this.local(team, lead.y);
    const cx = threats.reduce((s, u) => s + u.x, 0) / threats.length;
    const cy = threats.reduce((s, u) => s + u.y, 0) / threats.length;
    const big = threats.some((u) => u.maxHp >= 3000);
    const swarm = threats.length >= 4;

    const pref: CardId[] = big
      ? ["valere", "goutier", "imad", "nazar", "niels", "tordeux", "midas"]
      : swarm
        ? ["niels", "tordeux", "imad", "valere", "midas", "goutier"]
        : ["tordeux", "valere", "nazar", "goutier", "midas", "imad", "niels", "natis"];
    if (threatHp < 400 && p.elixir < 7) return;
    const card = pref.find((c) => affordable.includes(c));
    if (!card) return;

    if (card === "niels") {
      if (threats.length < 3 && !big) return;
      this.sim.play(p.id, card, Math.round(cx * 2) / 2, Math.round(cy * 2) / 2);
      return;
    }
    if (card === "imad") {
      this.tryPlay(p, card, 9 + (lead.x < 9 ? -1 : 1), 8.5);
      return;
    }
    const ly = Math.min(14, Math.max(2, leadLy - (card === "tordeux" ? 4 : 1.5)));
    this.tryPlay(p, card, Math.min(ARENA_W - 1, Math.max(1, lead.x)), ly);
  }

  private tryPlay(p: SimPlayer, card: CardId, x: number, ly: number) {
    const [ax, ay] = this.toAbs(p.team, Math.round(x * 2) / 2, Math.round(ly * 2) / 2);
    const err = this.sim.play(p.id, card, ax, ay);
    if (err) {
      for (const dx of [1, -1, 2, -2]) {
        if (!this.sim.play(p.id, card, ax + dx, ay)) return;
      }
    }
  }
}
