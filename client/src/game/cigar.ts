import * as THREE from "three";

// Le cigare de Paco est dessiné sur sa photo ronde (textures.ts) ; la fumée
// sort de son bout, dont la position dépend de la caméra puisque la photo
// est toujours face à elle.

/** Bout du cigare, en fraction de la taille de la photo (x vers la droite, y vers le haut). */
const TIP: [number, number] = [0.374, -0.435];

export function hasCigar(id: string): boolean {
  return id === "paco";
}

/** Dessine le cigare sur le canevas de la photo (taille `size`). */
export function drawCigar(g: CanvasRenderingContext2D, size: number) {
  const s = size / 256;
  g.save();
  g.translate(138 * s, 221 * s);
  g.rotate(0.21);
  g.scale(1.35, 1.35);
  g.lineCap = "round";
  // Corps : tabac brun avec bague dorée.
  g.fillStyle = "#6b4226";
  g.strokeStyle = "#3d2414";
  g.lineWidth = 2 * s;
  g.beginPath();
  g.roundRect(-4 * s, -7 * s, 62 * s, 14 * s, 6 * s);
  g.fill();
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(2 * s, -5 * s, 50 * s, 3 * s);
  g.fillStyle = "#d4af37";
  g.fillRect(8 * s, -7 * s, 8 * s, 14 * s);
  g.fillStyle = "#8a1f1a";
  g.fillRect(10 * s, -3 * s, 4 * s, 6 * s);
  // Cendre et braise.
  g.fillStyle = "#9a9a9a";
  g.beginPath();
  g.roundRect(56 * s, -7 * s, 8 * s, 14 * s, 3 * s);
  g.fill();
  const glow = g.createRadialGradient(65 * s, 0, 0, 65 * s, 0, 9 * s);
  glow.addColorStop(0, "rgba(255,200,80,1)");
  glow.addColorStop(0.5, "rgba(255,90,26,0.9)");
  glow.addColorStop(1, "rgba(255,60,0,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(65 * s, 0, 9 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Position monde du bout du cigare pour une photo face caméra. */
export function cigarTip(head: THREE.Sprite, camera: THREE.Camera, out = new THREE.Vector3()): THREE.Vector3 {
  const size = head.getWorldScale(new THREE.Vector3()).x;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  return head.getWorldPosition(out).addScaledVector(right, TIP[0] * size).addScaledVector(up, TIP[1] * size);
}
