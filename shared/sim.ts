import { CARDS, type CardDef, type CardId, type UnitStats } from "./cards";
import {
  ARENA_H, ARENA_W, BRIDGES_X, BRIDGE_HALF, COUNTDOWN, DEPLOY_TIME, DOUBLE_TIME_AT, ELIXIR_PER_SEC,
  HAND_SIZE, MATCH_TIME, MAX_ELIXIR, OVERTIME, RIVER_HALF, RIVER_Y, START_ELIXIR, TOWER_LAYOUT,
  type TowerDef, type TowerKind,
} from "./constants";
import type { GameEvent, Phase, ProjSnap, StateMsg, Team, TowerSnap, UnitSnap } from "./protocol";
import { UNIT_STATE } from "./protocol";
import { canDeployAt } from "./rules";

export interface SimPlayer {
  id: string;
  name: string;
  team: Team;
  bot: boolean;
  elixir: number;
  hand: CardId[];
  queue: CardId[];
}

interface Body {
  id: number;
  team: Team;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  frozen: number;
}

export interface Unit extends Body {
  card: CardId;
  stats: UnitStats;
  building: boolean;
  mass: number;
  deployLeft: number;
  cooldown: number;
  targetId: number | null;
  locked: boolean;
  facing: number;
  state: number;
  life: number;
  px: number;
  py: number;
  stuck: number;
  sidestep: number;
  side: number;
}

export interface Tower extends Body {
  kind: TowerKind;
  def: TowerDef;
  active: boolean;
  cooldown: number;
  targetId: number | null;
  alive: boolean;
}

interface Projectile {
  id: number;
  kind: string;
  team: Team;
  x: number;
  y: number;
  h: number;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  h0: number;
  h1: number;
  arc: number;
  speed: number;
  damage: number;
  targetId: number | null;
  towerKiller: boolean;
  payload?: { card: CardId; owner: string };
}

interface PendingSpell {
  card: CardDef;
  team: Team;
  x: number;
  y: number;
  timer: number;
}

const RIVER_LO = RIVER_Y - RIVER_HALF;
const RIVER_HI = RIVER_Y + RIVER_HALF;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export class Sim {
  phase: Phase = "countdown";
  time = 0;
  countdown = COUNTDOWN;
  timeLeft = MATCH_TIME;
  overtime = false;
  crowns: [number, number] = [0, 0];
  winner: Team | -1 | null = null;
  tiebreakT = 0;

  players = new Map<string, SimPlayer>();
  units: Unit[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  spells: PendingSpell[] = [];
  events: GameEvent[] = [];
  private nextId = 1;

  constructor() {
    for (const team of [0, 1] as Team[]) {
      for (const def of TOWER_LAYOUT) {
        const y = team === 0 ? def.y : ARENA_H - def.y;
        this.towers.push({
          id: this.nextId++, team, x: def.x, y, radius: def.radius, hp: def.hp, maxHp: def.hp,
          kind: def.kind, def, active: def.kind === "princess", cooldown: 0, targetId: null, alive: true, frozen: 0,
        });
      }
    }
  }

  addPlayer(id: string, name: string, team: Team, deck: CardId[], bot = false): SimPlayer {
    const order = shuffle(deck);
    const p: SimPlayer = {
      id, name, team, bot, elixir: START_ELIXIR,
      hand: order.slice(0, HAND_SIZE), queue: order.slice(HAND_SIZE),
    };
    this.players.set(id, p);
    return p;
  }

  get doubleElixir(): boolean {
    return this.overtime || (this.phase === "playing" && this.timeLeft <= DOUBLE_TIME_AT);
  }

  emit(ev: GameEvent) {
    this.events.push(ev);
  }

  towerFor(team: Team, kind: TowerKind, x?: number): Tower | undefined {
    return this.towers.find((t) => t.team === team && t.kind === kind && (x === undefined || t.x === x));
  }

  canDeploy(team: Team, card: CardDef, x: number, y: number): boolean {
    const buildings = this.units.filter((u) => u.building && u.hp > 0);
    return canDeployAt(team, card, x, y, this.towers, buildings);
  }

  play(playerId: string, cardId: CardId, x: number, y: number): string | null {
    const p = this.players.get(playerId);
    if (!p) return "Joueur inconnu";
    if (this.phase !== "playing" && this.phase !== "overtime") return "La partie n'a pas commencé";
    const idx = p.hand.indexOf(cardId);
    if (idx < 0) return "Carte absente de la main";
    const card = CARDS[cardId];
    if (p.elixir < card.cost) return "Pas assez de caféine";
    if (!this.canDeploy(p.team, card, x, y)) return "Placement interdit";

    p.elixir -= card.cost;
    const nextCard = p.queue.shift();
    p.queue.push(cardId);
    if (nextCard) p.hand[idx] = nextCard;
    this.deploy(p, card, x, y);
    return null;
  }

  private deploy(p: SimPlayer, card: CardDef, x: number, y: number) {
    this.emit({ e: "deploy", c: card.id, x, y, tm: p.team, by: p.id });
    if (card.kind === "spell" && card.spell) {
      this.spells.push({ card, team: p.team, x, y, timer: card.spell.delay });
      this.emit({ e: "spellCast", c: card.id, x, y, r: card.spell.radius, tm: p.team, delay: card.spell.delay });
      return;
    }
    if (card.delivery) {
      const king = this.towerFor(p.team, "king")!;
      const dig = card.delivery === "dig";
      const dist = Math.hypot(x - king.x, y - king.y);
      const sy = dig ? king.y + (p.team === 0 ? king.radius : -king.radius) : king.y;
      this.projectiles.push({
        id: this.nextId++, kind: dig ? "dig" : "barrel", team: p.team, x: king.x, y: sy, h: dig ? 0 : 3,
        x0: king.x, y0: sy, tx: x, ty: y, h0: dig ? 0 : 3, h1: dig ? 0 : 0.3,
        arc: dig ? 0 : Math.min(8, 2 + dist * 0.35),
        speed: dig ? 6.5 : 11, damage: 0, targetId: null, towerKiller: false, payload: { card: card.id, owner: p.id },
      });
      return;
    }
    this.spawnUnits(card, p.team, x, y, DEPLOY_TIME);
  }

  private spawnUnits(card: CardDef, team: Team, x: number, y: number, deployTime: number) {
    const n = card.count;
    for (let i = 0; i < n; i++) {
      let ux = x;
      let uy = y;
      if (n > 1) {
        const a = (i / n) * Math.PI * 2 + (team === 1 ? Math.PI : 0);
        const ring = n > 6 && i % 2 === 1 ? card.spawnRadius * 0.55 : card.spawnRadius;
        ux = x + Math.cos(a) * ring;
        uy = y + Math.sin(a) * ring;
      }
      this.spawnUnit(card, team, ux, uy, deployTime);
    }
  }

  spawnUnit(card: CardDef, team: Team, x: number, y: number, deployTime: number): Unit {
    const s = card.unit!;
    const u: Unit = {
      id: this.nextId++, team, x, y, px: x, py: y, radius: s.radius, hp: s.hp, maxHp: s.hp, frozen: 0,
      card: card.id, stats: s, building: card.kind === "building", mass: s.mass, deployLeft: deployTime,
      cooldown: s.firstHit, targetId: null, locked: false, facing: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      state: UNIT_STATE.deploying, life: s.lifetime ?? 0, stuck: 0, sidestep: 0, side: this.nextId % 2 ? 1 : -1,
    };
    this.clampPosition(u);
    this.units.push(u);
    return u;
  }

  private bodyById(id: number | null): Unit | Tower | undefined {
    if (id === null) return undefined;
    const u = this.units.find((v) => v.id === id && v.hp > 0);
    if (u) return u;
    return this.towers.find((t) => t.id === id && t.alive);
  }

  private isBuilding(b: Unit | Tower): boolean {
    return "kind" in b || (b as Unit).building;
  }

  private damage(target: Unit | Tower, amount: number, kind: string) {
    if (amount <= 0) return;
    target.hp -= amount;
    this.emit({ e: "hit", id: target.id, x: r2(target.x), y: r2(target.y), dmg: Math.round(amount), k: kind });
    if ("kind" in target && target.kind === "king") target.active = true;
  }

  clearEvents() {
    this.events.length = 0;
  }

  step(dt: number) {
    if (this.phase === "ended") return;
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = "playing";
      return;
    }
    if (this.phase === "tiebreak") {
      this.stepTiebreak(dt);
      return;
    }
    this.time += dt;
    this.timeLeft -= dt;

    const rate = ELIXIR_PER_SEC * (this.doubleElixir ? 2 : 1);
    for (const p of this.players.values()) p.elixir = Math.min(MAX_ELIXIR, p.elixir + rate * dt);

    this.updateSpells(dt);
    this.updateUnits(dt);
    this.separate();
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.cleanup();
    this.checkTime();
  }

  private updateSpells(dt: number) {
    for (const s of this.spells) {
      s.timer -= dt;
      if (s.timer > 0) continue;
      const st = s.card.spell!;
      for (const u of this.units) {
        if (u.team === s.team || u.hp <= 0) continue;
        if (Math.hypot(u.x - s.x, u.y - s.y) - u.radius <= st.radius) {
          this.damage(u, st.damage, "spell");
          u.frozen = Math.max(u.frozen, st.freeze);
        }
      }
      for (const t of this.towers) {
        if (t.team === s.team || !t.alive) continue;
        if (Math.hypot(t.x - s.x, t.y - s.y) - t.radius <= st.radius) {
          this.damage(t, st.towerDamage, "spell");
          t.frozen = Math.max(t.frozen, st.freeze);
        }
      }
      this.emit({ e: "spell", c: s.card.id, x: s.x, y: s.y, r: st.radius, tm: s.team });
    }
    this.spells = this.spells.filter((s) => s.timer > 0);
  }

  private findTarget(u: Unit): Unit | Tower | undefined {
    const s = u.stats;
    if (u.locked) {
      const cur = this.bodyById(u.targetId);
      if (cur && this.edgeDist(u, cur) <= s.range + 0.4) return cur;
      u.locked = false;
    }
    let best: Unit | Tower | undefined;
    let bestD = Infinity;
    for (const v of this.units) {
      if (v.team === u.team || v.hp <= 0) continue;
      if (s.targetsBuildingsOnly && !v.building) continue;
      if (this.edgeDist(u, v) > s.sight) continue;
      const d = Math.hypot(v.x - u.x, v.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      if (this.edgeDist(u, t) > s.sight) continue;
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best || u.building) return best;
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      const d = this.pathDist(u, t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private pathDist(u: Unit, t: Tower): number {
    if (u.stats.jumpsRiver) return Math.hypot(t.x - u.x, t.y - u.y);
    const sameSide = (u.y < RIVER_Y) === (t.y < RIVER_Y);
    if (sameSide) return Math.hypot(t.x - u.x, t.y - u.y);
    let best = Infinity;
    for (const bx of BRIDGES_X) {
      const d = Math.hypot(bx - u.x, RIVER_Y - u.y) + Math.hypot(t.x - bx, t.y - RIVER_Y);
      best = Math.min(best, d);
    }
    return best;
  }

  private edgeDist(a: Body, b: Body): number {
    return Math.hypot(b.x - a.x, b.y - a.y) - a.radius - b.radius;
  }

  private waypoint(u: Unit, tx: number, ty: number): [number, number] {
    if (u.stats.jumpsRiver) return [tx, ty];
    const inBand = u.y > RIVER_LO - 0.05 && u.y < RIVER_HI + 0.05;
    const side = u.y < RIVER_Y ? 0 : 1;
    const tside = ty < RIVER_Y ? 0 : 1;
    if (!inBand && side === tside) return [tx, ty];
    const exitY = tside === 1 ? RIVER_HI + 0.6 : RIVER_LO - 0.6;
    if (inBand) {
      const bx = BRIDGES_X.reduce((a, b) => (Math.abs(b - u.x) < Math.abs(a - u.x) ? b : a));
      return [bx, exitY];
    }
    let bx = BRIDGES_X[0];
    let bestCost = Infinity;
    for (const b of BRIDGES_X) {
      const cost = Math.abs(u.x - b) + Math.abs(tx - b);
      if (cost < bestCost) {
        bestCost = cost;
        bx = b;
      }
    }
    if (Math.abs(u.x - bx) < 0.45) return [bx, exitY];
    const entryY = side === 0 ? RIVER_LO - 0.6 : RIVER_HI + 0.6;
    return [bx, entryY];
  }

  private updateUnits(dt: number) {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      u.px = u.x;
      u.py = u.y;
      if (u.building) {
        u.hp -= (u.maxHp / (u.stats.lifetime ?? 30)) * dt;
      }
      if (u.deployLeft > 0) {
        u.deployLeft -= dt;
        u.state = UNIT_STATE.deploying;
        continue;
      }
      if (u.frozen > 0) {
        u.frozen -= dt;
        u.state = UNIT_STATE.frozen;
        continue;
      }
      const s = u.stats;
      const target = this.findTarget(u);
      if (!target) {
        u.state = UNIT_STATE.idle;
        u.cooldown = Math.max(u.cooldown, s.firstHit);
        continue;
      }
      u.targetId = target.id;
      const ed = this.edgeDist(u, target);
      if (ed <= s.range) {
        if (!u.locked) {
          u.locked = true;
          u.cooldown = Math.min(u.cooldown, s.firstHit);
        }
        u.state = UNIT_STATE.attacking;
        u.facing = Math.atan2(target.y - u.y, target.x - u.x);
        u.cooldown -= dt;
        if (u.cooldown <= 0) {
          u.cooldown += s.hitSpeed;
          this.attack(u, target);
        }
        continue;
      }
      u.locked = false;
      u.cooldown = Math.max(u.cooldown, s.firstHit);
      if (s.speed <= 0) {
        u.state = UNIT_STATE.idle;
        continue;
      }
      const [wx, wy] = this.waypoint(u, target.x, target.y);
      const dx = wx - u.x;
      const dy = wy - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        let [mx, my] = this.avoid(u, dx / d, dy / d, target);
        if (u.sidestep > 0) {
          u.sidestep -= dt;
          const a = 1.1 * u.side;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          [mx, my] = [mx * c - my * sn, mx * sn + my * c];
        }
        const stepLen = Math.min(d, s.speed * dt);
        u.x += mx * stepLen;
        u.y += my * stepLen;
        u.facing = Math.atan2(my, mx);
      }
      u.state = UNIT_STATE.moving;
    }
  }

  private avoid(u: Unit, dx: number, dy: number, target: Unit | Tower): [number, number] {
    let sx = 0;
    let sy = 0;
    const consider = (o: Body) => {
      if (o.id === target.id || o.id === u.id) return;
      const ox = o.x - u.x;
      const oy = o.y - u.y;
      const R = o.radius + u.radius + 0.2;
      const look = R + 2.2;
      const t = ox * dx + oy * dy;
      if (t <= 0 || t > look) return;
      const c = dx * oy - dy * ox;
      if (Math.abs(c) >= R) return;
      const w = (1 - Math.abs(c) / R) * (1 - t / look) * 2.2;
      if (c >= 0) {
        sx += dy * w;
        sy += -dx * w;
      } else {
        sx += -dy * w;
        sy += dx * w;
      }
    };
    for (const t of this.towers) if (t.alive) consider(t);
    for (const b of this.units) if (b.building && b.hp > 0) consider(b);
    if (sx === 0 && sy === 0) return [dx, dy];
    const nx = dx + sx;
    const ny = dy + sy;
    const n = Math.hypot(nx, ny) || 1;
    return [nx / n, ny / n];
  }

  private attack(u: Unit, target: Unit | Tower) {
    const s = u.stats;
    this.emit({ e: "attack", id: u.id, tid: target.id });
    if (s.towerKiller && this.isBuilding(target)) {
      this.emit({ e: "smash", id: u.id, tid: target.id, x: r2(target.x), y: r2(target.y) });
      this.damage(target, target.hp + 1, "smash");
      return;
    }
    if (s.projectile) {
      this.projectiles.push({
        id: this.nextId++, kind: s.projectile.kind, team: u.team, x: u.x, y: u.y, h: s.height * 0.7,
        x0: u.x, y0: u.y, tx: target.x, ty: target.y, h0: s.height * 0.7, h1: 0.8, arc: 0,
        speed: s.projectile.speed, damage: s.damage, targetId: target.id, towerKiller: false,
      });
      return;
    }
    const mult = "kind" in target && s.towerDamageMult ? s.towerDamageMult : 1;
    this.damage(target, s.damage * mult, "melee");
  }

  private separate() {
    const list = this.units.filter((u) => u.hp > 0);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        let nx: number;
        let ny: number;
        if (d < 1e-4) {
          const ang = (a.id * 7.31 + b.id * 3.17) % (Math.PI * 2);
          nx = Math.cos(ang);
          ny = Math.sin(ang);
          d = 0;
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const overlap = (min - d) * 0.5;
        if (
          a.team !== b.team && !a.building && !b.building &&
          a.targetId !== b.id && b.targetId !== a.id &&
          a.state === UNIT_STATE.moving && b.state === UNIT_STATE.moving
        ) {
          const nearRiver = Math.abs(a.y - RIVER_Y) < 2.6 + a.radius || Math.abs(b.y - RIVER_Y) < 2.6 + b.radius;
          const side = a.x <= b.x ? -1 : 1;
          const lat = nearRiver ? 0 : Math.min(overlap, 0.04);
          a.x += side * lat;
          b.x -= side * lat;
          continue;
        }
        const ma = a.building ? Infinity : a.mass;
        const mb = b.building ? Infinity : b.mass;
        let wa: number;
        let wb: number;
        if (ma === Infinity && mb === Infinity) continue;
        if (ma === Infinity) {
          wa = 0;
          wb = 2;
        } else if (mb === Infinity) {
          wa = 2;
          wb = 0;
        } else {
          wa = (2 * mb) / (ma + mb);
          wb = (2 * ma) / (ma + mb);
        }
        a.x -= nx * overlap * wa;
        a.y -= ny * overlap * wa;
        b.x += nx * overlap * wb;
        b.y += ny * overlap * wb;
      }
    }
    for (const u of list) {
      if (u.building) continue;
      for (const t of this.towers) {
        if (!t.alive) continue;
        const dx = u.x - t.x;
        const dy = u.y - t.y;
        const min = u.radius + t.radius;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 1e-4) {
          u.x = t.x + (dx / d) * min;
          u.y = t.y + (dy / d) * min;
        }
      }
      this.clampPosition(u);
      if (u.state === UNIT_STATE.moving) {
        const moved = Math.hypot(u.x - u.px, u.y - u.py);
        const expected = u.stats.speed * (1 / 20);
        if (moved < expected * 0.3) u.stuck += 1 / 20;
        else u.stuck = Math.max(0, u.stuck - 2 / 20);
        if (u.stuck > 0.45 && u.sidestep <= 0) {
          u.sidestep = 0.7;
          u.stuck = 0;
          u.side = -u.side;
        }
      } else {
        u.stuck = 0;
      }
    }
  }

  private clampPosition(u: Unit) {
    u.x = Math.max(u.radius * 0.5, Math.min(ARENA_W - u.radius * 0.5, u.x));
    u.y = Math.max(u.radius * 0.5, Math.min(ARENA_H - u.radius * 0.5, u.y));
    if (u.stats.jumpsRiver && u.deployLeft <= 0) return;
    if (u.y > RIVER_LO && u.y < RIVER_HI) {
      const bx = BRIDGES_X.reduce((a, b) => (Math.abs(b - u.x) < Math.abs(a - u.x) ? b : a));
      const half = Math.max(0.15, BRIDGE_HALF - u.radius * 0.3);
      if (Math.abs(u.x - bx) > half) {
        const wasInBand = u.py > RIVER_LO && u.py < RIVER_HI;
        if (wasInBand || u.stats.radius > BRIDGE_HALF) {
          u.x = bx + Math.sign(u.x - bx) * half;
        } else {
          u.y = u.py < RIVER_Y ? RIVER_LO : RIVER_HI;
        }
      }
    }
  }

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      if (!t.alive || !t.active) continue;
      if (t.frozen > 0) {
        t.frozen -= dt;
        continue;
      }
      let target = this.bodyById(t.targetId) as Unit | undefined;
      if (target && (!("card" in target) || Math.hypot(target.x - t.x, target.y - t.y) - target.radius > t.def.range)) {
        target = undefined;
      }
      if (!target) {
        let bestD = Infinity;
        for (const u of this.units) {
          if (u.team === t.team || u.hp <= 0) continue;
          const d = Math.hypot(u.x - t.x, u.y - t.y) - u.radius;
          if (d <= t.def.range && d < bestD) {
            bestD = d;
            target = u;
          }
        }
        if (target && t.targetId !== target.id) t.cooldown = Math.min(t.cooldown, 0.3);
      }
      t.targetId = target ? target.id : null;
      if (!target) {
        t.cooldown = Math.max(0, t.cooldown - dt);
        continue;
      }
      t.cooldown -= dt;
      if (t.cooldown <= 0) {
        t.cooldown += t.def.hitSpeed;
        const h0 = t.kind === "king" ? 5 : 4.2;
        this.projectiles.push({
          id: this.nextId++, kind: t.kind === "king" ? "cannon" : "arrow", team: t.team,
          x: t.x, y: t.y, h: h0, x0: t.x, y0: t.y, tx: target.x, ty: target.y, h0, h1: 0.8, arc: 0,
          speed: t.kind === "king" ? 13 : 18, damage: t.def.damage, targetId: target.id, towerKiller: false,
        });
        this.emit({ e: "attack", id: t.id, tid: target.id });
      }
    }
  }

  private updateProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const target = this.bodyById(p.targetId);
      if (target) {
        p.tx = target.x;
        p.ty = target.y;
      } else if (p.targetId !== null) {
        p.targetId = -1;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      const total = Math.max(0.01, Math.hypot(p.tx - p.x0, p.ty - p.y0));
      if (d <= stepLen) {
        p.x = p.tx;
        p.y = p.ty;
        if (p.payload) {
          const card = CARDS[p.payload.card];
          this.emit({ e: "spell", c: card.id, x: r2(p.x), y: r2(p.y), r: 1, tm: p.team });
          this.spawnUnits(card, p.team, p.x, p.y, card.delivery === "dig" ? 0.6 : 0.4);
        } else if (target) {
          this.damage(target, p.damage, p.kind);
        }
        continue;
      }
      p.x += (dx / d) * stepLen;
      p.y += (dy / d) * stepLen;
      const prog = Math.min(1, 1 - (d - stepLen) / total);
      p.h = p.h0 + (p.h1 - p.h0) * prog + p.arc * Math.sin(Math.PI * prog);
      keep.push(p);
    }
    this.projectiles = keep;
  }

  private cleanup() {
    for (const t of this.towers) {
      if (!t.alive || t.hp > 0) continue;
      t.alive = false;
      t.hp = 0;
      const enemy: Team = t.team === 0 ? 1 : 0;
      this.emit({ e: "tower", id: t.id, tm: t.team, x: t.x, y: t.y, k: t.kind });
      if (t.kind === "king") {
        this.crowns[enemy] = 3;
        for (const o of this.towers) if (o.team === t.team) o.alive = false;
        this.finish(enemy);
        return;
      }
      this.crowns[enemy] += 1;
      const king = this.towerFor(t.team, "king");
      if (king) king.active = true;
      if (this.overtime) {
        this.finish(enemy);
        return;
      }
    }
    const alive: Unit[] = [];
    const dead: Unit[] = [];
    for (const u of this.units) {
      if (u.hp > 0) alive.push(u);
      else {
        dead.push(u);
        this.emit({ e: "die", id: u.id, x: r2(u.x), y: r2(u.y), c: u.card, tm: u.team });
      }
    }
    this.units = alive;
    for (const u of dead) {
      const dd = u.stats.deathDamage;
      if (dd) {
        this.emit({ e: "explode", x: r2(u.x), y: r2(u.y), r: dd.radius, tm: u.team });
        for (const v of this.units) {
          if (v.team !== u.team && v.hp > 0 && Math.hypot(v.x - u.x, v.y - u.y) - v.radius <= dd.radius) {
            this.damage(v, dd.damage, "explode");
          }
        }
        for (const t of this.towers) {
          if (t.team !== u.team && t.alive && Math.hypot(t.x - u.x, t.y - u.y) - t.radius <= dd.radius) {
            this.damage(t, dd.damage, "explode");
          }
        }
      }
      if (u.stats.deathSpawn) {
        const x = u.x;
        let y = u.y;
        if (y > RIVER_LO - 0.3 && y < RIVER_HI + 0.3) y = u.team === 0 ? RIVER_HI + 0.4 : RIVER_LO - 0.4;
        this.spawnUnit(CARDS[u.stats.deathSpawn], u.team, x, y, 0.4);
      }
    }
  }

  private checkTime() {
    if (this.phase === "ended" || this.timeLeft > 0) return;
    if (this.crowns[0] !== this.crowns[1]) {
      this.finish(this.crowns[0] > this.crowns[1] ? 0 : 1);
      return;
    }
    if (!this.overtime) {
      this.overtime = true;
      this.phase = "overtime";
      this.timeLeft = OVERTIME;
      return;
    }
    this.phase = "tiebreak";
    this.timeLeft = 0;
    this.tiebreakT = 0;
    this.projectiles = [];
    this.spells = [];
    this.emit({ e: "tiebreak" });
  }

  private stepTiebreak(dt: number) {
    this.tiebreakT += dt;
    if (this.tiebreakT < 1.2) return;
    const t = this.tiebreakT - 1.2;
    const drain = (250 + 700 * t + 250 * t * t) * dt;
    for (const tw of this.towers) if (tw.alive) tw.hp -= drain;
    const fallen = this.towers.filter((tw) => tw.alive && tw.hp <= 0);
    if (!fallen.length) return;
    const worst = (team: Team) => Math.min(0, ...fallen.filter((tw) => tw.team === team).map((tw) => tw.hp));
    const w0 = worst(0);
    const w1 = worst(1);
    let loser: Team | -1;
    if (w0 < 0 && w1 < 0) loser = Math.abs(w0 - w1) < 1e-6 ? -1 : w0 < w1 ? 0 : 1;
    else loser = w0 < 0 ? 0 : 1;
    for (const tw of fallen) {
      if (loser !== -1 && tw.team !== loser) {
        tw.hp = 1;
        continue;
      }
      tw.alive = false;
      tw.hp = 0;
      this.emit({ e: "tower", id: tw.id, tm: tw.team, x: tw.x, y: tw.y, k: tw.kind });
    }
    if (loser === -1) {
      this.finish(-1);
      return;
    }
    const winner: Team = loser === 0 ? 1 : 0;
    this.crowns[winner] += 1;
    this.finish(winner);
  }

  private finish(winner: Team | -1) {
    this.phase = "ended";
    this.winner = winner;
    this.timeLeft = Math.max(0, this.timeLeft);
  }

  snapshotFor(playerId: string | null, base?: Omit<StateMsg, "hand" | "next" | "el">): StateMsg {
    const b = base ?? this.baseSnapshot();
    const p = playerId ? this.players.get(playerId) : undefined;
    return {
      ...b,
      hand: p ? p.hand.slice() : [],
      next: p ? p.queue[0] ?? null : null,
      el: p ? Math.round(p.elixir * 100) / 100 : 0,
    };
  }

  baseSnapshot(): Omit<StateMsg, "hand" | "next" | "el"> {
    const units: UnitSnap[] = this.units.map((u) => ({
      id: u.id, c: u.card, tm: u.team, x: r2(u.x), y: r2(u.y), hp: Math.max(0, Math.round(u.hp)),
      mhp: u.maxHp, st: u.state, f: r2(u.facing),
    }));
    const towers: TowerSnap[] = this.towers.map((t) => ({
      id: t.id, tm: t.team, k: t.kind, x: t.x, y: t.y, hp: Math.max(0, Math.round(t.hp)), mhp: t.maxHp,
      a: t.active && t.alive, fz: t.frozen > 0,
    }));
    const proj: ProjSnap[] = this.projectiles.map((p) => ({
      id: p.id, k: p.kind, tm: p.team, x: r2(p.x), y: r2(p.y), h: r2(p.h),
    }));
    return {
      type: "state", t: r2(this.time),
      phase: this.phase,
      left: this.phase === "countdown" ? Math.ceil(this.countdown) : Math.max(0, Math.ceil(this.timeLeft)),
      dbl: this.doubleElixir && this.phase !== "tiebreak", crowns: [this.crowns[0], this.crowns[1]],
      units, towers, proj, ev: this.events.slice(), winner: this.winner,
    };
  }
}
