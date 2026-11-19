import * as THREE from "three";
import { ARENA_H, ARENA_W, BRIDGES_X, RIVER_Y, TOWER_LAYOUT } from "../../../shared/constants";
import { fieldTexture, mulberry, noiseTexture, textTexture, windowsTexture } from "./textures";

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
  void main() {
    float edge = min(vUv.y, 1.0 - vUv.y);
    vec3 deep = vec3(0.10, 0.42, 0.78);
    vec3 shallow = vec3(0.28, 0.72, 0.95);
    vec3 col = mix(deep, shallow, smoothstep(0.0, 0.5, 1.0 - edge * 2.0) * 0.6);
    float waves = sin(vPos.x * 2.2 - uTime * 2.4 + sin(vPos.z * 3.0) * 1.5);
    waves += sin(vPos.x * 3.7 + uTime * 1.3 + vPos.z * 4.0) * 0.6;
    float streak = smoothstep(1.15, 1.55, waves);
    col += streak * 0.22;
    float foam = smoothstep(0.12, 0.0, edge) * (0.6 + 0.4 * sin(vPos.x * 6.0 + uTime * 3.0));
    col = mix(col, vec3(0.92, 0.97, 1.0), foam * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface Arena {
  group: THREE.Group;
  update(t: number): void;
}

function stdMat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

export function buildArena(): Arena {
  const group = new THREE.Group();
  const animated: ((t: number) => void)[] = [];

  const grassTex = noiseTexture("#4f8f3a", ["#5a9c43", "#47823a", "#62a64a", "#3f7833"], 256, 3000, 11);
  grassTex.repeat.set(30, 30);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), stdMat(0xffffff, { map: grassTex }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.45;
  outer.receiveShadow = true;
  group.add(outer);

  const toPx = (x: number, y: number, yMax: number, px: number) => [x * px, (yMax - y) * px] as const;
  const drawPaths = (yMin: number, yMax: number) => (g: CanvasRenderingContext2D, px: number) => {
    const own = yMin < RIVER_Y;
    const ty = (y: number) => (own ? y : ARENA_H - y);
    for (const def of TOWER_LAYOUT) {
      const [cx, cy] = toPx(def.x, ty(def.y), yMax, px);
      g.fillStyle = "rgba(150,140,120,0.55)";
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
    g.strokeStyle = "rgba(120,90,50,0.45)";
    g.lineWidth = 1.9 * px;
    path();
    g.strokeStyle = "#d9bf86";
    g.lineWidth = 1.5 * px;
    path();
    g.strokeStyle = "rgba(255,240,200,0.25)";
    g.lineWidth = 0.5 * px;
    path();
  };

  const dirt = stdMat(0x7a5634);
  const halfDepth = RIVER_Y - 1;
  for (const own of [true, false]) {
    const yMin = own ? 0 : RIVER_Y + 1;
    const yMax = own ? halfDepth : ARENA_H;
    const tex = fieldTexture(ARENA_W, halfDepth, drawPaths(yMin, yMax));
    const top = stdMat(0xffffff, { map: tex, roughness: 0.95 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(ARENA_W, 0.5, halfDepth), [dirt, dirt, top, dirt, dirt, dirt]);
    const c = toWorld(ARENA_W / 2, (yMin + yMax) / 2);
    box.position.set(c.x, -0.25, c.z);
    box.receiveShadow = true;
    group.add(box);
  }

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: { uTime: { value: 0 } },
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 2, 180, 4), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.32, 0);
  group.add(water);
  animated.push((t) => (waterMat.uniforms.uTime.value = t));

  const bankMat = stdMat(0x6b4a2c);
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
    const rnd = mulberry(5);
    for (let i = 0; i < 8; i++) {
      const shade = 150 + Math.floor(rnd() * 40);
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
    deck.receiveShadow = true;
    deck.castShadow = true;
    group.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 3.6), woodMat);
      rail.position.set(p.x + s * 1.15, 0.45, p.z);
      rail.castShadow = true;
      group.add(rail);
      for (const z of [-1.6, 0, 1.6]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), woodMat);
        post.position.set(p.x + s * 1.15, 0.2, p.z + z);
        post.castShadow = true;
        group.add(post);
      }
    }
  }

  const stoneTex = noiseTexture("#9b9488", ["#8a8377", "#aaa397", "#7d776c", "#b4ada0"], 128, 900, 21);
  const stone = stdMat(0xffffff, { map: stoneTex });
  const stoneCap = stdMat(0xb9b2a5);
  const wallH = 0.7;
  const addWall = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), stone);
    m.position.set(x, wallH / 2 - 0.05, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), stoneCap);
    cap.position.set(x, wallH, z);
    cap.castShadow = true;
    group.add(cap);
  };
  const hw = ARENA_W / 2 + 0.3;
  const hh = ARENA_H / 2 + 0.3;
  const segLen = hh - 1.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addWall(sx * hw, sz * (1.2 + segLen / 2), 0.6, segLen);
    }
  }
  for (const sz of [-1, 1]) addWall(0, sz * hh, ARENA_W + 1.2, 0.6);
  const pillarMat = stdMat(0xa59e91);
  const pillarTop = stdMat(0xf2c14e, { metalness: 0.3, roughness: 0.4 });
  const pillar = (x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.85), pillarMat);
    m.position.set(x, 0.55, z);
    m.castShadow = true;
    group.add(m);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), pillarTop);
    top.position.set(x, 1.38, z);
    top.castShadow = true;
    group.add(top);
  };
  for (const sx of [-1, 1]) {
    for (const z of [-hh, -hh / 2, -1.2, 1.2, hh / 2, hh]) pillar(sx * hw, z);
  }

  const leaves = [stdMat(0x2f7d32, { flatShading: true }), stdMat(0x3b8f3a, { flatShading: true }), stdMat(0x4a9b3c, { flatShading: true })];
  const trunk = stdMat(0x6b4423);
  const rockMat = stdMat(0x8d8a84, { flatShading: true });
  const rnd = mulberry(42);
  const tree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), trunk);
    tr.position.y = 0.6;
    tr.castShadow = true;
    t.add(tr);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.28, 1.4, 7), leaves[Math.floor(rnd() * 3)]);
      cone.position.y = 1.4 + i * 0.75;
      cone.rotation.y = rnd() * Math.PI;
      cone.castShadow = true;
      t.add(cone);
    }
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    group.add(t);
  };
  const roundTree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6), trunk);
    tr.position.y = 0.55;
    tr.castShadow = true;
    t.add(tr);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), leaves[Math.floor(rnd() * 3)]);
    crown.position.y = 1.7;
    crown.castShadow = true;
    t.add(crown);
    t.position.set(x, -0.45, z);
    t.scale.setScalar(s);
    group.add(t);
  };
  for (let i = 0; i < 140; i++) {
    const x = (rnd() - 0.5) * 80;
    const z = (rnd() - 0.5) * 80;
    if (Math.abs(x) < hw + 1.6 && Math.abs(z) < hh + 1.6) continue;
    if (Math.abs(z) < 2.2) continue;
    if (Math.abs(x) > 13 && Math.abs(x) < 27 && Math.abs(z) > 4 && Math.abs(z) < 15) continue;
    const s = 0.7 + rnd() * 0.7;
    if (rnd() < 0.55) tree(x, z, s);
    else roundTree(x, z, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 60;
    const z = (rnd() - 0.5) * 60;
    if (Math.abs(x) < hw + 0.8 && Math.abs(z) < hh + 0.8) continue;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rnd() * 0.5, 0), rockMat);
    r.position.set(x, -0.35, z);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    r.castShadow = true;
    group.add(r);
  }

  const building = (x: number, z: number, w: number, h: number, d: number, label: string, rotY: number) => {
    const b = new THREE.Group();
    const wallTex = windowsTexture(Math.round(w * 1.5), Math.round(h * 1.2), "#e8e2d6", "#5f86b8");
    const sideTex = windowsTexture(Math.round(d * 1.5), Math.round(h * 1.2), "#ddd6c8", "#5f86b8");
    const wall = stdMat(0xffffff, { map: wallTex });
    const side = stdMat(0xffffff, { map: sideTex });
    const roof = stdMat(0x5b6474);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, wall, wall]);
    body.position.y = h / 2 - 0.45;
    body.castShadow = true;
    body.receiveShadow = true;
    b.add(body);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), stdMat(0x2a6fb0));
    trim.position.y = h - 0.62;
    b.add(trim);
    const signTex = textTexture(label, { width: 512, height: 96, color: "#ffffff", bg: "#2a6fb0" });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.13), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(0, h * 0.82 - 0.45, d / 2 + 0.02);
    b.add(sign);
    const back = sign.clone();
    back.position.z = -d / 2 - 0.02;
    back.rotation.y = Math.PI;
    b.add(back);
    b.position.set(x, 0, z);
    b.rotation.y = rotY;
    group.add(b);
  };
  building(-20, -9, 10, 5, 6, "IUT · BÂTIMENT A", Math.PI / 2);
  building(20, 9, 10, 5, 6, "IUT · BÂTIMENT B", -Math.PI / 2);
  building(-20, 9, 8, 4, 6, "BIBLIOTHÈQUE", Math.PI / 2);
  building(20, -9, 8, 6, 6, "RESTO U", -Math.PI / 2);

  const bannerTex = textTexture("USMB ARENA", { width: 1024, height: 160, color: "#ffcf3f", stroke: "#4a2a00", bg: "#1e2850" });
  for (const sz of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }));
    board.position.set(0, 2.2, sz * (hh + 2.2));
    board.rotation.y = sz > 0 ? Math.PI : 0;
    board.castShadow = true;
    group.add(board);
    const backBoard = new THREE.Mesh(new THREE.BoxGeometry(12.3, 2.2, 0.15), stdMat(0x2b3a72));
    backBoard.position.set(0, 2.2, sz * (hh + 2.2) + sz * 0.1);
    group.add(backBoard);
    for (const px of [-5.5, 5.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), stdMat(0x3a3a3a, { metalness: 0.5 }));
      post.position.set(px, 1.2, sz * (hh + 2.35));
      post.castShadow = true;
      group.add(post);
    }
  }

  const flags: THREE.Mesh[] = [];
  const flagColors = [0xffcf3f, 0x3b8cff, 0xff4d4d, 0xffffff];
  let fi = 0;
  for (const sx of [-1, 1]) {
    for (const z of [-hh / 2, hh / 2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), stdMat(0xdddddd, { metalness: 0.6 }));
      pole.position.set(sx * (hw + 0.9), 1.0, z);
      group.add(pole);
      const flagGeo = new THREE.PlaneGeometry(1.2, 0.7, 8, 2);
      flagGeo.translate(0.6, 0, 0);
      const flag = new THREE.Mesh(flagGeo, stdMat(flagColors[fi++ % 4], { side: THREE.DoubleSide }));
      flag.position.set(sx * (hw + 0.9), 2.2, z);
      flag.castShadow = true;
      flag.userData.base = (flagGeo.attributes.position.array as Float32Array).slice();
      group.add(flag);
      flags.push(flag);
    }
  }
  animated.push((t) => {
    for (const [i, f] of flags.entries()) {
      const pos = f.geometry.attributes.position as THREE.BufferAttribute;
      const base = f.userData.base as Float32Array;
      for (let v = 0; v < pos.count; v++) {
        const bx = base[v * 3];
        pos.setZ(v, Math.sin(bx * 3 - t * 5 + i) * 0.12 * bx);
      }
      pos.needsUpdate = true;
    }
  });

  return {
    group,
    update(t: number) {
      for (const f of animated) f(t);
    },
  };
}
