const KEY = "cameraTilt";
const DEFAULT_TILT = 0.45;

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT_TILT;
}

let tilt = read();
const listeners = new Set<(t: number) => void>();

export function getTilt(): number {
  return tilt;
}

export function setTilt(v: number) {
  tilt = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(KEY, String(tilt));
  } catch {
    /* stockage indisponible */
  }
  for (const fn of listeners) fn(tilt);
}

export function onTilt(fn: (t: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cameraFor(tiltValue: number, portrait: boolean): { pitch: number; fov: number } {
  const pitch = 84 - tiltValue * 48 + (portrait ? 3 : 0);
  const fov = 18 + tiltValue * 44;
  return { pitch, fov };
}
