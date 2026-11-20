import * as THREE from "three";
import type { Fx } from "./fx";
import { getTemplate } from "./glb";

// Bloc de glace autour d'une unité ou d'une tour gelée (Regard de Papy Niels).
// Le modèle client/public/models/ice.glb est normalisé : base à 0, ~1 de haut
// et de large ; on le met à l'échelle de ce qu'il enferme.

const OPACITY: Record<string, number> = { ice_shell: 0.38, ice_spike: 0.6, ice_frost: 0.85 };
let prepared = false;
let fallback: THREE.Object3D | null = null;

function template(): THREE.Object3D {
  const tpl = getTemplate("ice");
  if (tpl) {
    if (!prepared) {
      prepared = true;
      tpl.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        m.opacity = OPACITY[m.name] ?? m.opacity;
        mesh.renderOrder = 5;
      });
    }
    return tpl;
  }
  fallback ??= (() => {
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xbfe9ff, roughness: 0.05, transparent: true, opacity: 0.4,
        depthWrite: false, side: THREE.DoubleSide, flatShading: true,
      }),
    );
    mesh.renderOrder = 5;
    return mesh;
  })();
  return fallback;
}

export class IceShell {
  obj = new THREE.Group();
  readonly size: THREE.Vector3;
  private t = 0;

  constructor(width: number, height: number, depth = width) {
    this.size = new THREE.Vector3(width, height, depth);
    this.obj.add(template().clone(true));
    this.update(0);
  }

  /** Apparition : le bloc pousse depuis le sol avec un petit rebond. */
  update(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 0.22);
    const k = this.t;
    const back = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
    this.obj.scale.set(this.size.x * (0.6 + 0.4 * back), this.size.y * Math.max(0.05, back), this.size.z * (0.6 + 0.4 * back));
  }

  /** Mesure l'objet (dans son repère, sans rotation) et y attache le bloc. */
  static around(target: THREE.Object3D, measure: THREE.Object3D, margin = 1.12, minWidth = 0.7): IceShell {
    // Mesure dans le repère de la cible : on la sort un instant de son parent.
    const parent = target.parent;
    const pos = target.position.clone();
    const rot = target.rotation.clone();
    const scale = target.scale.clone();
    parent?.remove(target);
    target.position.set(0, 0, 0);
    target.rotation.set(0, 0, 0);
    target.scale.setScalar(1);
    target.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(measure);
    target.position.copy(pos);
    target.rotation.copy(rot);
    target.scale.copy(scale);
    parent?.add(target);
    target.updateMatrixWorld(true);
    // Coquille ronde autour du corps (l'arme qui dépasse reste dehors),
    // allongée seulement pour les modèles longs comme la Duster.
    const xExt = box.max.x - box.min.x;
    const zExt = box.max.z - box.min.z;
    const w = Math.max(minWidth, xExt * margin);
    const d = Math.max(minWidth, (zExt > xExt * 1.6 ? zExt : Math.min(zExt, xExt)) * margin);
    const h = Math.max(0.8, box.max.y * 1.05);
    const ice = new IceShell(w, h, d);
    target.add(ice.obj);
    return ice;
  }
}

export function frostPuff(fx: Fx, ground: THREE.Vector3, size: THREE.Vector3) {
  fx.burst(ground.clone().setY(size.y * 0.3), 0xe8f8ff, 8, { speed: 1.5 + size.x, size: 0.08 + size.x * 0.03, up: 1.5, cube: true, life: 0.5 });
}

export function shatterIce(fx: Fx, ice: IceShell) {
  const ground = ice.obj.getWorldPosition(new THREE.Vector3());
  const s = ice.size;
  const big = Math.max(s.x, s.z);
  fx.burst(ground.clone().setY(s.y * 0.5), 0xbfe9ff, Math.round(10 + big * 5), {
    speed: 2.5 + big, size: 0.1 + big * 0.05, up: 2.5 + s.y * 0.5, cube: true, life: 0.85,
  });
  fx.burst(ground.clone().setY(s.y * 0.4), 0xffffff, Math.round(6 + big * 3), {
    speed: 2 + big, size: 0.06 + big * 0.03, up: 2 + s.y * 0.4, cube: true, life: 0.6,
  });
  fx.ring(ground.clone().setY(0.05), 0xdff6ff, 0.2, big * 0.9, 0.35, 0.8);
  ice.obj.removeFromParent();
}
