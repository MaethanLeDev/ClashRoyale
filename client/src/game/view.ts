import * as THREE from "three";
import { CARDS, type CardDef, type CardId } from "../../../shared/cards";
import { ARENA_H, ARENA_W, RIVER_HALF, RIVER_Y } from "../../../shared/constants";
import type { GameEvent, StateMsg, Team } from "../../../shared/protocol";
import { UNIT_STATE } from "../../../shared/protocol";
import { canDeployAt, POCKET_DEPTH, pocketOpen, snapTile } from "../../../shared/rules";
import { buildArena, toArena, toWorld, type Arena } from "./arena";
import { Fx } from "./fx";
import {
  Bar, createProjectileModel, createTowerModel, createUnitModel, type TowerModel, type UnitModel,
} from "./models";
import { ALLY, ENEMY, headTexture } from "./textures";

interface UnitView {
  id: number;
  card: CardDef;
  team: Team;
  model: UnitModel;
  bar: Bar;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  yaw: number;
  hp: number;
  mhp: number;
  st: number;
  walk: number;
  attackT: number;
  flashT: number;
  spawnT: number;
  stepT: number;
}

interface TowerView {
  id: number;
  team: Team;
  kind: "king" | "princess";
  model: TowerModel;
  bar: Bar;
  pos: THREE.Vector3;
  hp: number;
  mhp: number;
  active: boolean;
  aimYaw: number;
  flashT: number;
  smokeT: number;
  recoil: number;
}

interface ProjView {
  id: number;
  kind: string;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  trailT: number;
}

interface Floater {
  el: HTMLElement;
  world: THREE.Vector3;
  life: number;
}

export interface ViewOptions {
  container: HTMLElement;
  overlay: HTMLElement;
  team: Team;
  getInsets(): { top: number; bottom: number };
  onPlay(card: CardId, x: number, y: number): void;
  onSelect(card: CardId | null, dragging: boolean): void;
  onToast(msg: string): void;
}

const tmpV = new THREE.Vector3();
const UP_SAMY = 0.08;

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
  private arena: Arena;
  private fx: Fx;
  private units = new Map<number, UnitView>();
  private towers = new Map<number, TowerView>();
  private projs = new Map<number, ProjView>();
  private floaters: Floater[] = [];
  private state: StateMsg | null = null;
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private shake = 0;
  private camBase = new THREE.Vector3();
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private selected: CardId | null = null;
  private dragging = false;
  private tapActive = false;
  private dragStart = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0, inside: false };
  private ghost: THREE.Group;
  private ghostRing: THREE.Mesh;
  private ghostFill: THREE.Mesh;
  private ghostHead: THREE.Sprite;
  private zones = new THREE.Group();
  private resizeObs: ResizeObserver;

  constructor(private opts: ViewOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    opts.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9fd4f5);
    this.scene.fog = new THREE.Fog(0x9fd4f5, 60, 140);

    const hemi = new THREE.HemisphereLight(0xdff1ff, 0x4d6b35, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.1);
    sun.position.set(-14, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    this.arena = buildArena();
    this.scene.add(this.arena.group);
    this.fx = new Fx(this.scene);

    this.ghost = new THREE.Group();
    this.ghostFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.ghostFill.rotation.x = -Math.PI / 2;
    this.ghostFill.position.y = 0.05;
    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.position.y = 0.06;
    this.ghostHead = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.85, depthTest: false }));
    this.ghostHead.renderOrder = 25;
    this.ghost.add(this.ghostFill, this.ghostRing, this.ghostHead);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.scene.add(this.zones);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onCanvasDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("pointerleave", () => (this.pointer.inside = false));
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(opts.container);
    this.resize();
    this.loop();
  }

  get myTeam(): Team {
    return this.opts.team;
  }

  private colorFor(team: Team): number {
    return team === this.opts.team ? ALLY : ENEMY;
  }

  resize() {
    const w = this.opts.container.clientWidth || window.innerWidth;
    const h = this.opts.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera(w, h);
  }

  private fitCamera(w: number, h: number) {
    const cam = this.camera;
    const insets = this.opts.getInsets();
    const topLim = 1 - (2 * insets.top) / h;
    const botLim = -1 + (2 * insets.bottom) / h;
    const portrait = h > w;
    const pitch = THREE.MathUtils.degToRad(portrait ? 62 : 54);
    const sign = this.opts.team === 0 ? 1 : -1;
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch) * sign);
    const target = new THREE.Vector3(0, 0, 0);
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(sx * 9.4, 0, sz * 16.4));
        pts.push(new THREE.Vector3(sx * 3, 5.6, sz * 13));
      }
    }
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const measure = (dist: number) => {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        tmpV.copy(p).project(cam);
        minX = Math.min(minX, tmpV.x);
        maxX = Math.max(maxX, tmpV.x);
        minY = Math.min(minY, tmpV.y);
        maxY = Math.max(maxY, tmpV.y);
      }
      return { minX, maxX, minY, maxY };
    };
    let lo = 8;
    let hi = 300;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      const m = measure(mid);
      const fits = m.maxX - m.minX <= 1.96 && m.maxY - m.minY <= topLim - botLim - 0.02;
      if (fits) hi = mid;
      else lo = mid;
    }
    const m = measure(hi);
    this.camBase.copy(cam.position);
    const desired = (topLim + botLim) / 2;
    const actual = (m.maxY + m.minY) / 2;
    const offY = ((desired - actual) * h) / 2;
    cam.setViewOffset(w, h, 0, offY, w, h);
    cam.updateProjectionMatrix();
  }

  applyState(msg: StateMsg) {
    this.state = msg;
    const seen = new Set<number>();
    for (const t of msg.towers) {
      seen.add(t.id);
      let v = this.towers.get(t.id);
      if (!v) {
        const facing = t.tm === 0 ? Math.PI : 0;
        const model = createTowerModel(t.k, this.colorFor(t.tm), facing);
        const pos = toWorld(t.x, t.y);
        model.group.position.copy(pos);
        this.scene.add(model.group);
        const bar = new Bar(t.k === "king" ? 2.6 : 2.0, this.colorFor(t.tm), true);
        this.scene.add(bar.group);
        v = {
          id: t.id, team: t.tm, kind: t.k, model, bar, pos, hp: t.hp, mhp: t.mhp, active: t.a,
          aimYaw: facing, flashT: 0, smokeT: 0, recoil: 0,
        };
        this.towers.set(t.id, v);
      }
      v.hp = t.hp;
      v.mhp = t.mhp;
      v.active = t.a;
      if (t.hp <= 0 && !v.model.destroyed) v.model.setDestroyed();
    }

    seen.clear();
    for (const u of msg.units) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      const target = toWorld(u.x, u.y);
      if (!v) {
        const card = CARDS[u.c];
        const model = createUnitModel(card, this.colorFor(u.tm));
        model.root.position.copy(target);
        this.scene.add(model.root);
        const bar = new Bar(model.barW, this.colorFor(u.tm));
        this.scene.add(bar.group);
        const yaw = Math.atan2(Math.cos(u.f), -Math.sin(u.f));
        v = {
          id: u.id, card, team: u.tm, model, bar, pos: target.clone(), target, yaw, hp: u.hp, mhp: u.mhp, st: u.st,
          walk: Math.random() * 6, attackT: 0, flashT: 0, spawnT: 0, stepT: 0,
        };
        model.root.rotation.y = yaw;
        this.units.set(u.id, v);
      }
      v.target.copy(target);
      v.hp = u.hp;
      v.mhp = u.mhp;
      v.st = u.st;
      if (u.st === UNIT_STATE.moving || u.st === UNIT_STATE.attacking) {
        v.yaw = Math.atan2(Math.cos(u.f), -Math.sin(u.f));
      }
    }
    for (const [id, v] of this.units) {
      if (seen.has(id)) continue;
      this.scene.remove(v.model.root, v.bar.group);
      this.units.delete(id);
    }

    seen.clear();
    for (const p of msg.proj) {
      seen.add(p.id);
      const target = toWorld(p.x, p.y, p.h);
      let v = this.projs.get(p.id);
      if (!v) {
        const obj = createProjectileModel(p.k, this.colorFor(p.tm));
        obj.position.copy(target);
        this.scene.add(obj);
        v = { id: p.id, kind: p.k, obj, pos: target.clone(), target, trailT: 0 };
        this.projs.set(p.id, v);
      }
      v.target.copy(target);
    }
    for (const [id, v] of this.projs) {
      if (seen.has(id)) continue;
      this.scene.remove(v.obj);
      this.projs.delete(id);
    }

    for (const ev of msg.ev) this.handleEvent(ev);
    if (this.selected && !msg.hand.includes(this.selected)) this.clearSelection();
  }

  private bodyPos(id: number): THREE.Vector3 | null {
    const u = this.units.get(id);
    if (u) return u.pos;
    const t = this.towers.get(id);
    if (t) return t.pos;
    return null;
  }

  private handleEvent(ev: GameEvent) {
    switch (ev.e) {
      case "deploy": {
        const card = CARDS[ev.c];
        const p = toWorld(ev.x, ev.y);
        const col = this.colorFor(ev.tm);
        if (card.kind === "spell" || card.delivery) break;
        const r = card.count > 1 ? card.spawnRadius + 0.6 : (card.unit?.radius ?? 0.5) * 1.6;
        this.fx.ring(p, col, r * 0.4, r * 1.6, 0.6, 0.9);
        this.fx.burst(p, 0xc9b28a, 10, { speed: 3, size: 0.12, up: 2 });
        if (ev.c === "samy") {
          this.shake = Math.max(this.shake, 0.9);
          this.fx.ring(p, 0xffd400, 1, 9, 1.1, 0.8);
          this.fx.burst(p, 0xc9b28a, 40, { speed: 8, size: 0.22, up: 4 });
          this.floatText(toWorld(ev.x, ev.y, 9), "SUPER SAMY !", "#ffcf3f", 44);
        } else if (ev.c === "natis") {
          this.shake = Math.max(this.shake, 0.25);
        }
        break;
      }
      case "spellCast": {
        const ground = toWorld(ev.x, ev.y);
        const col = this.colorFor(ev.tm);
        this.fx.ring(ground, col, ev.r, ev.r, ev.delay + 0.1, 0.55);
        const tex = headTexture(ev.c, col, true);
        const total = ev.delay + 0.7;
        this.fx.sprite(tex, toWorld(ev.x, ev.y, 6.5), 0.1, total, (s, k) => {
          const t = k * total;
          const grow = Math.min(1, t / ev.delay);
          const ease = 1 + 2.2 * (grow - 1) ** 3 + 1.2 * (grow - 1) ** 2;
          const size = t < ev.delay ? 4.6 * ease : 4.6 + (t - ev.delay) * 3;
          s.scale.setScalar(Math.max(0.05, size));
          s.material.opacity = t < ev.delay ? 1 : Math.max(0, 1 - (t - ev.delay) / 0.7);
        });
        break;
      }
      case "spell": {
        const p = toWorld(ev.x, ev.y);
        if (ev.c === "niels") {
          this.fx.ring(p, 0xbfe9ff, 0.3, ev.r * 1.1, 0.55, 0.95);
          this.fx.ring(p, 0xffffff, 0.2, ev.r * 0.8, 0.4, 0.7);
          this.fx.burst(p.clone().setY(0.5), 0xd6f3ff, 26, { speed: 6, size: 0.16, up: 4, cube: true });
          this.shake = Math.max(this.shake, 0.3);
        } else if (ev.c === "nazar") {
          this.fx.ring(p, 0x7a5634, 0.3, 2.4, 0.55, 0.9);
          this.fx.burst(p.clone().setY(0.3), 0x6b4a2c, 22, { speed: 4.5, size: 0.17, up: 5, cube: true });
          this.fx.smoke(p, 5, 0xa88b66, 0.4);
          this.shake = Math.max(this.shake, 0.2);
        } else {
          this.fx.ring(p, 0xc9b28a, 0.3, 2.2, 0.5, 0.9);
          this.fx.burst(p, 0xc4975a, 14, { speed: 4, size: 0.18, up: 3, cube: true });
          this.fx.smoke(p, 4, 0xd8cdb8, 0.35);
          this.shake = Math.max(this.shake, 0.15);
        }
        break;
      }
      case "hit": {
        const u = this.units.get(ev.id);
        const t = this.towers.get(ev.id);
        if (u) u.flashT = 0.12;
        if (t) t.flashT = 0.12;
        const base = u ? u.pos : t ? t.pos : toWorld(ev.x, ev.y);
        const h = u ? Math.min(u.model.height * 0.55, 2.5) : t ? 2.2 : 1;
        const colors: Record<string, number> = { finger: 0xffd54a, idea: 0xfff3a0, arrow: 0xffffff, cannon: 0xff9a3c, melee: 0xffffff, smash: 0xffd400 };
        if (ev.k !== "spell") this.fx.spark(base.clone().setY(h), colors[ev.k] ?? 0xffffff, ev.k === "cannon" ? 1.4 : 0.9, 0.22);
        if (ev.k === "cannon") this.fx.burst(base.clone().setY(h), 0x555555, 4, { speed: 2, size: 0.08 });
        break;
      }
      case "attack": {
        const u = this.units.get(ev.id);
        if (u) {
          u.attackT = 0.35;
          if (u.model.bulb) u.flashT = 0;
        }
        const t = this.towers.get(ev.id);
        const tp = this.bodyPos(ev.tid);
        if (t && tp) {
          t.aimYaw = Math.atan2(tp.x - t.pos.x, tp.z - t.pos.z);
          t.recoil = 0.2;
        }
        break;
      }
      case "die": {
        const p = toWorld(ev.x, ev.y, 0.6);
        const card = CARDS[ev.c];
        const big = card.look.scale >= 1.5;
        this.fx.burst(p, 0xffffff, big ? 26 : 10, { speed: big ? 5 : 3, size: big ? 0.25 : 0.13, up: 3 });
        this.fx.smoke(p, big ? 10 : 3, 0xe8e8e8, big ? 0.7 : 0.3);
        if (ev.c === "samy") {
          this.shake = Math.max(this.shake, 0.7);
          this.floatText(toWorld(ev.x, ev.y, 5), "SAMY EST TOMBÉ !", "#ffffff", 34);
        }
        break;
      }
      case "tower": {
        const p = toWorld(ev.x, ev.y, 2);
        this.fx.burst(p, 0x8f897d, 40, { speed: 8, size: 0.3, up: 6, cube: true });
        this.fx.burst(p, 0xff9a3c, 16, { speed: 5, size: 0.2, up: 5 });
        this.fx.smoke(p, 16, 0x777777, 0.9);
        this.fx.ring(toWorld(ev.x, ev.y), 0xffffff, 1, 6, 0.7, 0.8);
        this.shake = Math.max(this.shake, ev.k === "king" ? 1.2 : 0.6);
        const mine = ev.tm === this.opts.team;
        const crowns = ev.k === "king" ? "👑👑👑" : "👑";
        this.floatText(toWorld(ev.x, ev.y, 6.5), mine ? `Tour perdue` : `+${crowns}`, mine ? "#ff8a8a" : "#ffcf3f", 40);
        break;
      }
      case "smash": {
        this.shake = Math.max(this.shake, 1.1);
        const p = toWorld(ev.x, ev.y, 1);
        this.fx.ring(toWorld(ev.x, ev.y), 0xffd400, 1, 8, 0.9, 0.9);
        this.fx.burst(p, 0xffd400, 24, { speed: 9, size: 0.25, up: 7 });
        this.floatText(toWorld(ev.x, ev.y, 8), "RASÉE !", "#ffcf3f", 54);
        break;
      }
    }
  }

  floatText(world: THREE.Vector3, text: string, color: string, size: number) {
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    this.opts.overlay.appendChild(el);
    this.floaters.push({ el, world: world.clone(), life: 1.3 });
    this.placeFloater(this.floaters[this.floaters.length - 1]);
  }

  showEmote(team: Team, name: string, emote: string) {
    const king = [...this.towers.values()].find((t) => t.team === team && t.kind === "king");
    if (!king) return;
    const el = document.createElement("div");
    el.className = "bubble";
    el.innerHTML = `${emote}<small></small>`;
    el.querySelector("small")!.textContent = name;
    this.opts.overlay.appendChild(el);
    const f: Floater = { el, world: king.pos.clone().setY(7.5), life: 2.2 };
    this.floaters.push(f);
    this.placeFloater(f);
  }

  private placeFloater(f: Floater) {
    tmpV.copy(f.world).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    f.el.style.left = `${((tmpV.x + 1) / 2) * w}px`;
    f.el.style.top = `${((1 - tmpV.y) / 2) * h}px`;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.arena.update(this.time);
    const k = 1 - Math.exp(-dt * 14);
    const camQuat = this.camera.quaternion;

    for (const v of this.units.values()) {
      const m = v.model;
      const before = tmpV.copy(v.pos);
      const bx = before.x;
      const bz = before.z;
      v.pos.lerp(v.target, k);
      const moved = Math.hypot(v.pos.x - bx, v.pos.z - bz);
      const speed = moved / Math.max(dt, 1e-4);
      m.root.position.copy(v.pos);

      let dy = v.yaw - m.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.root.rotation.y += dy * Math.min(1, dt * 10);

      if (v.spawnT < 1) {
        v.spawnT = Math.min(1, v.spawnT + dt / 0.35);
        const e = v.spawnT;
        m.inner.position.y = (1 - e) * (1 - e) * 3;
        const s = 0.4 + 0.6 * e + Math.sin(e * Math.PI) * 0.15;
        m.root.scale.setScalar(s);
      } else {
        m.root.scale.setScalar(1);
      }

      const frozen = v.st === UNIT_STATE.frozen;
      const walking = !frozen && speed > 0.15 && v.st === UNIT_STATE.moving;
      if (walking) v.walk += dt * (4 + speed * 5) / Math.max(0.8, Math.sqrt(v.card.look.scale));
      const swing = walking ? Math.sin(v.walk) * 0.7 : 0;
      for (const [i, leg] of m.legs.entries()) {
        const target = i === 0 ? swing : -swing;
        leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 14);
      }
      for (const [i, arm] of m.arms.entries()) {
        let target = i === 0 ? -swing * 0.8 : swing * 0.8;
        if (v.card.look.weapon === "finger" && i === 1) target = -1.3;
        if (i === 1 && v.attackT > 0) {
          const t = 1 - v.attackT / 0.35;
          target = v.card.look.weapon === "finger" ? -1.5 : -2.4 * Math.sin(t * Math.PI);
        }
        if (i === 0 && v.attackT > 0 && v.card.id === "natis") {
          const t = 1 - v.attackT / 0.35;
          target = -2.4 * Math.sin(t * Math.PI);
        }
        arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 18);
      }
      if (v.spawnT >= 1) {
        const bob = walking ? Math.abs(Math.sin(v.walk)) * 0.06 : Math.sin(this.time * 2 + v.id) * 0.015;
        m.inner.position.y = bob;
      }
      if (v.attackT > 0) {
        v.attackT = Math.max(0, v.attackT - dt);
        const t = 1 - v.attackT / 0.35;
        m.inner.position.z = Math.sin(t * Math.PI) * 0.18 * v.card.look.scale;
      } else {
        m.inner.position.z = 0;
      }
      if (m.cape) m.cape.rotation.x = 0.18 + (walking ? 0.25 + Math.sin(v.walk * 2) * 0.12 : Math.sin(this.time * 1.5) * 0.05);
      if (m.bulb) {
        const mat = m.bulb.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + (v.attackT > 0 ? 2.5 : Math.sin(this.time * 3) * 0.3);
      }

      if (v.card.id === "samy" && walking) {
        v.stepT -= dt;
        if (v.stepT <= 0) {
          v.stepT = 0.9;
          this.fx.burst(v.pos.clone().setY(0.1), 0xc9b28a, 8, { speed: 3, size: 0.18, up: 1.5 });
          this.shake = Math.max(this.shake, UP_SAMY);
        }
      }

      v.flashT = Math.max(0, v.flashT - dt);
      const deploying = v.st === UNIT_STATE.deploying;
      for (const mat of m.mats) {
        mat.userData.e ??= mat.emissive.clone();
        mat.userData.ei ??= mat.emissiveIntensity;
        if (v.flashT > 0) {
          mat.emissive.setRGB(1, 1, 1);
          mat.emissiveIntensity = 0.8;
        } else if (frozen) {
          mat.emissive.setRGB(0.35, 0.7, 1);
          mat.emissiveIntensity = 0.7;
        } else if (deploying) {
          mat.emissive.setRGB(0.2, 0.2, 0.25);
          mat.emissiveIntensity = 0.6;
        } else if (!m.bulb || mat !== m.bulb.material) {
          mat.emissive.copy(mat.userData.e);
          mat.emissiveIntensity = mat.userData.ei;
        }
      }
      m.head.material.color.setRGB(v.flashT > 0 ? 1.6 : frozen ? 0.7 : 1, v.flashT > 0 ? 1.6 : frozen ? 0.85 : 1, v.flashT > 0 ? 1.6 : 1);

      const showBar = v.hp < v.mhp || v.card.kind === "building" || v.card.id === "samy";
      v.bar.group.visible = showBar;
      if (showBar) {
        v.bar.group.position.set(v.pos.x, m.inner.position.y + m.barY, v.pos.z);
        v.bar.group.quaternion.copy(camQuat);
        v.bar.set(v.hp / v.mhp);
      }
    }

    for (const t of this.towers.values()) {
      const m = t.model;
      const alive = !m.destroyed;
      t.bar.group.visible = alive;
      if (alive) {
        t.bar.group.position.set(t.pos.x, m.height + 0.7, t.pos.z);
        t.bar.group.quaternion.copy(camQuat);
        t.bar.set(t.hp / t.mhp, String(t.hp));
        let dy = t.aimYaw - m.turret.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        m.turret.rotation.y += dy * Math.min(1, dt * 8);
        t.recoil = Math.max(0, t.recoil - dt);
        m.turret.position.y = (t.kind === "king" ? 3.35 : 3.15) - t.recoil * 0.4;
        t.flashT = Math.max(0, t.flashT - dt);
        m.intact.scale.setScalar(1 + t.flashT * 0.25);
        if (t.kind === "king" && !t.active) {
          m.turret.rotation.y += Math.sin(this.time * 0.8) * 0.002;
        }
      } else {
        t.smokeT -= dt;
        if (t.smokeT <= 0) {
          t.smokeT = 0.5 + Math.random() * 0.4;
          this.fx.smoke(t.pos.clone().setY(0.8), 1, 0x5a5a5a, 0.5);
        }
      }
    }

    const kp = 1 - Math.exp(-dt * 30);
    for (const p of this.projs.values()) {
      const prev = tmpV.copy(p.pos);
      const px = prev.x, py = prev.y, pz = prev.z;
      p.pos.lerp(p.target, kp);
      p.obj.position.copy(p.pos);
      const dx = p.pos.x - px, dy = p.pos.y - py, dz = p.pos.z - pz;
      if (p.kind === "arrow" && dx * dx + dz * dz > 1e-6) {
        p.obj.lookAt(p.pos.x + dx, p.pos.y + dy, p.pos.z + dz);
      }
      if (p.kind === "barrel") {
        p.obj.rotation.x += dt * 9;
        p.obj.rotation.z += dt * 5;
      }
      p.trailT -= dt;
      if (p.kind === "dig" && p.trailT <= 0) {
        p.trailT = 0.07;
        this.fx.burst(p.pos.clone().setY(0.15), 0x7a5634, 2, { speed: 1.2, size: 0.1, up: 2.2, life: 0.5 });
      }
      if (p.kind === "dig") p.obj.position.y = 0.02 + Math.abs(Math.sin(this.time * 14)) * 0.05;
      if ((p.kind === "finger" || p.kind === "idea") && p.trailT <= 0) {
        p.trailT = 0.02;
        this.fx.spark(p.pos.clone(), p.kind === "finger" ? 0xffc400 : 0xfff3a0, 0.55, 0.22);
      }
    }

    this.fx.update(dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * this.shake * 0.6;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z + (Math.random() - 0.5) * s,
      );
    } else {
      this.camera.position.copy(this.camBase);
    }

    const keep: Floater[] = [];
    for (const f of this.floaters) {
      f.life -= dt;
      if (f.life <= 0) {
        f.el.remove();
        continue;
      }
      this.placeFloater(f);
      keep.push(f);
    }
    this.floaters = keep;

    this.updateGhost();
  }

  // ---------- Input ----------

  startDrag(card: CardId, e: PointerEvent) {
    this.selected = card;
    this.dragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.pointer = { x: e.clientX, y: e.clientY, inside: false };
    this.showZones(CARDS[card]);
    this.opts.onSelect(card, true);
  }

  select(card: CardId | null) {
    this.selected = card;
    if (card) this.showZones(CARDS[card]);
    else this.zones.clear();
    this.opts.onSelect(card, false);
  }

  get selection(): CardId | null {
    return this.selected;
  }

  clearSelection() {
    this.selected = null;
    this.dragging = false;
    this.tapActive = false;
    this.zones.clear();
    this.ghost.visible = false;
    this.opts.onSelect(null, false);
  }

  private isOverHud(x: number, y: number): boolean {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest(".hud-bottom, .emote-menu, .emote-btn, .end-screen");
  }

  private onCanvasDown = (e: PointerEvent) => {
    if (!this.selected) return;
    this.tapActive = true;
    this.pointer = { x: e.clientX, y: e.clientY, inside: true };
  };

  private onMove = (e: PointerEvent) => {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.inside = e.target === this.renderer.domElement || (this.dragging && !this.isOverHud(e.clientX, e.clientY));
  };

  private onUp = (e: PointerEvent) => {
    if (this.dragging) {
      this.dragging = false;
      const moved = Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 12;
      const overHud = this.isOverHud(e.clientX, e.clientY);
      if (!overHud && moved) {
        this.tryPlay(e.clientX, e.clientY);
        return;
      }
      if (!moved) {
        this.opts.onSelect(this.selected, false);
        return;
      }
      this.clearSelection();
      return;
    }
    if (this.tapActive) {
      this.tapActive = false;
      if (!this.isOverHud(e.clientX, e.clientY)) this.tryPlay(e.clientX, e.clientY);
    }
  };

  private onCancel = () => {
    if (this.dragging) this.clearSelection();
    this.tapActive = false;
  };

  private pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    const a = toArena(hit);
    if (a.x < -1 || a.x > ARENA_W + 1 || a.y < -1 || a.y > ARENA_H + 1) return null;
    return { x: snapTile(a.x, ARENA_W), y: snapTile(a.y, ARENA_H) };
  }

  private validAt(card: CardDef, x: number, y: number): boolean {
    const s = this.state;
    if (!s) return false;
    const towers = s.towers.map((t) => ({ team: t.tm, kind: t.k, x: t.x, y: t.y, alive: t.hp > 0 }));
    const buildings = s.units
      .filter((u) => CARDS[u.c].kind === "building")
      .map((u) => ({ x: u.x, y: u.y, radius: CARDS[u.c].unit!.radius }));
    return canDeployAt(this.opts.team, card, x, y, towers, buildings);
  }

  private tryPlay(clientX: number, clientY: number) {
    const card = this.selected ? CARDS[this.selected] : null;
    const s = this.state;
    if (!card || !s) return;
    const p = this.pick(clientX, clientY);
    if (!p) {
      this.clearSelection();
      return;
    }
    if (s.phase !== "playing" && s.phase !== "overtime") {
      this.opts.onToast("La partie n'a pas commencé");
      return;
    }
    if (!this.validAt(card, p.x, p.y)) {
      this.opts.onToast("Placement interdit ici");
      return;
    }
    if (s.el < card.cost) {
      this.opts.onToast("Pas assez de caféine");
      return;
    }
    this.opts.onPlay(card.id, p.x, p.y);
    this.clearSelection();
  }

  private ghostCard: CardId | null = null;

  private updateGhost() {
    const card = this.selected ? CARDS[this.selected] : null;
    const active = card && (this.dragging || this.tapActive || this.pointer.inside);
    if (!card || !active) {
      this.ghost.visible = false;
      return;
    }
    if (this.dragging && this.isOverHud(this.pointer.x, this.pointer.y)) {
      this.ghost.visible = false;
      return;
    }
    const p = this.pick(this.pointer.x, this.pointer.y);
    if (!p) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    const w = toWorld(p.x, p.y);
    this.ghost.position.lerp(w, this.ghost.userData.init ? 0.5 : 1);
    this.ghost.userData.init = true;
    const r =
      card.kind === "spell"
        ? card.spell!.radius
        : card.count > 1
          ? card.spawnRadius + card.unit!.radius
          : Math.max(0.6, card.unit!.radius * 1.2);
    this.ghostFill.scale.setScalar(r);
    this.ghostRing.scale.setScalar(r);
    const ok = this.validAt(card, p.x, p.y) && (this.state?.el ?? 0) >= card.cost;
    const col = ok ? 0xffffff : 0xff4d4d;
    (this.ghostRing.material as THREE.MeshBasicMaterial).color.setHex(col);
    (this.ghostFill.material as THREE.MeshBasicMaterial).color.setHex(col);
    if (this.ghostCard !== card.id) {
      this.ghostCard = card.id;
      this.ghostHead.material.map = headTexture(card.id, ALLY);
      this.ghostHead.material.needsUpdate = true;
    }
    const hs = card.id === "samy" ? 2.4 : 1.1;
    this.ghostHead.scale.setScalar(hs);
    this.ghostHead.position.y = card.kind === "spell" ? 3 : 1.4 + hs * 0.3 + Math.sin(this.time * 5) * 0.08;
  }

  private showZones(card: CardDef) {
    this.zones.clear();
    if (card.deployAnywhere) return;
    const s = this.state;
    if (!s) return;
    const towers = s.towers.map((t) => ({ team: t.tm, kind: t.k, x: t.x, y: t.y, alive: t.hp > 0 }));
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.22, depthWrite: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0xff6060, transparent: true, opacity: 0.75, depthWrite: false });
    const team = this.opts.team;
    const toAbs = (ly: number) => (team === 0 ? ly : ARENA_H - ly);
    const rect = (x0: number, x1: number, ly0: number, ly1: number, h: number, withEdge: boolean) => {
      const a = toWorld(x0, toAbs(ly0));
      const b = toWorld(x1, toAbs(ly1));
      const w = Math.abs(b.x - a.x);
      const d = Math.abs(b.z - a.z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((a.x + b.x) / 2, h, (a.z + b.z) / 2);
      this.zones.add(m);
      if (withEdge) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08), edge);
        line.rotation.x = -Math.PI / 2;
        line.position.set((a.x + b.x) / 2, h + 0.01, a.z);
        this.zones.add(line);
      }
    };
    const riverLo = RIVER_Y - RIVER_HALF - 0.5;
    const riverHi = RIVER_Y + RIVER_HALF + 0.5;
    for (const left of [true, false]) {
      const x0 = left ? 0 : ARENA_W / 2;
      const x1 = left ? ARENA_W / 2 : ARENA_W;
      const open = pocketOpen(team, left, towers);
      if (open) {
        rect(x0, x1, riverLo, riverHi, 0.12, true);
        rect(x0, x1, RIVER_Y + RIVER_HALF + POCKET_DEPTH, ARENA_H, 0.04, true);
      } else {
        rect(x0, x1, riverLo, ARENA_H, 0.04, true);
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
    this.resizeObs.disconnect();
    this.fx.clear();
    for (const f of this.floaters) f.el.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
