import * as THREE from "three";
import type { CardDef } from "../../../shared/cards";
import type { TowerKind } from "../../../shared/constants";
import { headTexture, noiseTexture, textTexture } from "./textures";
import { instantiateGlb } from "./glb";

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

let stoneTex: THREE.Texture | null = null;
function stone(): THREE.Texture {
  stoneTex ??= noiseTexture("#a39c8f", ["#8f897d", "#b5aea1", "#7f796f", "#c2bbae"], 128, 1400, 33);
  return stoneTex;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

export class Bar {
  group = new THREE.Group();
  private fill: THREE.Mesh;
  private fillMat: THREE.MeshBasicMaterial;
  private width: number;
  private label: THREE.Sprite | null = null;
  private lastText = "";

  constructor(width: number, color: number, withLabel = false) {
    this.width = width;
    const h = Math.max(0.12, width * 0.11);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.08, h + 0.08),
      new THREE.MeshBasicMaterial({ color: 0x0b0f1f, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    bg.renderOrder = 20;
    this.group.add(bg);
    const geo = new THREE.PlaneGeometry(1, h);
    geo.translate(0.5, 0, 0);
    this.fillMat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    this.fill = new THREE.Mesh(geo, this.fillMat);
    this.fill.position.x = -width / 2;
    this.fill.scale.x = width;
    this.fill.renderOrder = 21;
    this.group.add(this.fill);
    if (withLabel) {
      const tex = textTexture("", { width: 256, height: 64 });
      this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      this.label.scale.set(width * 0.95, width * 0.24, 1);
      this.label.position.y = h + width * 0.17;
      this.label.renderOrder = 22;
      this.group.add(this.label);
    }
  }

  set(frac: number, text?: string) {
    this.fill.scale.x = Math.max(0.0001, Math.min(1, frac)) * this.width;
    if (this.label && text !== undefined && text !== this.lastText) {
      this.lastText = text;
      const old = this.label.material.map;
      this.label.material.map = textTexture(text, { width: 256, height: 64, color: "#fff", stroke: "#0b0f1f" });
      this.label.material.needsUpdate = true;
      old?.dispose();
    }
  }

  setColor(color: number) {
    this.fillMat.color.setHex(color);
  }
}

export interface TowerModel {
  group: THREE.Group;
  intact: THREE.Group;
  rubble: THREE.Group;
  turret: THREE.Object3D;
  height: number;
  destroyed: boolean;
  setDestroyed(): void;
  restore(): void;
}

export function createTowerModel(kind: TowerKind, color: number, facing: number): TowerModel {
  const group = new THREE.Group();
  const intact = new THREE.Group();
  group.add(intact);
  const stoneMat = mat(0xffffff, { map: stone(), flatShading: true });
  const stoneLight = mat(0xd8d0c2, { flatShading: true });
  const teamMat = mat(color, { roughness: 0.5 });
  const gold = mat(0xf2c14e, { metalness: 0.5, roughness: 0.35 });
  const dark = mat(0x2b2b33, { metalness: 0.6, roughness: 0.4 });
  let height: number;
  const turret = new THREE.Group();

  if (kind === "princess") {
    height = 4.4;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.55, 2.7, 8), stoneMat);
    base.position.y = 1.35;
    intact.add(base);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.28, 8), teamMat);
    band.position.y = 2.3;
    intact.add(band);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.4, 0.5, 8), stoneLight);
    top.position.y = 2.95;
    intact.add(top);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.32), stoneLight);
      m.position.set(Math.cos(a) * 1.42, 3.4, Math.sin(a) * 1.42);
      m.rotation.y = -a;
      intact.add(m);
    }
    const guard = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.35, 4, 8), teamMat);
    body.position.y = 0.45;
    guard.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(0xf1c7a0));
    head.position.y = 1.05;
    guard.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 8), teamMat);
    hat.position.y = 1.36;
    guard.add(hat);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 16, Math.PI), mat(0x6b4423));
    bow.position.set(0, 0.6, 0.32);
    bow.rotation.z = Math.PI / 2;
    guard.add(bow);
    guard.position.y = 3.15;
    turret.add(guard);
    intact.add(turret);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), dark);
    pole.position.set(-1.1, 4.0, -0.6);
    intact.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), mat(color, { side: THREE.DoubleSide }));
    flag.position.set(-0.75, 4.55, -0.6);
    intact.add(flag);
  } else {
    height = 5.6;
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.3, 3.0, 3.3), stoneMat);
    base.position.y = 1.5;
    intact.add(base);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 3.8, 8), stoneLight);
        p.position.set(sx * 1.65, 1.9, sz * 1.65);
        intact.add(p);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.95, 8), teamMat);
        cap.position.set(sx * 1.65, 4.25, sz * 1.65);
        intact.add(cap);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), gold);
        ball.position.set(sx * 1.65, 4.8, sz * 1.65);
        intact.add(ball);
      }
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.32, 3.42), teamMat);
    band.position.y = 2.6;
    intact.add(band);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 3.6), stoneLight);
    top.position.y = 3.15;
    intact.add(top);
    const emblemTex = textTexture("USMB", { width: 256, height: 96, color: "#ffcf3f", stroke: "#4a2a00" });
    for (const s of [-1, 1]) {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.08), teamMat);
      shield.position.set(0, 1.55, s * 1.68);
      intact.add(shield);
      const em = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: emblemTex, transparent: true }));
      em.position.set(0, 1.55, s * 1.73);
      if (s < 0) em.rotation.y = Math.PI;
      intact.add(em);
    }
    const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 10), dark);
    cbase.position.y = 0.25;
    turret.add(cbase);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.7, 12), dark);
    barrel.rotation.x = Math.PI / 2 - 0.25;
    barrel.position.set(0, 0.75, 0.6);
    turret.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 6, 14), gold);
    ring.position.set(0, 0.95, 1.35);
    ring.rotation.x = -0.25;
    turret.add(ring);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.32, 8, 1, true), gold);
    crown.position.set(0, 1.15, -0.25);
    turret.add(crown);
    turret.position.y = 3.35;
    intact.add(turret);
  }
  turret.rotation.y = facing;
  shadowed(intact);

  const rubble = new THREE.Group();
  const rubbleMat = mat(0x6f6a62, { flatShading: true });
  const charred = mat(0x3d3934, { flatShading: true });
  const stump = new THREE.Mesh(
    kind === "king" ? new THREE.BoxGeometry(3.3, 0.8, 3.3) : new THREE.CylinderGeometry(1.35, 1.55, 0.7, 8),
    charred,
  );
  stump.position.y = 0.35;
  rubble.add(stump);
  for (let i = 0; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.35, 0), rubbleMat);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * (kind === "king" ? 1.9 : 1.5);
    r.position.set(Math.cos(a) * d, 0.7 + Math.random() * 0.3, Math.sin(a) * d);
    r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rubble.add(r);
  }
  shadowed(rubble);
  rubble.visible = false;
  group.add(rubble);

  const model: TowerModel = {
    group, intact, rubble, turret, height, destroyed: false,
    setDestroyed() {
      if (model.destroyed) return;
      model.destroyed = true;
      intact.visible = false;
      rubble.visible = true;
    },
    restore() {
      model.destroyed = false;
      intact.visible = true;
      rubble.visible = false;
    },
  };
  return model;
}

export interface UnitModel {
  root: THREE.Group;
  inner: THREE.Group;
  head: THREE.Sprite;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  mats: THREE.MeshStandardMaterial[];
  cape?: THREE.Mesh;
  bulb?: THREE.Mesh;
  wheels?: THREE.Object3D[];
  height: number;
  barY: number;
  barW: number;
}

function trackMats(o: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const list: THREE.MeshStandardMaterial[] = [];
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material;
    if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) list.push(m as THREE.MeshStandardMaterial);
  });
  return list;
}

export function createUnitModel(card: CardDef, color: number): UnitModel {
  const glb = createGlbUnitModel(card, color);
  if (glb) return glb;
  if (card.look.building) return createBuildingModel(card, color);
  if (card.look.vehicle) return createVehicleModel(card, color);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const s = card.look.scale;
  const body = mat(card.look.body, { roughness: 0.7 });
  const pants = mat(0x23263a);
  const team = mat(color, { roughness: 0.45, emissive: color, emissiveIntensity: 0.15 });
  const skin = mat(0xe0b089);

  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.17, 0.46, 0.2);
    g.translate(0, -0.23, 0);
    const leg = new THREE.Mesh(g, pants);
    leg.position.set(sx * 0.12, 0.46, 0);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.28), mat(0xf2f2f2));
    shoe.position.set(0, -0.44, 0.04);
    leg.add(shoe);
    inner.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.3, 4, 10), body);
  torso.position.y = 0.78;
  if (card.id === "natis") torso.scale.set(1.3, 1, 1.15);
  inner.add(torso);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.06, 6, 18), team);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.6;
  if (card.id === "natis") belt.scale.set(1.3, 1.15, 1);
  inner.add(belt);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 16), team);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.03;
  inner.add(collar);

  const arms: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (card.id === "natis" ? 0.42 : 0.34), 0.98, 0);
    const g = new THREE.CapsuleGeometry(0.075, 0.3, 4, 8);
    g.translate(0, -0.2, 0);
    const arm = new THREE.Mesh(g, body);
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skin);
    hand.position.y = -0.42;
    pivot.add(hand);
    pivot.rotation.z = sx * 0.12;
    inner.add(pivot);
    arms.push(pivot);
  }
  const right = arms[1];
  if (card.look.weapon === "sword") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.03), mat(0xd9dde6, { metalness: 0.85, roughness: 0.25 }));
    blade.position.set(0, -0.42, 0.5);
    blade.rotation.x = Math.PI / 2;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.08), mat(card.look.accent));
    guard.position.set(0, -0.42, 0.05);
    right.add(blade, guard);
  } else if (card.look.weapon === "dagger") {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.38, 6), mat(0xd9dde6, { metalness: 0.85, roughness: 0.25 }));
    blade.position.set(0, -0.42, 0.22);
    blade.rotation.x = Math.PI / 2;
    right.add(blade);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 10, 1, true), mat(card.look.body, { side: THREE.DoubleSide }));
    hood.position.y = 1.72;
    inner.add(hood);
  } else if (card.look.weapon === "pickaxe") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), mat(0x7b4f2a));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.42, 0.38);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.08), mat(0x8a8f99, { metalness: 0.8, roughness: 0.3 }));
    pick.position.set(0, -0.42, 0.8);
    pick.rotation.z = 0;
    right.add(handle, pick);
  } else if (card.look.weapon === "orb") {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      mat(card.look.accent, { emissive: card.look.accent, emissiveIntensity: 2.4 }),
    );
    orb.position.set(0, -0.5, 0.12);
    right.add(orb);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    core.position.copy(orb.position);
    right.add(core);
  } else if (card.look.weapon === "finger") {
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      mat(card.look.accent, { emissive: card.look.accent, emissiveIntensity: 2 }),
    );
    tip.position.y = -0.55;
    right.add(tip);
    right.rotation.x = -1.2;
  }

  let cape: THREE.Mesh | undefined;
  if (card.look.cape) {
    const g = new THREE.PlaneGeometry(0.62, 0.85, 1, 4);
    g.translate(0, -0.42, 0);
    cape = new THREE.Mesh(g, mat(card.look.cape, { side: THREE.DoubleSide }));
    cape.position.set(0, 1.02, -0.24);
    cape.rotation.x = 0.18;
    inner.add(cape);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.12, 5), mat(0xffd400, { emissive: 0x553300 }));
    emblem.position.set(0, 0.85, 0.255);
    emblem.rotation.z = Math.PI;
    inner.add(emblem);
  }

  const headSize = card.id === "goutier" ? 1.05 : 1.0;
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(card.id, color), alphaTest: 0.5 }));
  head.scale.set(headSize, headSize, 1);
  head.position.y = 1.4;
  inner.add(head);

  shadowed(inner);
  const vs = s >= 3 ? s : s * 1.3;
  inner.scale.setScalar(vs);
  return {
    root, inner, head, legs, arms, mats: trackMats(inner), cape,
    height: 1.9 * vs, barY: 2.0 * vs + 0.15, barW: Math.min(2.4, 0.6 + vs * 0.45),
  };
}

function createGlbUnitModel(card: CardDef, color: number): UnitModel | null {
  const parts = instantiateGlb(card.id, color);
  if (!parts) return null;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  inner.add(parts.scene);
  const fixed = card.look.building || card.look.vehicle;
  const headSize = card.look.building ? 1.25 : card.look.vehicle ? 1.15 : card.id === "goutier" ? 1.05 : 1.0;
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(card.id, color), alphaTest: 0.5 }));
  head.scale.set(headSize, headSize, 1);
  head.position.copy(parts.headPos);
  inner.add(head);
  const s = card.look.scale;
  const vs = fixed ? 1 : s >= 3 ? s : s * 1.3;
  inner.scale.setScalar(vs);
  const top = Math.max(parts.height, parts.headPos.y + headSize / 2);
  return {
    root, inner, head, legs: parts.legs, arms: parts.arms, mats: trackMats(inner), cape: parts.cape,
    bulb: parts.bulb, wheels: parts.wheels.length ? parts.wheels : undefined,
    height: top * vs, barY: (top + 0.15) * vs + 0.15,
    barW: card.look.building ? 1.6 : card.look.vehicle ? 1.7 : Math.min(2.4, 0.6 + vs * 0.45),
  };
}

function createVehicleModel(card: CardDef, color: number): UnitModel {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const paint = mat(card.look.body, { metalness: 0.55, roughness: 0.32 });
  const plastic = mat(0x26282c, { roughness: 0.9 });
  const glass = mat(0x1b2633, { metalness: 0.9, roughness: 0.08 });
  const chrome = mat(card.look.accent, { metalness: 0.9, roughness: 0.2 });
  const team = mat(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 2.9), paint);
  body.position.y = 0.8;
  inner.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.16, 0.9), paint);
  hood.position.set(0, 1.18, 0.95);
  hood.rotation.x = 0.12;
  inner.add(hood);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.26, 3.0), plastic);
  skirt.position.y = 0.48;
  inner.add(skirt);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.62, 1.75), glass);
  cabin.position.set(0, 1.45, -0.25);
  inner.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.8), paint);
  roof.position.set(0, 1.79, -0.25);
  inner.add(roof);
  for (const sx of [-0.55, 0.55]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 1.6), chrome);
    rail.position.set(sx, 1.88, -0.25);
    inner.add(rail);
  }
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 2.6), team);
    stripe.position.set(sx * 0.765, 0.88, 0);
    inner.add(stripe);
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.6), chrome);
    step.position.set(sx * 0.82, 0.36, -0.1);
    inner.add(step);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.08), paint);
    mirror.position.set(sx * 0.82, 1.3, 0.55);
    inner.add(mirror);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.06), chrome);
  grille.position.set(0, 0.88, 1.46);
  inner.add(grille);
  const lightMat = mat(0xffffff, { emissive: 0xfff4d0, emissiveIntensity: 1.6 });
  const tailMat = mat(0xff2a2a, { emissive: 0xff2a2a, emissiveIntensity: 1.2 });
  for (const sx of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), lightMat);
    hl.position.set(sx, 0.98, 1.46);
    inner.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.06), tailMat);
    tl.position.set(sx * 1.15, 0.95, -1.46);
    inner.add(tl);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.04), mat(0xf4f4f4));
  plate.position.set(0, 0.55, 1.51);
  inner.add(plate);
  const wheels: THREE.Object3D[] = [];
  const tire = mat(0x141414, { roughness: 0.95 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), tire);
      t.rotation.z = Math.PI / 2;
      wheel.add(t);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 8), chrome);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);
      wheel.position.set(sx * 0.74, 0.38, sz * 0.98);
      inner.add(wheel);
      wheels.push(wheel);
    }
  }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(card.id, color), alphaTest: 0.5 }));
  head.scale.set(1.15, 1.15, 1);
  head.position.set(0, 2.45, -0.3);
  inner.add(head);
  shadowed(inner);
  return {
    root, inner, head, legs: [], arms: [], mats: trackMats(inner), wheels,
    height: 2.2, barY: 3.25, barW: 1.7,
  };
}

function createBuildingModel(card: CardDef, color: number): UnitModel {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const brick = mat(card.look.body, { flatShading: true });
  const team = mat(color, { roughness: 0.5 });
  const wood = mat(0x6b4423);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), brick);
  base.position.y = 0.65;
  inner.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), team);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.75;
  inner.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.05), wood);
  door.position.set(0, 0.38, 0.86);
  inner.add(door);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.05), mat(0xffe9a8, { emissive: 0xffd36b, emissiveIntensity: 0.5 }));
    win.position.set(sx * 0.5, 0.85, 0.86);
    inner.add(win);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.34),
    new THREE.MeshBasicMaterial({ map: textTexture("QG", { width: 256, height: 64, color: "#ffcf3f", bg: "#23263a" }), transparent: true }),
  );
  sign.position.set(0, 1.18, 0.88);
  inner.add(sign);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), wood);
  pole.position.y = 2.4;
  inner.add(pole);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    mat(0xfff3a0, { emissive: 0xffd400, emissiveIntensity: 0.6 }),
  );
  bulb.position.set(0.75, 3.4, 0);
  inner.add(bulb);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(card.id, color), alphaTest: 0.5 }));
  head.scale.set(1.25, 1.25, 1);
  head.position.y = 3.0;
  inner.add(head);
  shadowed(inner);
  return {
    root, inner, head, legs: [], arms: [], mats: trackMats(inner), bulb,
    height: 3.4, barY: 3.85, barW: 1.6,
  };
}

export function createProjectileModel(kind: string, color: number): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === "arrow") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5), mat(0x7b4f2a));
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 5), mat(0xcccccc, { metalness: 0.7 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.44;
    g.add(tip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.14), mat(color));
    fl.position.z = -0.32;
    g.add(fl);
  } else if (kind === "cannon") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0x22222a, { metalness: 0.7, roughness: 0.3 })));
  } else if (kind === "fireball") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff8a2a })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })));
  } else if (kind === "finger" || kind === "idea") {
    const c = kind === "finger" ? 0xffd54a : 0xfff3a0;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: c })));
  } else if (kind === "dig") {
    const dirtMat = mat(0x6b4a2c, { flatShading: true });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dirtMat);
    mound.scale.y = 0.6;
    g.add(mound);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.08, 0), mat(0x8a6a44, { flatShading: true }));
      const a = (i / 5) * Math.PI * 2;
      r.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
      g.add(r);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
  } else if (kind === "barrel") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.75), mat(0xc4975a));
    g.add(box);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.62, 0.16), mat(0xd4af37, { metalness: 0.3 }));
    g.add(tape);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.77), mat(color));
    g.add(ribbon);
  }
  shadowed(g);
  return g;
}
