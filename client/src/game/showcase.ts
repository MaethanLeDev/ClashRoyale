import * as THREE from "three";
import { CARDS, type CardId } from "../../../shared/cards";
import { createProjectileModel, createRollerModel, createUnitModel, type UnitModel } from "./models";
import { ALLY } from "./textures";

// Petite scène 3D de la fiche d'une carte : le modèle sur un socle qui tourne,
// avec un cycle apparition → marche → attaques → repos. Glisser pour tourner.

const CYCLE = 5.2;
const ATTACKS = [3.0, 3.75];
const ATTACK_LEN = 0.35;

interface Actor {
  model: UnitModel;
  phase: number;
  walk: number;
  attackT: number;
  lastCycle: number;
  fired: Set<number>;
}

interface Shot {
  obj: THREE.Object3D;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  back?: Actor;
}

export interface Showcase {
  dispose(): void;
}

export function hasShowcase(id: CardId): boolean {
  return CARDS[id].kind !== "spell" || !!CARDS[id].spell?.roll;
}

export function createShowcase(container: HTMLElement, id: CardId): Showcase | null {
  const card = CARDS[id];
  if (!hasShowcase(id)) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4a5a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  sun.position.set(-4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // Plateau tournant : socle + unités + projectiles tournent ensemble.
  const turntable = new THREE.Group();
  scene.add(turntable);

  const actors: Actor[] = [];
  const roller = card.spell?.roll ? createRollerModel(card.id, ALLY) : null;
  if (roller) {
    roller.position.y = 0.8;
    roller.scale.setScalar(1.5);
    turntable.add(roller);
  }
  const n = roller ? 0 : card.kind === "troop" ? Math.min(card.count, 3) : 1;
  const spots = n === 1 ? [[0, 0]] : n === 2 ? [[-0.6, 0], [0.6, 0]] : [[0, 0.45], [-0.85, -0.35], [0.85, -0.35]];
  let spacing = 0;
  for (let i = 0; i < n; i++) {
    const model = createUnitModel(card.spawns ? CARDS[card.spawns[i % card.spawns.length]] : card, ALLY);
    if (i === 0) spacing = Math.max(0.9, model.barW * 0.9);
    model.root.position.set(spots[i][0] * spacing, 0, spots[i][1] * spacing);
    turntable.add(model.root);
    actors.push({ model, phase: i * 0.37, walk: i * 1.7, attackT: 0, lastCycle: -1, fired: new Set() });
  }

  // Cadrage d'après la taille réelle du groupe.
  turntable.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const a of actors) box.expandByObject(a.model.root);
  if (roller) box.expandByObject(roller);
  const top = Math.max(box.max.y, ...actors.map((a) => a.model.height), roller ? 1.6 : 0);
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1) / 2;
  box.max.y = top;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.35 + 0.3, radius * 1.45 + 0.35, 0.3, 48),
    new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.9 }),
  );
  base.position.y = -0.15;
  base.receiveShadow = true;
  turntable.add(base);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.35 + 0.3, 0.05, 8, 64),
    new THREE.MeshStandardMaterial({ color: ALLY, emissive: ALLY, emissiveIntensity: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.005;
  turntable.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const center = new THREE.Vector3(0, top * 0.42, 0);
  const span = Math.max(top * 1.35, radius * 2.4 + 0.8);
  const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * 1.05;
  camera.position.set(0, center.y + dist * 0.28, dist);
  camera.lookAt(center);
  const sc = sun.shadow.camera;
  const s = Math.max(top, radius * 2) * 1.2;
  sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
  sc.near = 0.5; sc.far = 40 + s * 4;
  sun.position.set(-s, s * 2.5, s * 1.5);
  sc.updateProjectionMatrix();

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Rotation à la souris / au doigt, reprise automatique ensuite.
  let yaw = 0.5;
  let dragging = false;
  let lastX = 0;
  let idleSince = 0;
  let time = 0;
  const el = renderer.domElement;
  el.style.touchAction = "pan-y";
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    el.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  };
  const up = () => {
    dragging = false;
    idleSince = time;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  const shots: Shot[] = [];
  const shoot = (a: Actor) => {
    const boomerang = !!card.unit?.boomerang;
    const proj = boomerang ? { kind: "briefcase" } : card.unit?.projectile;
    if (!proj) return;
    const m = a.model;
    const obj = createProjectileModel(proj.kind, ALLY);
    const s = card.look.scale >= 3 ? 1 : Math.max(1, card.look.scale);
    obj.scale.setScalar(s);
    const yawA = m.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yawA), 0, Math.cos(yawA));
    const from = m.root.position.clone().add(new THREE.Vector3(0, m.height * 0.6, 0)).addScaledVector(fwd, 0.4);
    const to = from.clone().addScaledVector(fwd, radius + 3).setY(0.4);
    obj.position.copy(from);
    turntable.add(obj);
    shots.push({ obj, t: 0, from, to, back: boomerang ? a : undefined });
    if (boomerang && m.prop) m.prop.visible = false;
  };

  const isFinger = card.look.weapon === "finger";
  let raf = 0;
  let prev = performance.now();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;
    if (!dragging && time - idleSince > 1.2) yaw += dt * 0.45;
    turntable.rotation.y = yaw;

    for (const a of actors) {
      const m = a.model;
      const t = time + a.phase;
      const cycle = Math.floor(t / CYCLE);
      const ct = t - cycle * CYCLE;
      if (cycle !== a.lastCycle) {
        a.lastCycle = cycle;
        a.fired.clear();
      }
      // Apparition (premier cycle seulement), comme en jeu.
      const spawn = Math.min(1, time / 0.45);
      const walking = card.kind !== "building" && ct > 0.5 && ct < 2.6;
      for (const [i, at] of ATTACKS.entries()) {
        if (ct < at || a.fired.has(i)) continue;
        a.fired.add(i);
        a.attackT = ATTACK_LEN;
        if (m.bulb) (m.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 3;
        shoot(a);
      }
      const speed = walking ? 1.6 : 0;
      if (walking) a.walk += dt * (4 + speed * 5) / Math.max(0.8, Math.sqrt(card.look.scale));
      const swing = walking ? Math.sin(a.walk) * 0.7 : 0;
      for (const [i, leg] of m.legs.entries()) {
        const target = i % 2 === 0 ? swing : -swing;
        leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 14);
      }
      for (const [i, arm] of m.arms.entries()) {
        let target = i === 0 ? -swing * 0.8 : swing * 0.8;
        if (isFinger && i === 1) target = -1.3;
        if (a.attackT > 0 && (i === 1 || card.id === "natis")) {
          const k = 1 - a.attackT / ATTACK_LEN;
          target = isFinger ? -1.5 : -2.4 * Math.sin(k * Math.PI);
        }
        arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 18);
      }
      if (m.wheels) for (const w of m.wheels) w.rotation.x += (speed * 2.5 * dt) / 0.38;
      if (m.cape) m.cape.rotation.x = 0.18 + (walking ? 0.25 + Math.sin(a.walk * 2) * 0.12 : Math.sin(time * 1.5) * 0.05);
      if (m.bulb) {
        const mat = m.bulb.material as THREE.MeshStandardMaterial;
        const target = 0.5 + Math.sin(time * 3) * 0.3;
        mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, dt * 4);
      }
      let y = walking ? Math.abs(Math.sin(a.walk)) * 0.06 : Math.sin(time * 2 + a.phase * 9) * 0.015;
      if (spawn < 1) y = (1 - spawn) * (1 - spawn) * 3;
      m.inner.position.y = y;
      m.root.scale.setScalar(spawn < 1 ? 0.4 + 0.6 * spawn + Math.sin(spawn * Math.PI) * 0.15 : 1);
      if (a.attackT > 0) {
        a.attackT = Math.max(0, a.attackT - dt);
        const k = 1 - a.attackT / ATTACK_LEN;
        m.inner.position.z = Math.sin(k * Math.PI) * 0.18 * Math.min(card.look.scale, 1.6);
      } else {
        m.inner.position.z = 0;
      }
    }

    if (roller) {
      const k = (time % 2.4) / 2.4;
      const z = Math.sin(k * Math.PI * 2) * 1.1;
      const prevZ = roller.position.z;
      roller.position.z = z;
      const spin = roller.getObjectByName("spin");
      const face = roller.getObjectByName("face") as THREE.Sprite | undefined;
      const dz = z - prevZ;
      if (spin) spin.rotation.x += dz / 0.55;
      if (face) face.material.rotation += dz / 0.55;
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
        if (s.back?.model.prop) s.back.model.prop.visible = true;
        turntable.remove(s.obj);
        shots.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    },
  };
}
