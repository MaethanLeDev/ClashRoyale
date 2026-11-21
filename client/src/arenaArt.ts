// Scènes d'arène en SVG, légèrement animées (boucles CSS + SMIL), une par arène.
// Pas de WebGL ici : c'est la vignette de l'accueil, elle doit rester légère sur téléphone.

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

interface Palette {
  sky: [string, string];
  ground: string;
  groundDark: string;
  pitch: string;
  pitchEdge: string;
  water: string;
  waterLight: string;
  stone: string;
  stoneLight: string;
  stoneDark: string;
  wood: string;
  heads: [string, string];
}

const PAL: Palette[] = [
  {
    sky: ["#5fb8f2", "#d4f0ff"],
    ground: "#4f8f3a",
    groundDark: "#3a6e2c",
    pitch: "#78b94e",
    pitchEdge: "#a8d77f",
    water: "#2f8fe0",
    waterLight: "#9fdcff",
    stone: "#a59e91",
    stoneLight: "#d6d0c3",
    stoneDark: "#6f695f",
    wood: "#8a5a32",
    heads: ["tordeux", "natis"],
  },
  {
    sky: ["#3fbdf0", "#d2f6ff"],
    ground: "#e8cf96",
    groundDark: "#cdae6c",
    pitch: "#86c457",
    pitchEdge: "#f6e3b4",
    water: "#16b2c8",
    waterLight: "#b9fbff",
    stone: "#e2d7c1",
    stoneLight: "#f6f0e2",
    stoneDark: "#a99a7c",
    wood: "#a8743e",
    heads: ["midas", "goutier"],
  },
  {
    sky: ["#7fb6e6", "#eef7ff"],
    ground: "#e9f2fb",
    groundDark: "#bcd1e6",
    pitch: "#d9e7f5",
    pitchEdge: "#ffffff",
    water: "#7cc8f0",
    waterLight: "#e6f8ff",
    stone: "#8b97a8",
    stoneLight: "#c3ccd8",
    stoneDark: "#566275",
    wood: "#6b4a33",
    heads: ["nazar", "savy"],
  },
  {
    sky: ["#0d0726", "#3a1670"],
    ground: "#1b1440",
    groundDark: "#110c2c",
    pitch: "#2b2468",
    pitchEdge: "#ff4fd8",
    water: "#b14dff",
    waterLight: "#ffb8ff",
    stone: "#5b5680",
    stoneLight: "#8d87b5",
    stoneDark: "#36325a",
    wood: "#3d2a5c",
    heads: ["imad", "tarit"],
  },
  {
    sky: ["#1e0806", "#a8361a"],
    ground: "#2f1a14",
    groundDark: "#1d0f0b",
    pitch: "#563629",
    pitchEdge: "#ff8a3d",
    water: "#ff6a1a",
    waterLight: "#ffd36a",
    stone: "#5e5049",
    stoneLight: "#85766d",
    stoneDark: "#382e29",
    wood: "#2a1a14",
    heads: ["samy", "valere"],
  },
];

const BLUE = "#3b8cff";
const RED = "#ff4d4d";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tower(x: number, y: number, team: string, p: Palette, mirror: boolean): string {
  const merlons = [-19, -8.7, 1.7, 12].map((m) => `<rect x="${m}" y="-51" width="7" height="8" rx="1.2" fill="${p.stone}"/>`).join("");
  return `<g transform="translate(${x} ${y}) scale(${mirror ? -1 : 1} 1)">
    <ellipse cx="0" cy="1.5" rx="26" ry="5.5" fill="#000" opacity=".25"/>
    <path d="M-17 0 L-14.5 -40 H14.5 L17 0 Z" fill="${p.stone}"/>
    <path d="M-17 0 L-14.5 -40 H-5 L-6 0 Z" fill="${p.stoneLight}" opacity=".55"/>
    <path d="M17 0 L14.5 -40 H9 L10 0 Z" fill="${p.stoneDark}" opacity=".4"/>
    <path d="M-16.2 -13 H16.2 M-15.4 -26.5 H15.4" stroke="${p.stoneDark}" stroke-width="1" opacity=".35"/>
    <path d="M-5.5 0 V-7 a5.5 5.5 0 0 1 11 0 V0 Z" fill="${p.stoneDark}"/>
    <circle cx="0" cy="-54" r="4.3" fill="#f1c27d"/>
    <path d="M-4.8 -54.6 a4.8 4.8 0 0 1 9.6 0 Z" fill="${team}"/>
    <path d="M-20 -40 H20 V-44.5 H-20 Z" fill="${p.stoneDark}"/>
    ${merlons}
    <path d="M-7.5 -37 H7.5 V-19 L0 -23 L-7.5 -19 Z" fill="${team}"/>
    <path d="M-7.5 -37 H7.5 V-34 H-7.5 Z" fill="#000" opacity=".2"/>
    <circle cx="0" cy="-29" r="2.6" fill="#fff" opacity=".85"/>
    <path d="M15.5 -51 V-71" stroke="#4b3a2c" stroke-width="1.8" stroke-linecap="round"/>
    <path class="aa-flag" d="M15.5 -71 q7 2.6 13.5 0 v8.5 q-6.5 2.6 -13.5 0 z" fill="${team}"/>
  </g>`;
}

function unit(cls: string, head: string, team: string, clip: string): string {
  return `<g class="aa-unit ${cls}"><g class="aa-bob">
    <ellipse cx="0" cy="9" rx="7" ry="2.2" fill="#000" opacity=".28"/>
    <circle r="8.2" fill="${team}"/>
    <image href="/heads/${head}.png" x="-6.6" y="-6.6" width="13.2" height="13.2" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>
  </g></g>`;
}

/** Projectile qui suit `path` pendant 42 % du cycle, puis petit impact. */
function shot(shape: string, path: string, end: [number, number], dur: number, begin: number, impact: string, rotate = true): string {
  const t = `dur="${dur}s" begin="${begin}s" repeatCount="indefinite"`;
  return `<g opacity="0">${shape}
      <animateMotion ${t} path="${path}" ${rotate ? 'rotate="auto"' : ""} keyPoints="0;1;1" keyTimes="0;0.42;1" calcMode="linear"/>
      <animate attributeName="opacity" ${t} values="1;1;0;0" keyTimes="0;0.42;0.43;1"/>
    </g>
    <circle cx="${end[0]}" cy="${end[1]}" r="0" fill="${impact}" opacity="0">
      <animate attributeName="r" ${t} values="0;0;11;11" keyTimes="0;0.42;0.62;1"/>
      <animate attributeName="opacity" ${t} values="0;0;.75;0;0" keyTimes="0;0.415;0.43;0.62;1"/>
    </circle>`;
}

const ARROW = (team: string) =>
  `<path d="M-8 0 H5" stroke="#5b3a1e" stroke-width="1.7" stroke-linecap="round"/><path d="M2.5 -2.8 L8 0 L2.5 2.8 Z" fill="#e8e8ee"/><path d="M-8 0 l-2.6 -2.2 M-8 0 l-2.6 2.2" stroke="${team}" stroke-width="1.5" stroke-linecap="round"/>`;
const CANNONBALL = `<circle r="4.6" fill="#2b2b35"/><circle cx="-1.5" cy="-1.5" r="1.5" fill="#fff" opacity=".45"/>`;
const SNOWBALL = `<circle r="4.6" fill="#fff"/><circle cx="1.2" cy="1.2" r="3.4" fill="#cfe3f7" opacity=".7"/>`;
const FIREBALL = `<path d="M-15 0 Q-6 -5.5 2.5 -4.4 A4.4 4.4 0 0 1 2.5 4.4 Q-6 5.5 -15 0 Z" fill="#ff7a1a" opacity=".85"/><circle r="4.2" fill="#ffd36a"/><circle r="2" fill="#fff6d0"/>`;
const ORB = (c: string, glow: string) => `<circle r="7" fill="${c}" opacity=".35" filter="url(#${glow})"/><circle r="3.6" fill="#fff"/><circle r="5" fill="none" stroke="${c}" stroke-width="1.6"/>`;

function particles(n: number, seed: number, fn: (r: () => number, i: number) => string): string {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) out += fn(r, i);
  return out;
}

function backdrop(id: number, p: Palette, u: string): string {
  switch (id) {
    case 0:
      return `
        <g class="aa-pan">
          <path d="M-10 110 L30 84 L64 100 L112 66 L150 92 L196 72 L240 96 L292 70 L338 94 L410 76 V140 H-10 Z" fill="#9dbfdc"/>
          <path d="M112 66 L101 74 L108 75 L114 71 L120 76 L126 74 Z M292 70 L282 78 L289 78 L294 75 L300 79 L304 77 Z" fill="#f4f8ff"/>
          <rect x="-10" y="108" width="420" height="10" fill="#79bfe8"/>
          <path d="M-10 124 Q60 104 130 118 T260 114 T410 118 V150 H-10 Z" fill="#62a148"/>
          <g>
            <rect x="18" y="88" width="78" height="38" rx="2" fill="#efe7d4"/>
            <path d="M14 90 L57 76 L100 90 Z" fill="#b65a3c"/>
            ${particles(10, 3, (_r, i) => `<rect x="${24 + (i % 5) * 14.5}" y="${95 + Math.floor(i / 5) * 13}" width="9" height="8" rx="1" fill="#7fb6dd"/>`)}
            <rect x="312" y="80" width="62" height="46" rx="2" fill="#dfe6ee"/>
            ${particles(12, 4, (_r, i) => `<rect x="${317 + (i % 4) * 14.5}" y="${85 + Math.floor(i / 4) * 13}" width="10" height="9" rx="1" fill="#5aa3d8" opacity="${0.75 + (i % 3) * 0.08}"/>`)}
            <rect x="335" y="68" width="16" height="13" fill="#c9d3de"/>
          </g>
          ${[38, 128, 262, 300].map((x, i) => `<g class="aa-sway" style="animation-delay:${-i * 0.7}s"><rect x="${x - 1.5}" y="${110 + (i % 2) * 4}" width="3" height="12" fill="${p.wood}"/><circle cx="${x}" cy="${106 + (i % 2) * 4}" r="9" fill="#3b8f3a"/><circle cx="${x - 3}" cy="${103 + (i % 2) * 4}" r="5" fill="#4ea94a"/></g>`).join("")}
        </g>
        ${[
          [40, 30, 34],
          [210, 22, 46],
          [320, 44, 40],
        ]
          .map(([, y, d], i) => `<g class="aa-drift" style="animation-duration:${d}s;animation-delay:${-(d * (i + 0.4)) / 3}s"><g transform="translate(0 ${y})" fill="#fff" opacity=".92"><ellipse cx="0" cy="0" rx="18" ry="7"/><ellipse cx="-8" cy="-4" rx="9" ry="7"/><ellipse cx="6" cy="-6" rx="10" ry="8"/></g></g>`)
          .join("")}`;
    case 1:
      return `
        <g class="aa-spin-slow" style="transform-origin:330px 44px">${particles(12, 5, (_r, i) => `<rect x="328.5" y="10" width="3" height="11" rx="1.5" fill="#ffe9a0" opacity=".8" transform="rotate(${i * 30} 330 44)"/>`)}</g>
        <circle cx="330" cy="44" r="16" fill="#ffe07a"/><circle cx="330" cy="44" r="11" fill="#fff3c0"/>
        <rect x="-10" y="92" width="420" height="44" fill="url(#${u}-sea)"/>
        <path d="M-10 92 H410" stroke="#fff" stroke-width="1" opacity=".5"/>
        ${[100, 110, 121].map((y, i) => `<g class="aa-wave" style="animation-duration:${4 + i}s"><path d="${Array.from({ length: 12 }, (_, k) => `M${-40 + k * 40 + (i % 2) * 20} ${y} q10 -3.5 20 0`).join(" ")}" stroke="#fff" stroke-width="1.6" fill="none" opacity="${0.55 - i * 0.12}" stroke-linecap="round"/></g>`).join("")}
        <g class="aa-boat"><path d="M0 0 h22 l-4 5 h-14 z" fill="#fff"/><path d="M11 -1 V-20 L22 -2 Z" fill="#ff7a59"/><path d="M10 -1 V-16 L2 -2 Z" fill="#fff"/></g>
        <path d="M-10 128 Q100 112 200 122 T410 120 V150 H-10 Z" fill="${p.ground}"/>
        <g class="aa-palm"><path d="M40 140 Q36 118 46 96" stroke="#8a5a32" stroke-width="5" fill="none" stroke-linecap="round"/>
          ${[-150, -110, -60, -20, 20].map((a) => `<path d="M46 96 q16 -6 28 4 q-14 -2 -28 -4 z" fill="#2f9a4a" transform="rotate(${a + 90} 46 96)"/>`).join("")}
          <circle cx="45" cy="99" r="3" fill="#6b4423"/><circle cx="49" cy="100" r="2.6" fill="#6b4423"/></g>
        ${[0, 1].map((i) => `<g class="aa-gull" style="animation-delay:${-i * 7}s;animation-duration:${16 + i * 5}s"><path class="aa-flap" d="M-7 0 q3.5 -4.5 7 0 q3.5 -4.5 7 0" stroke="#304050" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`).join("")}`;
    case 2:
      return `
        <g class="aa-pan">
          <path d="M-10 122 L46 62 L82 96 L140 36 L196 102 L232 68 L282 106 L334 48 L410 112 V140 H-10 Z" fill="#7e9cc4"/>
          <path d="M140 36 L124 54 L134 52 L141 58 L148 51 L157 55 Z M334 48 L320 63 L330 61 L336 66 L342 60 L350 64 Z M46 62 L36 73 L44 72 L48 76 L54 71 Z M232 68 L222 79 L230 78 L234 82 L240 77 Z" fill="#fff"/>
          <path d="M-10 128 Q80 108 170 122 T410 116 V150 H-10 Z" fill="#cfe0f1"/>
        </g>
        <path d="M-10 30 L410 62" stroke="#3a4a60" stroke-width="1.2"/>
        <g class="aa-cable"><path d="M0 0 V8" stroke="#3a4a60" stroke-width="1.2"/><rect x="-8" y="8" width="16" height="12" rx="3" fill="#ff5a4d"/><rect x="-5.5" y="10.5" width="11" height="5" rx="1.5" fill="#cfeaff"/></g>
        ${[22, 62, 98, 300, 340, 378].map((x, i) => `<g class="aa-sway" style="animation-delay:${-i * 0.5}s"><rect x="${x - 1.5}" y="${124 + (i % 2) * 5}" width="3" height="6" fill="${p.wood}"/><path d="M${x} ${100 + (i % 2) * 5} l9 15 h-5 l7 11 h-22 l7 -11 h-5 z" fill="#2c6a4a"/><path d="M${x} ${100 + (i % 2) * 5} l4.5 7.5 h-9 z" fill="#fff"/></g>`).join("")}`;
    case 3:
      return `
        ${particles(26, 7, (r, i) => `<circle class="aa-twinkle" cx="${(r() * 400).toFixed(1)}" cy="${(r() * 80).toFixed(1)}" r="${(0.6 + r() * 1.1).toFixed(2)}" fill="#fff" style="animation-delay:${(-r() * 3).toFixed(2)}s;animation-duration:${(2 + (i % 4)).toFixed(1)}s"/>`)}
        <g class="aa-beam-l"><path d="M20 140 L-30 -10 L40 -10 Z" fill="url(#${u}-beam1)"/></g>
        <g class="aa-beam-r"><path d="M380 140 L360 -10 L430 -10 Z" fill="url(#${u}-beam2)"/></g>
        <path d="M200 0 V24" stroke="#bbb" stroke-width="1"/>
        <g><circle cx="200" cy="36" r="12" fill="#c9c9d6"/>
          <g clip-path="url(#${u}-ball)"><g class="aa-facets">${particles(48, 8, (_r, i) => `<rect x="${186 + (i % 8) * 4}" y="${22 + Math.floor(i / 8) * 4.6}" width="3.4" height="4" fill="${["#fff", "#9ad7ff", "#ff9af0", "#d6d6e6"][(i * 7) % 4]}"/>`)}</g></g>
          <circle cx="196" cy="31" r="3" fill="#fff" opacity=".9"/></g>
        ${particles(9, 9, (r, i) => {
          const x = 8 + i * 45 + r() * 8;
          const w = 30 + r() * 12;
          const hh = 26 + r() * 32;
          return `<rect x="${x}" y="${128 - hh}" width="${w}" height="${hh + 10}" fill="#1c1442"/>${particles(6, i + 20, (r2, k) => `<rect class="aa-twinkle" x="${x + 5 + (k % 2) * (w / 2 - 2)}" y="${128 - hh + 6 + Math.floor(k / 2) * 9}" width="6" height="4" rx="1" fill="${["#ff4fd8", "#4fe3ff", "#ffe04f"][(k + i) % 3]}" style="animation-delay:${(-r2() * 3).toFixed(2)}s;animation-duration:${(1.4 + r2() * 2).toFixed(2)}s"/>`)}`;
        })}
        <g transform="translate(150 132)">${particles(10, 11, (_r, i) => `<rect class="aa-eq" x="${i * 10}" y="-18" width="7" height="18" rx="1.5" fill="${i % 2 ? "#4fe3ff" : "#ff4fd8"}" style="animation-delay:${-i * 0.13}s"/>`)}</g>`;
    case 4:
      return `
        <path d="M-10 118 L40 96 L90 110 L140 88 L190 108 L230 96 V140 H-10 Z" fill="#3d150f"/>
        <g class="aa-glow"><ellipse cx="304" cy="56" rx="30" ry="14" fill="#ff7a1a" opacity=".45" filter="url(#${u}-glow)"/></g>
        <path d="M206 138 L288 56 L320 56 L402 138 Z" fill="#3a1410"/>
        <path d="M288 56 L270 74 L282 72 L296 60 Z" fill="#552015"/>
        <path d="M288 56 Q304 62 320 56 Q304 50 288 56 Z" fill="#ffb03a"/>
        <path class="aa-glow" d="M300 58 Q296 80 286 96 Q282 108 272 118 M310 58 Q316 84 326 100" stroke="#ff6a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${[0, 1, 2].map((i) => `<circle class="aa-smoke" cx="${300 + i * 6}" cy="48" r="7" fill="#5a4a48" style="animation-delay:${-i * 1.6}s"/>`).join("")}
        <path d="M-10 128 Q90 112 200 124 T410 122 V150 H-10 Z" fill="${p.ground}"/>`;
    default:
      return "";
  }
}

function weather(id: number): string {
  switch (id) {
    case 0:
      return particles(9, 21, (r, i) => `<ellipse class="aa-fall aa-leaf" cx="${(r() * 400).toFixed(0)}" cy="-8" rx="3" ry="1.6" fill="${["#e9a03b", "#d9662b", "#9bc94a"][i % 3]}" style="animation-duration:${(7 + r() * 5).toFixed(1)}s;animation-delay:${(-r() * 10).toFixed(1)}s"/>`);
    case 2:
      return particles(34, 22, (r) => `<circle class="aa-fall" cx="${(r() * 400).toFixed(0)}" cy="-6" r="${(0.9 + r() * 1.5).toFixed(2)}" fill="#fff" opacity="${(0.6 + r() * 0.4).toFixed(2)}" style="animation-duration:${(5 + r() * 5).toFixed(1)}s;animation-delay:${(-r() * 10).toFixed(1)}s"/>`);
    case 3:
      return particles(7, 23, (r, i) => `<text class="aa-rise" x="${(40 + r() * 320).toFixed(0)}" y="200" font-size="${(10 + r() * 6).toFixed(0)}" fill="${["#ff4fd8", "#4fe3ff", "#ffe04f"][i % 3]}" style="animation-duration:${(4 + r() * 3).toFixed(1)}s;animation-delay:${(-r() * 7).toFixed(1)}s">${i % 2 ? "♪" : "♫"}</text>`);
    case 4:
      return particles(22, 24, (r) => `<circle class="aa-rise" cx="${(r() * 400).toFixed(0)}" cy="215" r="${(0.8 + r() * 1.4).toFixed(2)}" fill="${r() > 0.5 ? "#ffb03a" : "#ff5a1a"}" style="animation-duration:${(3 + r() * 4).toFixed(1)}s;animation-delay:${(-r() * 7).toFixed(1)}s"/>`);
    default:
      return "";
  }
}

function fights(id: number, u: string): string {
  const bl: [number, number] = [226, 190];
  const rd: [number, number] = [174, 190];
  const fromL = "M112 132 Q168 84 226 190";
  const fromR = "M288 132 Q232 84 174 190";
  switch (id) {
    case 1:
      return shot(CANNONBALL, fromL, bl, 2.6, 0.3, "#fff", false) + shot(CANNONBALL, fromR, rd, 2.6, 1.6, "#fff", false);
    case 2:
      return shot(SNOWBALL, fromL, bl, 2.4, 0.2, "#e6f6ff", false) + shot(SNOWBALL, fromR, rd, 2.4, 1.4, "#e6f6ff", false);
    case 3:
      return shot(ORB("#4fe3ff", `${u}-glow`), fromL, bl, 2.2, 0.2, "#4fe3ff", false) + shot(ORB("#ff4fd8", `${u}-glow`), fromR, rd, 2.2, 1.3, "#ff4fd8", false);
    case 4:
      return (
        shot(FIREBALL, "M304 52 Q250 -20 150 196", [150, 196], 3.2, 0.1, "#ff8a2a") +
        shot(FIREBALL, "M306 52 Q300 -10 250 202", [250, 202], 3.2, 1.7, "#ff8a2a") +
        shot(ARROW(BLUE), fromL, bl, 2.4, 0.8, "#ffd36a") +
        shot(ARROW(RED), fromR, rd, 2.4, 2.0, "#ffd36a")
      );
    default:
      return shot(ARROW(BLUE), fromL, bl, 2.2, 0.2, "#fff") + shot(ARROW(RED), fromR, rd, 2.2, 1.3, "#fff");
  }
}

export function arenaArt(arena: number, opts: { still?: boolean } = {}): SVGSVGElement {
  const id = Math.max(0, Math.min(PAL.length - 1, arena));
  const p = PAL[id];
  const u = `aa${++uid}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 400 220");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("class", `arena-art aa-theme-${id}${opts.still ? " aa-still" : ""}`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <defs>
      <linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
      <linearGradient id="${u}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22b6d8"/><stop offset="1" stop-color="#0b86b0"/></linearGradient>
      <linearGradient id="${u}-beam1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".55"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></linearGradient>
      <linearGradient id="${u}-beam2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4fe3ff" stop-opacity=".5"/><stop offset="1" stop-color="#4fe3ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${u}-river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.water}"/><stop offset="1" stop-color="${p.waterLight}"/></linearGradient>
      <clipPath id="${u}-head"><circle r="6.6"/></clipPath>
      <clipPath id="${u}-ball"><circle cx="200" cy="36" r="12"/></clipPath>
      <filter id="${u}-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <rect width="400" height="220" fill="url(#${u}-sky)"/>
    ${backdrop(id, p, u)}
    <path d="M-10 220 V150 Q200 126 410 150 V220 Z" fill="${p.groundDark}"/>
    <path d="M-10 220 V156 Q200 134 410 156 V220 Z" fill="${p.ground}"/>
    <path d="M78 146 H322 L372 214 H28 Z" fill="${p.pitch}"/>
    <path d="M78 146 H322 L372 214 H28 Z" fill="none" stroke="${p.pitchEdge}" stroke-width="2" opacity=".55"/>
    <path d="M191 146 H209 L220 214 H180 Z" fill="url(#${u}-river)" class="${id >= 3 ? "aa-glow" : ""}"/>
    <path class="aa-shimmer" d="M196 150 L192 212 M204 150 L208 212" stroke="${p.waterLight}" stroke-width="1.4" stroke-dasharray="4 9" opacity=".8"/>
    <path d="M179 172 H221 L223 184 H177 Z" fill="${p.wood}"/>
    <path d="M179 172 H221 L221.6 175.5 H178.4 Z" fill="#fff" opacity=".18"/>
    <path d="M186 172 V184 M193 172 V184 M200 172 V184 M207 172 V184 M214 172 V184" stroke="#000" stroke-width=".8" opacity=".25"/>
    ${tower(112, 186, BLUE, p, false)}
    ${tower(288, 186, RED, p, true)}
    ${unit("aa-walk-l", p.heads[0], BLUE, `${u}-head`)}
    ${unit("aa-walk-r", p.heads[1], RED, `${u}-head`)}
    ${fights(id, u)}
    ${weather(id)}
  `;
  if (opts.still || matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(() => svg.pauseAnimations?.());
  return svg;
}

/** Met en pause / relance toutes les animations d'une scène (SMIL + CSS). */
export function pauseArt(root: ParentNode, paused: boolean) {
  for (const svg of root.querySelectorAll<SVGSVGElement>("svg.arena-art")) {
    if (svg.classList.contains("aa-still")) continue;
    svg.classList.toggle("aa-paused", paused);
    if (paused) svg.pauseAnimations?.();
    else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) svg.unpauseAnimations?.();
  }
}
