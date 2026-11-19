import * as THREE from "three";
import { glowTexture } from "./textures";

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  grow: number;
  baseScale: number;
  fade: boolean;
  spin: number;
  mat: THREE.Material & { opacity: number };
  onUpdate?: (p: Particle, k: number) => void;
}

const sphereGeo = new THREE.IcosahedronGeometry(1, 0);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
let glow: THREE.Texture | null = null;

export class Fx {
  private list: Particle[] = [];

  constructor(private scene: THREE.Scene) {}

  private add(p: Particle) {
    this.scene.add(p.obj);
    this.list.push(p);
  }

  burst(
    pos: THREE.Vector3,
    color: number,
    count: number,
    opts: { speed?: number; size?: number; life?: number; gravity?: number; up?: number; cube?: boolean } = {},
  ) {
    const speed = opts.speed ?? 4;
    const size = opts.size ?? 0.15;
    const life = opts.life ?? 0.7;
    for (let i = 0; i < count; i++) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, flatShading: true });
      const mesh = new THREE.Mesh(opts.cube ? cubeGeo : sphereGeo, m);
      const s = size * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      mesh.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.add({
        obj: mesh,
        vel: new THREE.Vector3(Math.cos(a) * v, (opts.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * v),
        life: life * (0.7 + Math.random() * 0.6), max: life, gravity: opts.gravity ?? 12, grow: 0,
        baseScale: s, fade: true, spin: (Math.random() - 0.5) * 10, mat: m,
      });
    }
  }

  smoke(pos: THREE.Vector3, count = 6, color = 0x9a9a9a, size = 0.5) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.7, flatShading: true, depthWrite: false });
      const mesh = new THREE.Mesh(sphereGeo, m);
      const s = size * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
      this.add({
        obj: mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6),
        life: 1.2 + Math.random(), max: 2, gravity: -0.3, grow: 0.9, baseScale: s, fade: true, spin: 0, mat: m,
      });
    }
  }

  ring(pos: THREE.Vector3, color: number, r0: number, r1: number, life = 0.5, opacity = 0.8) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.06;
    mesh.scale.setScalar(r0);
    this.add({
      obj: mesh, vel: new THREE.Vector3(), life, max: life, gravity: 0, grow: 0, baseScale: r0, fade: true, spin: 0, mat: m,
      onUpdate: (_p, k) => mesh.scale.setScalar(r0 + (r1 - r0) * (1 - (1 - k) ** 3)),
    });
  }

  spark(pos: THREE.Vector3, color: number, size = 0.5, life = 0.25) {
    glow ??= glowTexture();
    const m = new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.copy(pos);
    this.add({
      obj: s, vel: new THREE.Vector3(), life, max: life, gravity: 0, grow: -0.5, baseScale: size, fade: true, spin: 0,
      mat: m as unknown as THREE.Material & { opacity: number },
    });
  }

  fireball(pos: THREE.Vector3, size = 2) {
    glow ??= glowTexture();
    const colors = [0xfff3b0, 0xffc04d, 0xff7a1a, 0xe0400c, 0xffffff];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.SpriteMaterial({ map: glow, color: colors[i % colors.length], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(m);
      const s0 = size * (0.35 + Math.random() * 0.4);
      s.scale.setScalar(s0);
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * size * 0.6, (Math.random() - 0.2) * size * 0.4, (Math.random() - 0.5) * size * 0.6));
      const life = 0.45 + Math.random() * 0.4;
      this.add({
        obj: s, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2),
        life, max: life, gravity: -1, grow: 1.6 + Math.random(), baseScale: s0, fade: true, spin: 0,
        mat: m as unknown as THREE.Material & { opacity: number },
      });
    }
    this.smoke(pos.clone().setY(Math.max(0.5, pos.y - 0.5)), 10, 0x2e2e2e, size * 0.3);
    this.burst(pos, 0xffa040, 16, { speed: 7, size: 0.1, up: 7, life: 0.6 });
  }

  sprite(map: THREE.Texture, pos: THREE.Vector3, size: number, life: number, onUpdate?: (s: THREE.Sprite, k: number) => void) {
    const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(m);
    s.renderOrder = 30;
    s.scale.setScalar(size);
    s.position.copy(pos);
    this.add({
      obj: s, vel: new THREE.Vector3(), life, max: life, gravity: 0, grow: 0, baseScale: size, fade: false, spin: 0,
      mat: m as unknown as THREE.Material & { opacity: number },
      onUpdate: onUpdate ? (_p, k) => onUpdate(s, k) : undefined,
    });
    return s;
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        p.mat.dispose();
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.obj.position.y < 0.05 && p.gravity > 0) {
        p.obj.position.y = 0.05;
        p.vel.multiplyScalar(0.5);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      if (p.spin) p.obj.rotation.x += p.spin * dt;
      if (p.grow) p.obj.scale.setScalar(Math.max(0.01, p.baseScale * (1 + p.grow * k)));
      if (p.fade) p.mat.opacity = Math.min(1, (p.life / p.max) * 1.6) * (p.mat.userData.base ?? 1);
      p.onUpdate?.(p, k);
      keep.push(p);
    }
    this.list = keep;
  }

  clear() {
    for (const p of this.list) {
      this.scene.remove(p.obj);
      p.mat.dispose();
    }
    this.list = [];
  }
}
