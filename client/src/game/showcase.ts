import * as THREE from "three";
import { CARDS, type CardDef, type CardId } from "../../../shared/cards";
import { Fx } from "./fx";
import { getTemplate, instantiateGlb } from "./glb";
import { cigarTip, hasCigar } from "./cigar";
import { Glare } from "./glare";
import { IceShell, frostPuff, shatterIce } from "./ice";
import { createProjectileModel, createRollerModel, createUnitModel, type UnitModel } from "./models";
import { ALLY, ENEMY, headTexture } from "./textures";

// Petite scène 3D de la fiche d'une carte : le modèle sur un socle qui tourne,
// avec un cycle animé en boucle. Glisser pour tourner.
//   troupes / bâtiment : apparition → marche → deux attaques → repos
//   Papy Niels (sort) : il se balance, fixe un Valère adverse, le gèle, la glace éclate

const ATTACK_LEN = 0.35;

export interface Showcase {
  dispose(): void;
}

export function hasShowcase(id: CardId): boolean {
  return CARDS[id].kind !== "spell" || !!CARDS[id].spell?.roll || (id === "niels" && !!getTemplate("niels"));
}

export function createShowcase(container: HTMLElement, id: CardId): Showcase | null {
  if (!hasShowcase(id)) return null;
  const stage = new Stage(container);
  const card = CARDS[id];
  const content = id === "niels" ? nielsContent(stage) : card.spell?.roll ? rollerContent(stage, card) : unitContent(stage, card);
  stage.start(content);
  return stage;
}

interface Content {
  update(dt: number, time: number): void;
}

// ------------------------------------------------------------------ scène

class Stage implements Showcase {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  turntable = new THREE.Group();
  fx: Fx;
  private sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  private ro: ResizeObserver;
  private raf = 0;
  private yaw = 0.5;
  private dragging = false;
  private lastX = 0;
  private idleSince = 0;
  time = 0;

  constructor(private container: HTMLElement) {
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    container.appendChild(r.domElement);

    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4a5a3a, 1.6));
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target, this.turntable);
    this.fx = new Fx(this.scene);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    const el = r.domElement;
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    const up = () => {
      this.dragging = false;
      this.idleSince = this.time;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /** Socle + cadrage d'après la hauteur et le rayon occupé par le contenu. */
  frame(top: number, radius: number, offsetZ = 0) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.35 + 0.3, radius * 1.45 + 0.35, 0.3, 48),
      new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.9 }),
    );
    base.position.set(0, -0.15, offsetZ);
    base.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.35 + 0.3, 0.05, 8, 64),
      new THREE.MeshStandardMaterial({ color: ALLY, emissive: ALLY, emissiveIntensity: 0.4 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.005, offsetZ);
    this.turntable.add(base, rim);
    for (const c of this.turntable.children) c.position.z -= offsetZ;

    const center = new THREE.Vector3(0, top * 0.42, 0);
    const span = Math.max(top * 1.35, radius * 2.4 + 0.8);
    const dist = (span / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) * 1.05;
    this.camera.position.set(0, center.y + dist * 0.28, dist);
    this.camera.lookAt(center);
    const s = Math.max(top, radius * 2) * 1.2;
    const sc = this.sun.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.near = 0.5;
    sc.far = 40 + s * 4;
    sc.updateProjectionMatrix();
    this.sun.position.set(-s, s * 2.5, s * 1.5);
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(content: Content) {
    let prev = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      this.time += dt;
      if (!this.dragging && this.time - this.idleSince > 1.2) this.yaw += dt * 0.45;
      this.turntable.rotation.y = this.yaw;
      this.turntable.updateMatrixWorld(true);
      content.update(dt, this.time);
      this.fx.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.fx.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// ------------------------------------------------------- animation unité

/** Anime jambes, bras, cape, roues, ampoule comme en jeu. */
function animateUnit(card: CardDef, m: UnitModel, s: { walk: number; attackT: number }, dt: number, time: number, walking: boolean, phase = 0) {
  const isFinger = card.look.weapon === "finger";
  const speed = walking ? 1.6 : 0;
  if (walking) s.walk += (dt * (4 + speed * 5)) / Math.max(0.8, Math.sqrt(card.look.scale));
  const swing = walking ? Math.sin(s.walk) * 0.7 : 0;
  for (const [i, leg] of m.legs.entries()) {
    const target = i % 2 === 0 ? swing : -swing;
    leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 14);
  }
  for (const [i, arm] of m.arms.entries()) {
    let target = i === 0 ? -swing * 0.8 : swing * 0.8;
    if (isFinger && i === 1) target = -1.3;
    if (s.attackT > 0 && (i === 1 || card.id === "natis")) {
      const k = 1 - s.attackT / ATTACK_LEN;
      target = isFinger ? -1.5 : -2.4 * Math.sin(k * Math.PI);
    }
    arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 18);
  }
  if (m.wheels) for (const w of m.wheels) w.rotation.x += (speed * 2.5 * dt) / 0.38;
  if (m.cape) m.cape.rotation.x = 0.18 + (walking ? 0.25 + Math.sin(s.walk * 2) * 0.12 : Math.sin(time * 1.5) * 0.05);
  if (m.bulb) {
    const mat = m.bulb.material as THREE.MeshStandardMaterial;
    const target = 0.5 + Math.sin(time * 3) * 0.3;
    mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, dt * 4);
  }
  m.inner.position.y = walking ? Math.abs(Math.sin(s.walk)) * 0.06 : Math.sin(time * 2 + phase * 9) * 0.015;
  if (s.attackT > 0) {
    s.attackT = Math.max(0, s.attackT - dt);
    const k = 1 - s.attackT / ATTACK_LEN;
    m.inner.position.z = Math.sin(k * Math.PI) * 0.18 * Math.min(card.look.scale, 1.6);
  } else {
    m.inner.position.z = 0;
  }
}

function spawnPop(m: UnitModel, time: number) {
  const spawn = Math.min(1, time / 0.45);
  if (spawn < 1) m.inner.position.y = (1 - spawn) * (1 - spawn) * 3;
  m.root.scale.setScalar(spawn < 1 ? 0.4 + 0.6 * spawn + Math.sin(spawn * Math.PI) * 0.15 : 1);
}

function measure(objs: THREE.Object3D[], minTop = 0) {
  const box = new THREE.Box3();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    box.expandByObject(o);
  }
  const top = Math.max(box.max.y, minTop);
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1) / 2;
  return { top, radius, centerZ: (box.min.z + box.max.z) / 2 };
}

// ---------------------------------------------------- troupes et bâtiment

const UNIT_CYCLE = 5.2;
const ATTACKS = [3.0, 3.75];

function unitContent(stage: Stage, card: CardDef): Content {
  const n = card.kind === "troop" ? Math.min(card.count, 3) : 1;
  const spots = n === 1 ? [[0, 0]] : n === 2 ? [[-0.6, 0], [0.6, 0]] : [[0, 0.45], [-0.85, -0.35], [0.85, -0.35]];
  const actors: { model: UnitModel; phase: number; walk: number; attackT: number; cycle: number; fired: Set<number>; puffT: number; cigarT: number }[] = [];
  let spacing = 0;
  for (let i = 0; i < n; i++) {
    const model = createUnitModel(card.spawns ? CARDS[card.spawns[i % card.spawns.length]] : card, ALLY);
    if (i === 0) spacing = Math.max(0.9, model.barW * 0.9);
    model.root.position.set(spots[i][0] * spacing, 0, spots[i][1] * spacing);
    stage.turntable.add(model.root);
    actors.push({ model, phase: i * 0.37, walk: i * 1.7, attackT: 0, cycle: -1, fired: new Set(), puffT: 0, cigarT: 0 });
  }
  const { top, radius } = measure(actors.map((a) => a.model.root), Math.max(...actors.map((a) => a.model.height)));
  stage.frame(top, radius);

  const shots: { obj: THREE.Object3D; t: number; from: THREE.Vector3; to: THREE.Vector3; back?: UnitModel }[] = [];
  const shoot = (m: UnitModel) => {
    const boomerang = !!card.unit?.boomerang;
    const proj = boomerang ? { kind: "briefcase" } : card.unit?.projectile;
    if (!proj) return;
    const obj = createProjectileModel(proj.kind, ALLY);
    obj.scale.setScalar(card.look.scale >= 3 ? 1 : Math.max(1, card.look.scale));
    const yaw = m.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const from = m.root.position.clone().add(new THREE.Vector3(0, m.height * 0.6, 0)).addScaledVector(fwd, 0.4);
    const to = from.clone().addScaledVector(fwd, radius + 3).setY(0.4);
    obj.position.copy(from);
    stage.turntable.add(obj);
    shots.push({ obj, t: 0, from, to, back: boomerang ? m : undefined });
    if (boomerang && m.prop) m.prop.visible = false;
  };

  return {
    update(dt, time) {
      for (const a of actors) {
        const m = a.model;
        const t = time + a.phase;
        const cycle = Math.floor(t / UNIT_CYCLE);
        const ct = t - cycle * UNIT_CYCLE;
        if (cycle !== a.cycle) {
          a.cycle = cycle;
          a.fired.clear();
        }
        for (const [i, at] of ATTACKS.entries()) {
          if (ct < at || a.fired.has(i)) continue;
          a.fired.add(i);
          a.attackT = ATTACK_LEN;
          if (m.bulb) (m.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 3;
          shoot(m);
        }
        const walking = card.kind !== "building" && ct > 0.5 && ct < 2.6;
        animateUnit(card, m, a, dt, time, walking, a.phase);
        // Vapeur de la machine à café et fumée du cigare de Paco.
        a.puffT -= dt;
        if (m.steam && a.puffT <= 0) {
          a.puffT = 0.35 + Math.random() * 0.3;
          stage.fx.smoke(m.steam.clone().applyMatrix4(m.root.matrixWorld), 1, 0xf4f1ea, 0.18);
        }
        a.cigarT -= dt;
        if (hasCigar(card.id) && a.cigarT <= 0) {
          a.cigarT = 0.45 + Math.random() * 0.4;
          stage.fx.smoke(cigarTip(m.head, stage.camera), 1, 0xbdbdbd, 0.13);
        }
        spawnPop(m, time);
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.t += dt / (s.back ? 1.2 : 0.45);
        if (s.back) {
          s.obj.position.lerpVectors(s.from, s.to, Math.sin(Math.min(1, s.t) * Math.PI));
          s.obj.position.y = s.from.y;
          const spin = s.obj.getObjectByName("spin");
          if (spin) spin.rotation.y += dt * 14;
        } else {
          s.obj.position.lerpVectors(s.from, s.to, Math.min(1, s.t));
          s.obj.position.y += Math.sin(Math.min(1, s.t) * Math.PI) * 0.5;
        }
        if (s.t >= 1) {
          if (s.back?.prop) s.back.prop.visible = true;
          s.obj.removeFromParent();
          shots.splice(i, 1);
        }
      }
    },
  };
}

// ------------------------------------------------------- sorts qui roulent

function rollerContent(stage: Stage, card: CardDef): Content {
  const roller = createRollerModel(card.id, ALLY);
  roller.position.y = 0.8;
  roller.scale.setScalar(1.5);
  stage.turntable.add(roller);
  const { top, radius } = measure([roller], 1.6);
  stage.frame(top, radius);
  const spin = roller.getObjectByName("spin");
  const face = roller.getObjectByName("face") as THREE.Sprite | undefined;

  return {
    update(_dt, time) {
      const k = (time % 2.4) / 2.4;
      const z = Math.sin(k * Math.PI * 2) * 1.1;
      const dz = z - roller.position.z;
      roller.position.z = z;
      if (spin) spin.rotation.x += dz / 0.55;
      if (face) face.material.rotation += dz / 0.55;
    },
  };
}

// ------------------------------------------------------------ Papy Niels

const NIELS_CYCLE = 5.4;
const GLARE_AT = 1.3;
const FREEZE_AT = 2.0;
const THAW_AT = 4.3;

function nielsContent(stage: Stage): Content {
  const parts = instantiateGlb("niels", ALLY)!;
  const papy = parts.scene;
  papy.position.z = -1.1;
  stage.turntable.add(papy);
  const rock = papy.getObjectByName("rock");
  const anchor = papy.getObjectByName("head_anchor") ?? papy;
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture("niels", ALLY, true), alphaTest: 0.5 }));
  head.scale.setScalar(1.05);
  anchor.add(head);

  // La victime : un Valère de l'équipe adverse qui avance vers Papy.
  const victimCard = CARDS.valere;
  const victim = createUnitModel(victimCard, ENEMY);
  victim.root.position.z = 1.3;
  victim.root.rotation.y = Math.PI;
  stage.turntable.add(victim.root);
  const vs = { walk: 0, attackT: 0 };

  const { top, radius, centerZ } = measure([papy, victim.root], 2.1);
  stage.frame(top, radius, centerZ);

  const glare = new Glare(0.6);
  stage.turntable.add(glare.group);
  let ice: IceShell | null = null;
  let cycle = -1;
  const saved = victim.mats.map((m) => ({ m, e: m.emissive.clone(), i: m.emissiveIntensity }));
  const tint = (on: boolean) => {
    for (const s of saved) {
      if (on) {
        s.m.emissive.setRGB(0.35, 0.7, 1);
        s.m.emissiveIntensity = 0.7;
      } else {
        s.m.emissive.copy(s.e);
        s.m.emissiveIntensity = s.i;
      }
    }
    victim.head.material.color.setRGB(on ? 0.7 : 1, on ? 0.85 : 1, 1);
  };

  return {
    update(dt, time) {
      const c = Math.floor(time / NIELS_CYCLE);
      const t = time - c * NIELS_CYCLE;
      if (c !== cycle) cycle = c;

      // Papy se balance, s'immobilise pour fixer sa cible.
      const staring = t > GLARE_AT - 0.2 && t < FREEZE_AT + 0.3;
      if (rock) {
        const target = staring ? -0.06 : Math.sin(time * 1.8) * 0.09;
        rock.rotation.x += (target - rock.rotation.x) * Math.min(1, dt * (staring ? 10 : 6));
      }
      head.scale.setScalar(staring ? 1.05 + Math.sin(Math.min(1, (t - GLARE_AT + 0.2) / 0.25) * Math.PI) * 0.12 + 0.05 : 1.05);

      // Le regard.
      let a = 0;
      if (t >= GLARE_AT && t < FREEZE_AT + 0.15) {
        a = Math.min(1, (t - GLARE_AT) / 0.12) * (t > FREEZE_AT ? Math.max(0, 1 - (t - FREEZE_AT) / 0.15) : 1);
      }
      const aim = victim.root.getWorldPosition(new THREE.Vector3()).setY(victim.height * 0.45);
      glare.update(head, stage.camera, aim, a, time);

      // Gel puis éclatement.
      const frozen = t >= FREEZE_AT && t < THAW_AT;
      if (frozen && !ice) {
        ice = IceShell.around(victim.root, victim.inner);
        frostPuff(stage.fx, victim.root.getWorldPosition(new THREE.Vector3()), ice.size);
        tint(true);
      } else if (!frozen && ice) {
        shatterIce(stage.fx, ice);
        ice = null;
        tint(false);
      }
      ice?.update(dt);
      if (!frozen) animateUnit(victimCard, victim, vs, dt, time, true);
      spawnPop(victim, time);
    },
  };
}
