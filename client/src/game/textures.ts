import * as THREE from "three";
import { CARD_IDS, type CardId } from "../../../shared/cards";

export const ALLY = 0x3b8cff;
export const ENEMY = 0xff4d4d;

const images = new Map<CardId, HTMLImageElement>();
const headCache = new Map<string, THREE.Texture>();

export function loadHeads(): Promise<void> {
  return Promise.all(
    CARD_IDS.map(
      (id) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(id, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `/heads/${id}.png`;
        }),
    ),
  ).then(() => undefined);
}

export function headTexture(id: CardId, color: number, eyes = false): THREE.Texture {
  const key = `${id}:${color}:${eyes}`;
  const cached = headCache.get(key);
  if (cached) return cached;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = images.get(id);
  const border = 14;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  g.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  g.fill();
  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - border, 0, Math.PI * 2);
  g.clip();
  if (img) g.drawImage(img, border, border, size - border * 2, size - border * 2);
  else {
    g.fillStyle = "#ddd";
    g.fillRect(0, 0, size, size);
  }
  g.restore();
  if (eyes) {
    g.save();
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - border, 0, Math.PI * 2);
    g.clip();
    const grd = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(160,220,255,0)");
    grd.addColorStop(1, "rgba(160,220,255,0.55)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    g.restore();
  }
  g.lineWidth = 4;
  g.strokeStyle = "rgba(255,255,255,0.65)";
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - border + 2, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  headCache.set(key, tex);
  return tex;
}

export function textTexture(
  text: string,
  opts: { font?: string; color?: string; stroke?: string; width?: number; height?: number; bg?: string } = {},
): THREE.CanvasTexture {
  const w = opts.width ?? 256;
  const h = opts.height ?? 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = h / 2;
    g.beginPath();
    g.roundRect(2, 2, w - 4, h - 4, r);
    g.fill();
  }
  g.font = opts.font ?? `900 ${Math.round(h * 0.6)}px "Lilita One", "Arial Black", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (opts.stroke) {
    g.lineWidth = Math.max(4, h * 0.12);
    g.strokeStyle = opts.stroke;
    g.lineJoin = "round";
    g.strokeText(text, w / 2, h / 2 + 2);
  }
  g.fillStyle = opts.color ?? "#fff";
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function fieldTexture(
  tilesX: number,
  tilesY: number,
  paths: (g: CanvasRenderingContext2D, px: number) => void,
): THREE.CanvasTexture {
  const px = 48;
  const c = document.createElement("canvas");
  c.width = tilesX * px;
  c.height = tilesY * px;
  const g = c.getContext("2d")!;
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? "#79b94f" : "#6dad45";
      g.fillRect(x * px, y * px, px, px);
    }
  }
  const rnd = mulberry(7);
  for (let i = 0; i < tilesX * tilesY * 6; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,40,0,0.06)";
    g.fillRect(x, y, 2 + rnd() * 3, 4 + rnd() * 6);
  }
  paths(g, px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function noiseTexture(base: string, dots: string[], size = 256, count = 2400, seed = 3): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rnd = mulberry(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = dots[Math.floor(rnd() * dots.length)];
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function windowsTexture(cols: number, rows: number, wall: string, glass: string): THREE.CanvasTexture {
  const cw = 32;
  const c = document.createElement("canvas");
  c.width = cols * cw;
  c.height = rows * cw;
  const g = c.getContext("2d")!;
  g.fillStyle = wall;
  g.fillRect(0, 0, c.width, c.height);
  const rnd = mulberry(cols * 31 + rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = rnd() < 0.25 ? "#ffe9a8" : glass;
      g.fillRect(x * cw + 6, y * cw + 6, cw - 12, cw - 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(0.6, "rgba(0,0,0,0.3)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
