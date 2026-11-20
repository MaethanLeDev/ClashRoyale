import * as THREE from "three";
import { glowTexture } from "./textures";

// Le « regard » de Papy Niels : deux rayons glacés partent de ses yeux
// (sur la photo ronde, toujours face caméra) et touchent le sol.

// Position des yeux sur la photo ronde, en fraction de la taille du sprite.
const EYES: [number, number][] = [[-0.14, 0.02], [0.08, 0.02]];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
let glowTex: THREE.Texture | null = null;

export class Glare {
  group = new THREE.Group();
  private beams: { outer: THREE.Mesh; core: THREE.Mesh; glow: THREE.Sprite; hit: THREE.Sprite }[] = [];
  private mats: THREE.Material[] = [];

  constructor(private width = 1) {
    glowTex ??= glowTexture();
    for (let i = 0; i < 2; i++) {
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x8fdcff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xbff0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const hitMat = glowMat.clone();
      const outer = new THREE.Mesh(beamGeo, outerMat);
      const core = new THREE.Mesh(beamGeo, coreMat);
      const glow = new THREE.Sprite(glowMat);
      const hit = new THREE.Sprite(hitMat);
      outer.renderOrder = 31;
      core.renderOrder = 32;
      glow.renderOrder = 33;
      hit.renderOrder = 31;
      this.group.add(outer, core, glow, hit);
      this.beams.push({ outer, core, glow, hit });
      this.mats.push(outerMat, coreMat, glowMat, hitMat);
    }
  }

  /**
   * head : sprite de la tête (position monde, taille = scale.x) ;
   * target : point visé au sol ; a : intensité 0..1 ; t : temps (scintillement).
   */
  update(head: THREE.Sprite, camera: THREE.Camera, target: THREE.Vector3, a: number, t: number) {
    this.group.visible = a > 0.01;
    if (!this.group.visible) return;
    const pos = head.getWorldPosition(new THREE.Vector3());
    const size = head.getWorldScale(new THREE.Vector3()).x;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const inv = new THREE.Matrix4().copy(this.group.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
    const flick = 1 + Math.sin(t * 60) * 0.12 + Math.sin(t * 37) * 0.08;
    for (const [i, b] of this.beams.entries()) {
      const eye = pos.clone().addScaledVector(right, EYES[i][0] * size).addScaledVector(up, EYES[i][1] * size);
      const hit = target.clone().addScaledVector(right, (i === 0 ? -1 : 1) * 0.12 * this.width);
      const from = eye.applyMatrix4(inv);
      const to = hit.applyMatrix4(inv);
      const dir = to.clone().sub(from);
      const len = dir.length();
      const mid = from.clone().addScaledVector(dir, 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const r = 0.07 * this.width * a * flick;
      for (const [mesh, k] of [[b.outer, 1], [b.core, 0.35]] as const) {
        mesh.position.copy(mid);
        mesh.quaternion.copy(q);
        mesh.scale.set(r * k, len, r * k);
      }
      (b.outer.material as THREE.MeshBasicMaterial).opacity = 0.5 * a;
      (b.core.material as THREE.MeshBasicMaterial).opacity = 0.9 * a;
      b.glow.position.copy(from);
      b.glow.scale.setScalar(size * 0.16 * a * flick);
      b.hit.position.copy(to);
      b.hit.scale.setScalar(0.9 * this.width * a * flick);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}
