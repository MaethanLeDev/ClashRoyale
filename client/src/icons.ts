// Icônes SVG maison (traits 24×24, couleur héritée) + quelques icônes « jeu » pleines.

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

const STROKE: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-.5A6.5 6.5 0 0 1 8.5 14h1a6.5 6.5 0 0 1 6.5 6.5v.5"/><path d="M16 4.2a4 4 0 0 1 0 7.6"/><path d="M22 21v-.5a6 6 0 0 0-4-5.6"/>',
  cards: '<rect x="3" y="5" width="11" height="16" rx="2"/><path d="M17.5 5.5l1.9.5a2 2 0 0 1 1.4 2.5l-3 11"/><path d="M8.5 10.5v5M6 13h5"/>',
  swords:
    '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4"/><path d="M7 17l-3 3"/><path d="M3 19l2 2"/>',
  camera: '<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="M16 10.5 22 7v10l-6-3.5z"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5v-5"/><path d="M12 7.6v.01" stroke-width="2.6"/>',
  swap: '<path d="M7 3 3 7l4 4"/><path d="M3 7h13a4 4 0 0 1 4 4"/><path d="M17 21l4-4-4-4"/><path d="M21 17H8a4 4 0 0 1-4-4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3.5"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13.5v1M15 13.5v1"/><path d="M1.5 13v3M22.5 13v3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  lock: '<rect x="4.5" y="11" width="15" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19h8a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7h8"/>',
  door: '<path d="M14 3H6a1 1 0 0 0-1 1v17h10"/><path d="M14 3l5 2v16l-5 0z"/><path d="M11 12v.01" stroke-width="2.6"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-7a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11.5v-5a1.5 1.5 0 0 1 3 0v7"/><path d="M17 13.5V10a1.5 1.5 0 0 1 3 0v4.5a7 7 0 0 1-7 7h-1.2a7 7 0 0 1-5.4-2.6L3.6 15.4a1.6 1.6 0 0 1 2.4-2.1L8 15"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/>',
};

export type IconName = keyof typeof STROKE | "trophy" | "coffee" | "crown";

export function icon(name: IconName, cls = ""): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `ico ico-${name} ${cls}`.trim());
  if (name in STROKE) {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = STROKE[name];
  } else if (name === "trophy") {
    svg.innerHTML =
      '<path fill="#ffd24a" stroke="#7a4a00" stroke-width="1.3" stroke-linejoin="round" d="M7 2.8h10V5h3.2a.8.8 0 0 1 .8.8v1.6a4.6 4.6 0 0 1-4.1 4.6 5.6 5.6 0 0 1-3.7 3V17h2.4c.9 0 1.6.7 1.6 1.6v2.6H7v-2.6C7 17.7 7.7 17 8.6 17H11v-2a5.6 5.6 0 0 1-3.7-3A4.6 4.6 0 0 1 3 7.4V5.8a.8.8 0 0 1 .8-.8H7V2.8Zm10 4.1v3.2a2.6 2.6 0 0 0 2-2.6v-.6h-2ZM5 6.9v.6a2.6 2.6 0 0 0 2 2.6V6.9H5Z"/><path fill="#fff3b0" opacity=".85" d="M9.2 4.4h1.5v6.8a3.6 3.6 0 0 1-1.5-2.4z"/>';
  } else if (name === "coffee") {
    const gid = `ico-coffee-${++uid}`;
    svg.innerHTML =
      `<path fill="none" stroke="#f4d6b0" stroke-width="1.6" stroke-linecap="round" d="M8.5 1.8c-.9.9-.9 2.1 0 3M12.5 1.8c-.9.9-.9 2.1 0 3"/><path fill="#7a3f12" stroke="#2b1405" stroke-width="1.2" d="M17 10h1.6a2.8 2.8 0 0 1 0 5.6H17"/><path fill="url(#${gid})" stroke="#2b1405" stroke-width="1.2" stroke-linejoin="round" d="M3.5 7.5h14v6.8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path fill="#f4d6b0" opacity=".9" d="M4.5 8.5h12v1.6h-12z"/><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a35d"/><stop offset="1" stop-color="#9a5420"/></linearGradient></defs>`;
  } else if (name === "crown") {
    svg.innerHTML =
      '<path fill="#ffd24a" stroke="#7a4a00" stroke-width="1.3" stroke-linejoin="round" d="M3 17.5h18l1.4-9.6-5.4 3.8-5-7-5 7-5.4-3.8z"/><rect x="3" y="18.8" width="18" height="2.6" rx="1" fill="#ffd24a" stroke="#7a4a00" stroke-width="1.1"/>';
  }
  return svg;
}
