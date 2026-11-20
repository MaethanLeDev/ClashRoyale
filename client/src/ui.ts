import { CARDS, type CardId } from "../../shared/cards";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

const FOCUS: Record<CardId, string> = {
  valere: "50% 45%",
  goutier: "50% 8%",
  midas: "50% 35%",
  samy: "50% 10%",
  natis: "40% 12%",
  tordeux: "45% 14%",
  imad: "62% 10%",
  niels: "52% 42%",
  nazar: "45% 10%",
  tarit: "50% 30%",
  taritPilot: "50% 12%",
  savy: "45% 18%",
};

export function cardEl(id: CardId, opts: { showName?: boolean; small?: boolean } = {}): HTMLDivElement {
  const c = CARDS[id];
  const el = h(
    "div",
    { class: "card", dataset: { rarity: c.rarity, card: id }, style: { "--focus": FOCUS[id] } as Record<string, string> },
    h("img", { src: `/cards/${id}.png`, alt: c.name, draggable: "false", loading: "eager" }),
    h("div", { class: "shade" }),
    h("div", { class: "cost" }, String(c.cost)),
    opts.showName === false ? null : h("div", { class: "name" }, c.name),
  );
  el.style.setProperty("--focus", FOCUS[id]);
  return el;
}

export function crownSvg(color: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M3 18h18l1.5-10-5.5 4-5-7-5 7-5.5-4z");
  path.setAttribute("fill", color);
  path.setAttribute("stroke", "rgba(0,0,0,0.45)");
  path.setAttribute("stroke-width", "1.4");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  const base = document.createElementNS(ns, "rect");
  base.setAttribute("x", "3");
  base.setAttribute("y", "19");
  base.setAttribute("width", "18");
  base.setAttribute("height", "2.5");
  base.setAttribute("rx", "1");
  base.setAttribute("fill", color);
  svg.appendChild(base);
  return svg;
}

export function toast(parent: HTMLElement, msg: string, good = false) {
  const el = h("div", { class: "toast" }, msg);
  if (good) el.style.background = "rgba(40,140,70,0.92)";
  parent.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
