import * as THREE from "three";
import { ARENA_H, ARENA_W, BRIDGES_X, RIVER_Y, towerLayout } from "../../../shared/constants";
import { fieldTexture, glowTexture, mulberry, noiseTexture, textTexture, windowsTexture } from "./textures";
import type { Theme } from "./themes";

export function toWorld(x: number, y: number, h = 0): THREE.Vector3 {
  return new THREE.Vector3(x - ARENA_W / 2, h, ARENA_H / 2 - y);
}

export function toArena(v: THREE.Vector3): { x: number; y: number } {
  return { x: v.x + ARENA_W / 2, y: ARENA_H / 2 - v.z };
}

const waterVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 0.9 + uTime * 1.6) * 0.04 + cos(p.y * 2.0 + uTime * 1.1) * 0.03;
    vPos = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;

const waterFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform float uLava;
  void main() {
    float edge = min(vUv.y, 1.0 - vUv.y);
    float speed = mix(1.0, 0.35, uLava);
    vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 0.5, 1.0 - edge * 2.0) * 0.6);
    float waves = sin(vPos.x * 2.2 - uTime * 2.4 * speed + sin(vPos.z * 3.0) * 1.5);
    waves += sin(vPos.x * 3.7 + uTime * 1.3 * speed + vPos.z * 4.0) * 0.6;
    float streak = smoothstep(1.15, 1.55, waves);
    col += streak * mix(0.22, 0.45, uLava) * mix(vec3(1.0), uShallow, uLava);
    float crust = uLava * smoothstep(0.55, 0.9, sin(vPos.x * 1.3 + uTime * 0.4) * sin(vPos.z * 5.0 - uTime * 0.3 + vPos.x));
    col = mix(col, vec3(0.18, 0.06, 0.03), crust * 0.7);
    float foam = smoothstep(0.12, 0.0, edge) * (0.6 + 0.4 * sin(vPos.x * 6.0 + uTime * 3.0 * speed));
    col = mix(col, uFoam, foam * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface Arena {
  group: THREE.Group;
  update(t: number, dt: number): void;
}

function stdMat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function shadow<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

const HW = ARENA_W / 2 + 0.3;
const HH = ARENA_H / 2 + 0.3;

const BUILDING_SLOTS: [number, number, number][] = [
  [-20, -9, Math.PI / 2],
  [20, 9, -Math.PI / 2],
  [-20, 9, Math.PI / 2],
  [20, -9, -Math.PI / 2],
];

function inBuildingSlot(x: number, z: number): boolean {
  return Math.abs(x) > 13 && Math.abs(x) < 27 && Math.abs(z) > 3.5 && Math.abs(z) < 15;
}

export function buildArena(theme: Theme, mode: "1v1" | "2v2" = "1v1"): Arena {
  const group = new THREE.Group();
  const animated: ((t: number, dt: number) => void)[] = [];
  const rnd = mulberry(42);

  const grassTex = noiseTexture(theme.outer.base, theme.outer.dots, 256, 3000, 11);
  grassTex.repeat.set(30, 30);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), stdMat(0xffffff, { map: grassTex }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.45;
  outer.receiveShadow = true;
  group.add(outer);

  const toPx = (x: number, y: number, yMax: number, px: number) => [x * px, (yMax - y) * px] as const;
  const drawPaths = (yMin: number, yMax: number) => (g: CanvasRenderingContext2D, px: number) => {
    const own = yMin < RIVER_Y;
    const ty = (y: number) => (own ? y : ARENA_H - y);
    for (const def of towerLayout(mode)) {
      const [cx, cy] = toPx(def.x, ty(def.y), yMax, px);
      g.fillStyle = theme.pads;
      g.beginPath();
      g.arc(cx, cy, (def.radius + 0.9) * px, 0, Math.PI * 2);
      g.fill();
    }
    g.lineCap = "round";
    g.lineJoin = "round";
    const path = () => {
      g.beginPath();
      for (const bx of BRIDGES_X) {
        const [x0, y0] = toPx(bx, ty(RIVER_Y - 1), yMax, px);
        const [x1, y1] = toPx(bx, ty(5), yMax, px);
        const [x2, y2] = toPx(ARENA_W / 2, ty(2.6), yMax, px);
        const [qx, qy] = toPx(bx, ty(2.6), yMax, px);
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.quadraticCurveTo(qx, qy, x2, y2);
      }
      g.stroke();
    };
    g.strokeStyle = theme.pathEdge;
    g.lineWidth = 1.9 * px;
    path();
    g.strokeStyle = theme.path;
    g.lineWidth = 1.5 * px;
    path();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 0.5 * px;
    path();
  };

  const dirt = stdMat(theme.dirt);
  const halfDepth = RIVER_Y - 1;
  for (const own of [true, false]) {
    const yMin = own ? 0 : RIVER_Y + 1;
    const yMax = own ? halfDepth : ARENA_H;
    const tex = fieldTexture(ARENA_W, halfDepth, theme.field, drawPaths(yMin, yMax));
    const top = stdMat(0xffffff, { map: tex, roughness: 0.95 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(ARENA_W, 0.5, halfDepth), [dirt, dirt, top, dirt, dirt, dirt]);
    const c = toWorld(ARENA_W / 2, (yMin + yMax) / 2);
    box.position.set(c.x, -0.25, c.z);
    box.receiveShadow = true;
    group.add(box);
  }

  const w = theme.water;
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Vector3(...w.deep) },
      uShallow: { value: new THREE.Vector3(...w.shallow) },
      uFoam: { value: new THREE.Vector3(...w.foam) },
      uLava: { value: w.lava },
    },
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 2, 180, 4), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.32, 0);
  group.add(water);
  animated.push((t) => (waterMat.uniforms.uTime.value = t));
  if (w.lava) {
    const glow = new THREE.PointLight(0xff6a1a, 18, 14, 1.6);
    glow.position.set(0, 1.2, 0);
    group.add(glow);
    animated.push((t) => (glow.intensity = 16 + Math.sin(t * 3) * 3));
  }

  const bankMat = stdMat(theme.bank);
  for (const side of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 0.6), bankMat);
      bank.position.set(sx * (ARENA_W / 2 + 20.5), -0.3, side * 1.3);
      bank.receiveShadow = true;
      group.add(bank);
    }
  }

  const plankTex = (() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 256;
    const g = c.getContext("2d")!;
    const r = mulberry(5);
    for (let i = 0; i < 8; i++) {
      const shade = 150 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${shade},${Math.floor(shade * 0.66)},${Math.floor(shade * 0.38)})`;
      g.fillRect(0, i * 32, 128, 30);
      g.fillStyle = "rgba(60,30,10,0.6)";
      g.fillRect(0, i * 32 + 30, 128, 2);
      g.fillStyle = "rgba(40,20,5,0.8)";
      g.fillRect(10, i * 32 + 13, 4, 4);
      g.fillRect(114, i * 32 + 13, 4, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const deckMat = stdMat(0xffffff, { map: plankTex });
  const woodMat = stdMat(0x7b4f2a);
  for (const bx of BRIDGES_X) {
    const p = toWorld(bx, RIVER_Y);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 3.6), deckMat);
    deck.position.set(p.x, -0.1, p.z);
    group.add(shadow(deck));
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 3.6), woodMat);
      rail.position.set(p.x + s * 1.15, 0.45, p.z);
      group.add(shadow(rail));
      for (const z of [-1.6, 0, 1.6]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), woodMat);
        post.position.set(p.x + s * 1.15, 0.2, p.z + z);
        group.add(shadow(post));
      }
    }
  }

  const stoneTex = noiseTexture(theme.stone.base, theme.stone.dots, 128, 900, 21);
  const stone = stdMat(0xffffff, { map: stoneTex });
  const stoneCap = stdMat(theme.wallCap, theme.decor === "party" ? { emissive: theme.wallCap, emissiveIntensity: 0.6 } : {});
  const wallH = 0.7;
  const addWall = (x: number, z: number, wd: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, wallH, d), stone);
    m.position.set(x, wallH / 2 - 0.05, z);
    group.add(shadow(m));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.1, 0.12, d + 0.1), stoneCap);
    cap.position.set(x, wallH, z);
    group.add(shadow(cap));
  };
  const segLen = HH - 1.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addWall(sx * HW, sz * (1.2 + segLen / 2), 0.6, segLen);
  for (const sz of [-1, 1]) addWall(0, sz * HH, ARENA_W + 1.2, 0.6);
  const pillarMat = stdMat(theme.pillar);
  const pillarTop = stdMat(theme.pillarTop, {
    metalness: 0.3, roughness: 0.4,
    ...(theme.decor === "party" || theme.decor === "volcano" ? { emissive: theme.pillarTop, emissiveIntensity: 1.2 } : {}),
  });
  for (const sx of [-1, 1]) {
    for (const z of [-HH, -HH / 2, -1.2, 1.2, HH / 2, HH]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.85), pillarMat);
      m.position.set(sx * HW, 0.55, z);
      group.add(shadow(m));
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), pillarTop);
      top.position.set(sx * HW, 1.38, z);
      group.add(shadow(top));
    }
  }

  const leaves = theme.leaves.map((c) => stdMat(c, { flatShading: true }));
  const trunk = stdMat(theme.trunk);
  const snowMat = stdMat(0xffffff, { flatShading: true });
  const rockMat = stdMat(theme.decor === "volcano" ? 0x3a2e2b : theme.decor === "mountain" ? 0x8f99a3 : 0x8d8a84, { flatShading: true });

  const pine = (x: number, z: number, s: number, snowy: boolean) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), trunk);
    tr.position.y = 0.6;
    t.add(tr);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.28, 1.4, 7), leaves[Math.floor(rnd() * leaves.length)]);
      cone.position.y = 1.4 + i * 0.75;
      cone.rotation.y = rnd() * Math.PI;
      t.add(cone);
      if (snowy) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75 - i * 0.18, 0.55, 7), snowMat);
        cap.position.y = 1.85 + i * 0.75;
        cap.rotation.y = cone.rotation.y;
        t.add(cap);
      }
    }
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    group.add(shadow(t));
  };
  const roundTree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6), trunk);
    tr.position.y = 0.55;
    t.add(tr);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), leaves[Math.floor(rnd() * leaves.length)]);
    crown.position.y = 1.7;
    t.add(crown);
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    group.add(shadow(t));
  };
  const palm = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const lean = (rnd() - 0.5) * 0.5;
    let top = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, 0.6, 6), trunk);
      seg.position.set(lean * i * 0.6, 0.3 + i * 0.55, 0);
      seg.rotation.z = -lean * 0.6;
      t.add(seg);
      top = seg.position.clone();
    }
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.0, 4), leaves[i % leaves.length]);
      leaf.scale.set(1, 1, 0.25);
      const a = (i / 7) * Math.PI * 2;
      leaf.position.set(top.x + Math.cos(a) * 0.8, top.y + 0.2, Math.sin(a) * 0.8);
      leaf.rotation.set(0, -a, Math.PI / 2 + 0.45);
      leaf.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0);
      t.add(leaf);
    }
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), stdMat(0x5a3d1e));
    coco.position.set(top.x, top.y - 0.1, 0.12);
    t.add(coco);
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    t.rotation.y = rnd() * Math.PI * 2;
    group.add(shadow(t));
  };
  const deadTree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 2.2, 5), trunk);
    tr.position.y = 1.1;
    t.add(tr);
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 4), trunk);
      br.position.set(0, 1.3 + i * 0.35, 0);
      br.rotation.set(0, (i / 3) * Math.PI * 2, 0.9);
      br.translateY(0.4);
      t.add(br);
    }
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    group.add(shadow(t));
  };
  const rock = (x: number, z: number, s: number) => {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    r.position.set(x, -0.35, z);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    group.add(shadow(r));
  };

  const scatter = (count: number, fn: (x: number, z: number) => void, radius = 80) => {
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * radius;
      const z = (rnd() - 0.5) * radius;
      if (Math.abs(x) < HW + 1.6 && Math.abs(z) < HH + 1.6) continue;
      if (Math.abs(z) < 2.2) continue;
      if (inBuildingSlot(x, z)) continue;
      fn(x, z);
    }
  };

  const banner = textTexture("USMB ARENA", { width: 1024, height: 160, color: theme.banner.color, stroke: theme.banner.stroke, bg: theme.banner.bg });
  for (const sz of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshStandardMaterial({ map: banner, roughness: 0.6, emissive: theme.decor === "party" ? 0xffffff : 0x000000, emissiveMap: theme.decor === "party" ? banner : null, emissiveIntensity: 0.6 }));
    board.position.set(0, 2.2, sz * (HH + 2.2));
    board.rotation.y = sz > 0 ? Math.PI : 0;
    group.add(board);
    const backBoard = new THREE.Mesh(new THREE.BoxGeometry(12.3, 2.2, 0.15), stdMat(0x2b3a72));
    backBoard.position.set(0, 2.2, sz * (HH + 2.2) + sz * 0.1);
    group.add(backBoard);
    for (const px of [-5.5, 5.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), stdMat(0x3a3a3a, { metalness: 0.5 }));
      post.position.set(px, 1.2, sz * (HH + 2.35));
      group.add(shadow(post));
    }
  }

  const flags: THREE.Mesh[] = [];
  let fi = 0;
  for (const sx of [-1, 1]) {
    for (const z of [-HH / 2, HH / 2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), stdMat(0xdddddd, { metalness: 0.6 }));
      pole.position.set(sx * (HW + 0.9), 1.0, z);
      group.add(pole);
      const flagGeo = new THREE.PlaneGeometry(1.2, 0.7, 8, 2);
      flagGeo.translate(0.6, 0, 0);
      const flag = new THREE.Mesh(flagGeo, stdMat(theme.flags[fi++ % theme.flags.length], { side: THREE.DoubleSide }));
      flag.position.set(sx * (HW + 0.9), 2.2, z);
      flag.castShadow = true;
      flag.userData.base = (flagGeo.attributes.position.array as Float32Array).slice();
      group.add(flag);
      flags.push(flag);
    }
  }
  animated.push((t) => {
    for (const [i, f] of flags.entries()) {
      const pos = f.geometry.attributes.position as THREE.BufferAttribute;
      const b = f.userData.base as Float32Array;
      for (let v = 0; v < pos.count; v++) pos.setZ(v, Math.sin(b[v * 3] * 3 - t * 5 + i) * 0.12 * b[v * 3]);
      pos.needsUpdate = true;
    }
  });

  switch (theme.decor) {
    case "campus":
      scatter(140, (x, z) => (rnd() < 0.55 ? pine(x, z, 0.7 + rnd() * 0.7, false) : roundTree(x, z, 0.7 + rnd() * 0.7)));
      scatter(40, (x, z) => rock(x, z, 0.3 + rnd() * 0.5), 60);
      campusBuildings(group);
      break;
    case "beach":
      scatter(70, (x, z) => (rnd() < 0.7 ? palm(x, z, 0.8 + rnd() * 0.5) : roundTree(x, z, 0.6 + rnd() * 0.4)));
      scatter(25, (x, z) => rock(x, z, 0.25 + rnd() * 0.35), 60);
      beachDecor(group, rnd);
      break;
    case "mountain":
      scatter(160, (x, z) => pine(x, z, 0.7 + rnd() * 0.8, true));
      scatter(40, (x, z) => rock(x, z, 0.4 + rnd() * 0.6), 70);
      mountainDecor(group, rnd);
      break;
    case "party":
      scatter(40, (x, z) => roundTree(x, z, 0.7 + rnd() * 0.5));
      partyDecor(group, animated);
      break;
    case "volcano":
      scatter(45, (x, z) => deadTree(x, z, 0.8 + rnd() * 0.6));
      scatter(80, (x, z) => rock(x, z, 0.3 + rnd() * 0.8), 70);
      volcanoDecor(group, animated, rnd);
      break;
  }

  addParticles(group, animated, theme);

  return {
    group,
    update(t: number, dt: number) {
      for (const f of animated) f(t, dt);
    },
  };
}

function building(group: THREE.Group, x: number, z: number, w: number, h: number, d: number, label: string, rotY: number, trimColor = 0x2a6fb0) {
  const b = new THREE.Group();
  const wallTex = windowsTexture(Math.round(w * 1.5), Math.round(h * 1.2), "#e8e2d6", "#5f86b8");
  const sideTex = windowsTexture(Math.round(d * 1.5), Math.round(h * 1.2), "#ddd6c8", "#5f86b8");
  const wall = stdMat(0xffffff, { map: wallTex });
  const side = stdMat(0xffffff, { map: sideTex });
  const roof = stdMat(0x5b6474);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, wall, wall]);
  body.position.y = h / 2 - 0.45;
  b.add(body);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), stdMat(trimColor));
  trim.position.y = h - 0.62;
  b.add(trim);
  const hex = `#${trimColor.toString(16).padStart(6, "0")}`;
  const signTex = textTexture(label, { width: 512, height: 96, color: "#ffffff", bg: hex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.13), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  sign.position.set(0, h * 0.82 - 0.45, d / 2 + 0.02);
  b.add(sign);
  const back = sign.clone();
  back.position.z = -d / 2 - 0.02;
  back.rotation.y = Math.PI;
  b.add(back);
  b.position.set(x, 0, z);
  b.rotation.y = rotY;
  group.add(shadow(b));
}

function campusBuildings(group: THREE.Group) {
  const labels = ["IUT · BÂTIMENT A", "IUT · BÂTIMENT B", "BIBLIOTHÈQUE", "RESTO U"];
  const sizes: [number, number, number][] = [[10, 5, 6], [10, 5, 6], [8, 4, 6], [8, 6, 6]];
  BUILDING_SLOTS.forEach(([x, z, r], i) => building(group, x, z, sizes[i][0], sizes[i][1], sizes[i][2], labels[i], r));
}

function beachDecor(group: THREE.Group, rnd: () => number) {
  const stripes = [0xff7a59, 0x3cc2d6, 0xffd23f, 0x7ad46a];
  BUILDING_SLOTS.forEach(([x, z, r], i) => {
    const hut = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 3.6), stdMat(0xf4ecd8));
    body.position.y = 0.75;
    hut.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.6, 4), stdMat(stripes[i]));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.8);
    roof.position.y = 2.75;
    hut.add(roof);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.7),
      new THREE.MeshBasicMaterial({ map: textTexture(["GLACES", "SURF CLUB", "BUVETTE", "BDE PLAGE"][i], { width: 512, height: 96, color: "#ffffff", bg: "#0e7fa0" }), transparent: true }),
    );
    sign.position.set(0, 1.5, 1.82);
    hut.add(sign);
    hut.position.set(x, -0.45, z);
    hut.rotation.y = r;
    group.add(shadow(hut));
  });
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 60;
    const z = (rnd() - 0.5) * 60;
    if (Math.abs(x) < HW + 2 && Math.abs(z) < HH + 2) continue;
    if (Math.abs(z) < 2.5 || inBuildingSlot(x, z)) continue;
    const p = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), stdMat(0xffffff));
    pole.position.y = 1.1;
    p.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 8), stdMat(stripes[i % stripes.length], { side: THREE.DoubleSide }));
    top.position.y = 2.2;
    p.add(top);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.6), stdMat(stripes[(i + 1) % stripes.length]));
    towel.position.set(0.9, 0.02, 0);
    p.add(towel);
    p.position.set(x, -0.45, z);
    p.rotation.y = rnd() * Math.PI;
    group.add(shadow(p));
  }
}

function mountainDecor(group: THREE.Group, rnd: () => number) {
  const rockM = stdMat(0x7b8794, { flatShading: true });
  const snow = stdMat(0xffffff, { flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
    const dist = 70 + rnd() * 20;
    const h = 22 + rnd() * 22;
    const r = 14 + rnd() * 10;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), rockM);
    m.position.set(Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist);
    m.rotation.y = rnd() * Math.PI;
    group.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), snow);
    cap.position.set(m.position.x, h - 1 - h * 0.19 + 0.2, m.position.z);
    cap.rotation.y = m.rotation.y;
    group.add(cap);
  }
  const labels = ["CHALET DES RÉVISIONS", "LOCATION DE SKIS", "REFUGE", "TÉLÉSIÈGE"];
  BUILDING_SLOTS.forEach(([x, z, r], i) => {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4.5), stdMat(0x8a5a35));
    body.position.y = 1.05;
    c.add(body);
    const roofGeo = new THREE.CylinderGeometry(0.01, 3.9, 2.2, 4, 1);
    const roof = new THREE.Mesh(roofGeo, stdMat(0xffffff));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.2, 1, 0.9);
    roof.position.y = 3.65;
    c.add(roof);
    for (const sx of [-1.6, 1.6]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.05), stdMat(0xffe9a8, { emissive: 0xffc96b, emissiveIntensity: 0.6 }));
      win.position.set(sx, 1.3, 2.27);
      c.add(win);
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.6),
      new THREE.MeshBasicMaterial({ map: textTexture(labels[i], { width: 512, height: 72, color: "#ffffff", bg: "#5b3a22" }), transparent: true }),
    );
    sign.position.set(0, 2.25, 2.28);
    c.add(sign);
    c.position.set(x, -0.45, z);
    c.rotation.y = r;
    group.add(shadow(c));
  });
}

function partyDecor(group: THREE.Group, animated: ((t: number, dt: number) => void)[]) {
  const neon = [0xff4df0, 0x4dfcff, 0xfff04d, 0x8a4dff];
  const stage = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 6), stdMat(0x1a1a24));
  floor.position.y = 0.05;
  stage.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.3), stdMat(0x111118));
  back.position.set(0, 3, -2.9);
  stage.add(back);
  const screenTex = textTexture("SOIRÉE BDE", { width: 1024, height: 256, color: "#ff4df0", stroke: "#2a0030", bg: "#120c2a" });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 3.4, -2.7);
  stage.add(screen);
  for (const sx of [-4.2, 4.2]) {
    const spk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 1.1), stdMat(0x0d0d10));
    spk.position.set(sx, 1.8, -1.6);
    stage.add(spk);
    for (const y of [1.2, 2.3]) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), stdMat(0x333340, { emissive: 0x8a4dff, emissiveIntensity: 0.3 }));
      cone.position.set(sx, y, -1.04);
      stage.add(cone);
    }
  }
  stage.position.set(-21, -0.45, -8);
  stage.rotation.y = Math.PI / 2;
  group.add(shadow(stage));
  const stage2 = stage.clone();
  stage2.position.set(21, -0.45, 8);
  stage2.rotation.y = -Math.PI / 2;
  group.add(stage2);

  const beams: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  const spots: [number, number][] = [[-13, -12], [13, -12], [-13, 12], [13, 12]];
  spots.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), stdMat(0x222228, { metalness: 0.6 }));
    pole.position.set(x, 2, z);
    group.add(shadow(pole));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: neon[i] }));
    lamp.position.set(x, 4.6, z);
    group.add(lamp);
    const beamGeo = new THREE.ConeGeometry(2.2, 14, 20, 1, true);
    beamGeo.translate(0, -7, 0);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: neon[i], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.set(x, 4.6, z);
    group.add(beam);
    beams.push(beam);
    const light = new THREE.PointLight(neon[i], 30, 26, 1.5);
    light.position.set(x, 4, z);
    group.add(light);
    lights.push(light);
  });
  animated.push((t) => {
    beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.7;
      b.rotation.x = Math.cos(t * 0.7 + i) * 0.5;
    });
    lights.forEach((l, i) => (l.intensity = 22 + Math.sin(t * 4 + i * 2) * 10));
  });
}

function volcanoDecor(group: THREE.Group, animated: ((t: number, dt: number) => void)[], rnd: () => number) {
  const rockM = stdMat(0x2e2320, { flatShading: true });
  const make = (x: number, z: number, h: number, r: number) => {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r, h, 9, 1, true), rockM);
    v.position.set(x, h / 2 - 1, z);
    group.add(v);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(r * 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(x, h - 1.05, z);
    group.add(crater);
    const glow = new THREE.PointLight(0xff5a10, 60, 60, 1.3);
    glow.position.set(x, h + 1, z);
    group.add(glow);
    animated.push((t) => (glow.intensity = 50 + Math.sin(t * 2 + x) * 15));
  };
  make(-55, -70, 40, 28);
  make(60, -60, 30, 20);
  make(50, 70, 34, 24);
  make(-60, 60, 26, 18);
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 70;
    const z = (rnd() - 0.5) * 70;
    if (Math.abs(x) < HW + 3 && Math.abs(z) < HH + 3) continue;
    if (Math.abs(z) < 2.5) continue;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1 + rnd() * 2, 16), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, -0.43, z);
    group.add(pool);
  }
  BUILDING_SLOTS.forEach(([x, z]) => {
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2 + rnd() * 4, 7), stdMat(0x5a4d49, { flatShading: true }));
      col.position.set(x + (rnd() - 0.5) * 8, 0.5, z + (rnd() - 0.5) * 8);
      col.rotation.z = (rnd() - 0.5) * 0.4;
      group.add(shadow(col));
    }
  });
}

function addParticles(group: THREE.Group, animated: ((t: number, dt: number) => void)[], theme: Theme) {
  if (theme.particles === "none") return;
  const cfg = {
    snow: { n: 700, color: 0xffffff, size: 0.22, add: false },
    embers: { n: 260, color: 0xff8a2a, size: 0.25, add: true },
    fireflies: { n: 160, color: 0xfff58a, size: 0.32, add: true },
    leaves: { n: 50, color: 0x9bcf5a, size: 0.2, add: false },
  }[theme.particles];
  const pos = new Float32Array(cfg.n * 3);
  const seed = new Float32Array(cfg.n);
  for (let i = 0; i < cfg.n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: cfg.color, size: cfg.size, map: glowTexture(), transparent: true, depthWrite: false,
    blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  group.add(pts);
  const kind = theme.particles;
  animated.push((t, dt) => {
    for (let i = 0; i < cfg.n; i++) {
      const s = seed[i];
      let x = pos[i * 3];
      let y = pos[i * 3 + 1];
      let z = pos[i * 3 + 2];
      if (kind === "snow") {
        y -= dt * (1.2 + (s % 1) * 0.8);
        x += Math.sin(t + s) * dt * 0.4;
      } else if (kind === "embers") {
        y += dt * (1 + (s % 1.5));
        x += Math.sin(t * 2 + s) * dt * 0.5;
      } else if (kind === "fireflies") {
        x += Math.sin(t * 0.7 + s) * dt * 0.6;
        z += Math.cos(t * 0.6 + s * 1.3) * dt * 0.6;
        y = 1 + Math.abs(Math.sin(t * 0.4 + s)) * 6;
      } else {
        y -= dt * 0.6;
        x += Math.sin(t * 1.3 + s) * dt * 0.8;
      }
      if (y < -0.4) y = 18;
      if (y > 18) y = 0;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
