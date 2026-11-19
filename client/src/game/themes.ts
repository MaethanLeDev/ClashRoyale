export type Decor = "campus" | "beach" | "mountain" | "party" | "volcano";

export interface Theme {
  decor: Decor;
  sky: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  exposure: number;
  field: [string, string];
  path: string;
  pathEdge: string;
  pads: string;
  outer: { base: string; dots: string[] };
  dirt: number;
  bank: number;
  water: { deep: [number, number, number]; shallow: [number, number, number]; foam: [number, number, number]; lava: number };
  stone: { base: string; dots: string[] };
  wallCap: number;
  pillar: number;
  pillarTop: number;
  leaves: number[];
  trunk: number;
  banner: { bg: string; color: string; stroke: string };
  flags: number[];
  particles: "none" | "snow" | "embers" | "fireflies" | "leaves";
}

const base: Theme = {
  decor: "campus",
  sky: 0x9fd4f5,
  fogNear: 60,
  fogFar: 140,
  hemiSky: 0xdff1ff,
  hemiGround: 0x4d6b35,
  hemiIntensity: 1.15,
  sunColor: 0xfff0d6,
  sunIntensity: 2.1,
  exposure: 1.05,
  field: ["#79b94f", "#6dad45"],
  path: "#d9bf86",
  pathEdge: "rgba(120,90,50,0.45)",
  pads: "rgba(150,140,120,0.55)",
  outer: { base: "#4f8f3a", dots: ["#5a9c43", "#47823a", "#62a64a", "#3f7833"] },
  dirt: 0x7a5634,
  bank: 0x6b4a2c,
  water: { deep: [0.1, 0.42, 0.78], shallow: [0.28, 0.72, 0.95], foam: [0.92, 0.97, 1], lava: 0 },
  stone: { base: "#9b9488", dots: ["#8a8377", "#aaa397", "#7d776c", "#b4ada0"] },
  wallCap: 0xb9b2a5,
  pillar: 0xa59e91,
  pillarTop: 0xf2c14e,
  leaves: [0x2f7d32, 0x3b8f3a, 0x4a9b3c],
  trunk: 0x6b4423,
  banner: { bg: "#1e2850", color: "#ffcf3f", stroke: "#4a2a00" },
  flags: [0xffcf3f, 0x3b8cff, 0xff4d4d, 0xffffff],
  particles: "leaves",
};

export const THEMES: Theme[] = [
  base,
  {
    ...base,
    decor: "beach",
    sky: 0x8fe0ff,
    hemiSky: 0xf2fbff,
    hemiGround: 0xc9a86a,
    sunColor: 0xfff3dc,
    sunIntensity: 2.3,
    field: ["#8cc65a", "#7fba4f"],
    path: "#f2dca5",
    pads: "rgba(230,210,160,0.7)",
    outer: { base: "#e8cf96", dots: ["#f0d9a5", "#dcc186", "#f5e3b8", "#d6b97a"] },
    dirt: 0xc9a86a,
    bank: 0xd9bc82,
    water: { deep: [0.0, 0.55, 0.72], shallow: [0.2, 0.85, 0.85], foam: [1, 1, 1], lava: 0 },
    stone: { base: "#e6dcc8", dots: ["#d8ccb4", "#f0e8d8", "#cfc2a8"] },
    wallCap: 0xf3ecdc,
    pillar: 0xe8dcc4,
    pillarTop: 0x3cc2d6,
    leaves: [0x2f9a4a, 0x3fae55, 0x268a3f],
    trunk: 0x9a7448,
    banner: { bg: "#0e7fa0", color: "#ffffff", stroke: "#06394a" },
    flags: [0xff7a59, 0x3cc2d6, 0xffd23f, 0xffffff],
    particles: "none",
  },
  {
    ...base,
    decor: "mountain",
    sky: 0xc8e4f7,
    fogNear: 45,
    fogFar: 120,
    hemiSky: 0xeaf6ff,
    hemiGround: 0x9fb6c9,
    hemiIntensity: 1.3,
    sunColor: 0xf4f8ff,
    sunIntensity: 1.8,
    field: ["#a9cf8c", "#9cc47e"],
    path: "#f4f8fb",
    pathEdge: "rgba(120,150,180,0.4)",
    pads: "rgba(230,240,250,0.8)",
    outer: { base: "#eef4f9", dots: ["#ffffff", "#e2ebf3", "#d7e3ee", "#f6fafd"] },
    dirt: 0x7d8c99,
    bank: 0xdfe9f2,
    water: { deep: [0.45, 0.68, 0.86], shallow: [0.72, 0.88, 0.98], foam: [1, 1, 1], lava: 0 },
    stone: { base: "#8f99a3", dots: ["#7f8993", "#a3adb7", "#6f7983"] },
    wallCap: 0xffffff,
    pillar: 0x8f99a3,
    pillarTop: 0xbfe3ff,
    leaves: [0x1f5e3c, 0x23694a, 0x1a5236],
    trunk: 0x5a3d26,
    banner: { bg: "#5b7fa8", color: "#ffffff", stroke: "#22344d" },
    flags: [0xffffff, 0x5b7fa8, 0xd62b2b, 0xbfe3ff],
    particles: "snow",
  },
  {
    ...base,
    decor: "party",
    sky: 0x120c2a,
    fogNear: 40,
    fogFar: 110,
    hemiSky: 0x6a5cff,
    hemiGround: 0x2a1b4a,
    hemiIntensity: 0.9,
    sunColor: 0xb7a8ff,
    sunIntensity: 0.9,
    exposure: 1.15,
    field: ["#3f7a4a", "#376e42"],
    path: "#5b4a7a",
    pathEdge: "rgba(200,120,255,0.55)",
    pads: "rgba(120,90,200,0.5)",
    outer: { base: "#1d2a24", dots: ["#24352c", "#18241e", "#2b3d33"] },
    dirt: 0x2c2238,
    bank: 0x2c2238,
    water: { deep: [0.25, 0.05, 0.6], shallow: [0.55, 0.2, 1.0], foam: [1, 0.6, 1], lava: 0 },
    stone: { base: "#3a3550", dots: ["#45405e", "#2f2b43", "#524c6e"] },
    wallCap: 0x6a5cff,
    pillar: 0x3a3550,
    pillarTop: 0xff4df0,
    leaves: [0x1f4a3a, 0x24563f, 0x1a3f31],
    trunk: 0x3a2a20,
    banner: { bg: "#1b1440", color: "#ff4df0", stroke: "#3c0a4a" },
    flags: [0xff4df0, 0x4dfcff, 0xfff04d, 0x8a4dff],
    particles: "fireflies",
  },
  {
    ...base,
    decor: "volcano",
    sky: 0x4a1f17,
    fogNear: 35,
    fogFar: 100,
    hemiSky: 0xffb08a,
    hemiGround: 0x3a1a12,
    hemiIntensity: 0.95,
    sunColor: 0xffc49a,
    sunIntensity: 1.6,
    field: ["#5a6b3a", "#4f5f33"],
    path: "#6b5446",
    pathEdge: "rgba(255,110,40,0.35)",
    pads: "rgba(60,40,35,0.6)",
    outer: { base: "#2b2220", dots: ["#3a2c28", "#211a18", "#4a3630", "#5a2a1a"] },
    dirt: 0x2b1d18,
    bank: 0x3a2620,
    water: { deep: [0.9, 0.25, 0.02], shallow: [1.0, 0.65, 0.1], foam: [1, 0.95, 0.6], lava: 1 },
    stone: { base: "#4a3f3c", dots: ["#3a302d", "#5a4d49", "#2e2523"] },
    wallCap: 0x6b5a55,
    pillar: 0x4a3f3c,
    pillarTop: 0xff6a1a,
    leaves: [0x3a3a30, 0x2e2e26, 0x45443a],
    trunk: 0x2a1d17,
    banner: { bg: "#2a0d0a", color: "#ff8a3a", stroke: "#000000" },
    flags: [0xff6a1a, 0x222222, 0xffd23f, 0x8a1a10],
    particles: "embers",
  },
];

export function themeFor(arena: number): Theme {
  return THEMES[Math.max(0, Math.min(THEMES.length - 1, arena))];
}
