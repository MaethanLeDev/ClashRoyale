import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CARDS, type CardId } from "../../../shared/cards";

// Modèles Blender optionnels : client/public/models/<id>.glb
// Conventions (voir tools/blender/README.md) :
//   leg_L, leg_R, arm_L, arm_R : objets dont l'origine est à la hanche / l'épaule
//   head_anchor : Empty où l'on place la tête (sprite photo)
//   matériau "team" : recoloré à la couleur de l'équipe
//   cape : plan animé comme la cape procédurale

const templates = new Map<CardId, THREE.Object3D>();

export function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  return Promise.all(
    (Object.keys(CARDS) as CardId[]).map(
      (id) =>
        new Promise<void>((resolve) => {
          loader.load(
            `/models/${id}.glb`,
            (gltf) => {
              templates.set(id, gltf.scene);
              resolve();
            },
            undefined,
            () => resolve(),
          );
        }),
    ),
  ).then(() => undefined);
}

export interface GlbParts {
  scene: THREE.Object3D;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  cape?: THREE.Mesh;
  headPos: THREE.Vector3;
  height: number;
}

export function instantiateGlb(id: CardId, teamColor: number): GlbParts | null {
  const tpl = templates.get(id);
  if (!tpl) return null;
  const scene = tpl.clone(true);
  // Matériaux propres à chaque unité : le flash / gel modifie l'emissive.
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clone = (m: THREE.Material) => {
      const c = m.clone() as THREE.MeshStandardMaterial;
      if (m.name.toLowerCase().startsWith("team")) {
        c.color.setHex(teamColor);
        c.emissive.setHex(teamColor);
        c.emissiveIntensity = 0.15;
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  const find = (n: string) => scene.getObjectByName(n) ?? undefined;
  const legs = [find("leg_L"), find("leg_R")].filter((o): o is THREE.Object3D => !!o);
  const arms = [find("arm_L"), find("arm_R")].filter((o): o is THREE.Object3D => !!o);
  const cape = find("cape") as THREE.Mesh | undefined;
  scene.updateMatrixWorld(true);
  const anchor = find("head_anchor");
  const headPos = anchor ? anchor.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.4, 0);
  const box = new THREE.Box3().setFromObject(scene);
  return { scene, legs, arms, cape, headPos, height: Math.max(box.max.y, headPos.y + 0.5) };
}
