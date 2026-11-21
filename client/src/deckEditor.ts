import { CARD_IDS, CARDS, type CardDef, type CardId } from "../../shared/cards";
import { RESOURCE_NAME } from "../../shared/constants";
import { createShowcase, hasShowcase, type Showcase } from "./game/showcase";
import { icon } from "./icons";
import { openSheet } from "./sheet";
import { app, buzz, on, setDeck } from "./state";
import { cardEl, h } from "./ui";

// ---------- Fiche d'une carte ----------

function fmt(v: number, unit = "") {
  return `${Math.round(v * 100) / 100}${unit}`;
}

function cardStats(c: CardDef): [string, string][] {
  const out: [string, string][] = [];
  if (c.unit) {
    const u = c.unit;
    out.push(["Points de vie", String(u.hp)]);
    out.push(["Dégâts", u.towerKiller ? "Rase la tour" : String(u.damage)]);
    if (!u.towerKiller) out.push(["Dégâts/s", fmt(u.damage / u.hitSpeed)]);
    out.push(["Vitesse d'attaque", fmt(u.hitSpeed, " s")]);
    out.push(["Portée", u.range >= 2 ? fmt(u.range) : "Mêlée"]);
    if (u.speed > 0) out.push(["Vitesse", u.speed >= 1.5 ? "Très rapide" : u.speed >= 1.1 ? "Rapide" : u.speed >= 0.7 ? "Moyenne" : "Très lente"]);
    out.push(["Cible", u.targetsBuildingsOnly ? "Bâtiments" : "Sol"]);
    if (c.count > 1) out.push(["Nombre", `x${c.count}`]);
    if (u.lifetime) out.push(["Durée de vie", `${u.lifetime} s`]);
  }
  if (c.spell) {
    out.push(["Dégâts", String(c.spell.damage)]);
    out.push(["Dégâts aux tours", String(c.spell.towerDamage)]);
    out.push(["Gel", `${c.spell.freeze} s`]);
    out.push(["Rayon", fmt(c.spell.radius)]);
  }
  if (c.deployAnywhere) out.push(["Placement", "N'importe où"]);
  return out;
}

export function showCardSheet(id: CardId, action?: { label: string; run: () => void }) {
  const c = CARDS[id];
  let showcase: Showcase | null = null;
  const stage = hasShowcase(id) ? h("div", { class: "showcase" }, h("span", { class: "showcase-hint" }, icon("hand"), "Glisse pour tourner")) : null;
  const sheet = openSheet({
    cls: "card-sheet",
    title: c.name,
    content: [
      stage,
      h(
        "div",
        { class: "ci-head" },
        cardEl(id),
        h(
          "div",
          { class: "ci-meta" },
          h("div", { class: "ci-title" }, c.title),
          h("div", { class: "chips" }, h("span", { class: `chip rarity r-${c.rarity}` }, c.rarity), h("span", { class: "chip" }, c.role)),
          h("div", { class: "ci-cost" }, icon("coffee"), h("b", {}, String(c.cost)), h("span", {}, RESOURCE_NAME)),
        ),
      ),
      h("p", { class: "ci-desc" }, c.description),
      h("div", { class: "stats" }, ...cardStats(c).map(([k, v]) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)))),
    ],
    footer: action
      ? h(
          "button",
          {
            class: "btn gold block",
            onclick: () => {
              sheet.close();
              action.run();
            },
          },
          action.label,
        )
      : null,
    onClose: () => showcase?.dispose(),
  });
  if (stage) requestAnimationFrame(() => (showcase = createShowcase(stage, id)));
}

// ---------- Éditeur de deck ----------

type Zone = "deck" | "col";

interface Pending {
  id: CardId;
  zone: Zone;
  slot: HTMLElement;
  x: number;
  y: number;
  pointerId: number;
  timer: number;
}

interface Drag {
  id: CardId;
  zone: Zone;
  slot: HTMLElement;
  ghost: HTMLElement;
  dx: number;
  dy: number;
  x: number;
  y: number;
  lastX: number;
  target: HTMLElement | null;
  raf: number;
}

let touchBlockerInstalled = false;
let activeDrag = false;

function installTouchBlocker() {
  if (touchBlockerInstalled) return;
  touchBlockerInstalled = true;
  // Pendant un glisser-déposer, empêcher le navigateur de faire défiler la page ou le carrousel.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (activeDrag && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
}

export class DeckEditor {
  el: HTMLElement;
  private scroller: HTMLElement | null = null;
  private deckGrid = h("div", { class: "dk-grid dk-deck" });
  private colGrid = h("div", { class: "dk-grid dk-col" });
  private avgVal = h("b");
  private avgMeter = h("div", { class: "avg-meter" }, ...Array.from({ length: 10 }, () => h("i")));
  private banner = h("div", { class: "dk-banner", hidden: "true" });
  private colCount = h("span", { class: "count" });
  private selected: { id: CardId; zone: Zone } | null = null;
  /** Carte en attente d'échange (après « Utiliser » ou « Échanger »). */
  private swapping: { id: CardId; zone: Zone } | null = null;
  private pending: Pending | null = null;
  private drag: Drag | null = null;
  private off: () => void;

  constructor(opts: { title?: Node; embedded?: boolean } = {}) {
    installTouchBlocker();
    this.el = h(
      "div",
      { class: `deck-editor${opts.embedded ? " embedded" : ""}` },
      h(
        "header",
        { class: "page-head dk-head" },
        opts.title ?? h("h1", {}, "Mon deck"),
        h("div", { class: "avg", title: `${RESOURCE_NAME} moyenne` }, icon("coffee"), h("div", {}, this.avgVal, h("span", {}, `${RESOURCE_NAME} moy.`)), this.avgMeter),
      ),
      h("p", { class: "dk-hint" }, icon("hand"), "Touche une carte, ou fais-la glisser sur une autre pour l'échanger."),
      h("section", { class: "dk-frame" }, h("div", { class: "dk-frame-label" }, h("span", {}, "Deck de combat")), this.banner, this.deckGrid),
      h("div", { class: "section-title" }, h("span", {}, "Collection"), this.colCount),
      this.colGrid,
    );
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    // Toucher à côté : on retire la sélection / on annule l'échange
    this.el.addEventListener("pointerdown", (e) => {
      const t = e.target as Element;
      if (t.closest(".dk-slot, .dk-pop, .dk-banner")) return;
      if (this.selected || this.swapping) {
        this.selected = null;
        this.swapping = null;
        this.render();
      }
    });
    this.off = on("deck", () => this.render());
    this.render();
  }

  /** Conteneur qui défile (pour le défilement automatique pendant un glisser). */
  setScroller(el: HTMLElement) {
    this.scroller = el;
  }

  dispose() {
    this.off();
    this.cancelPending();
    this.endDrag(false);
  }

  deselect() {
    if (!this.selected && !this.swapping) return;
    this.selected = null;
    this.swapping = null;
    this.render();
  }

  render(changed: number[] = []) {
    const deck = app.deck;
    const sel = this.selected;
    const sw = this.swapping;
    this.el.classList.toggle("has-sel", !!sel || !!sw);
    this.deckGrid.replaceChildren(
      ...deck.map((id, i) => {
        const s = this.slot(id, "deck", i);
        if (changed.includes(i)) s.classList.add("dk-pop-in");
        if (sw && sw.zone === "col") s.classList.add("dk-wiggle");
        return s;
      }),
    );
    const col = CARD_IDS.filter((c) => !deck.includes(c));
    this.colGrid.replaceChildren(
      ...col.map((id, i) => {
        const s = this.slot(id, "col", i);
        if (sw && sw.zone === "deck") s.classList.add("dk-wiggle");
        return s;
      }),
    );
    if (!col.length) this.colGrid.append(h("div", { class: "empty" }, "Toutes tes cartes sont dans ton deck."));
    this.colCount.textContent = `${col.length} carte${col.length > 1 ? "s" : ""}`;
    const avg = deck.reduce((s, c) => s + CARDS[c].cost, 0) / Math.max(1, deck.length);
    this.avgVal.textContent = avg.toFixed(1);
    [...this.avgMeter.children].forEach((m, i) => m.classList.toggle("on", i < Math.round(avg)));
    this.avgMeter.parentElement?.classList.toggle("heavy", avg >= 4.5);

    if (sw) {
      const c = CARDS[sw.id];
      this.banner.hidden = false;
      this.banner.replaceChildren(
        cardEl(sw.id, { showName: false }),
        h("span", {}, sw.zone === "col" ? h("b", {}, `${c.name} → `) : null, sw.zone === "col" ? "touche la carte du deck à remplacer" : `Choisis une carte de la collection pour remplacer ${c.name}`),
        h("button", { class: "icon-btn ghost", "aria-label": "Annuler", onclick: () => this.deselect() }, icon("x")),
      );
    } else this.banner.hidden = true;
  }

  private slot(id: CardId, zone: Zone, index: number): HTMLElement {
    const card = cardEl(id);
    const isSel = this.selected?.id === id;
    const isSwap = this.swapping?.id === id;
    const slot = h("div", { class: `dk-slot${isSel ? " dk-sel" : ""}${isSwap ? " dk-swapping" : ""}`, dataset: { card: id, zone, index: String(index) } }, card);
    if (isSel) {
      const info = h("button", { class: "dk-btn", onclick: () => this.info(id, zone) }, icon("info"), "Infos");
      const use =
        zone === "col"
          ? h("button", { class: "dk-btn gold", onclick: () => this.startSwap(id, zone) }, icon("swap"), "Utiliser")
          : h("button", { class: "dk-btn", onclick: () => this.startSwap(id, zone) }, icon("swap"), "Échanger");
      slot.append(h("div", { class: "dk-pop" }, info, use));
    }
    card.addEventListener("pointerdown", (e) => this.down(e, id, zone, slot));
    return slot;
  }

  private info(id: CardId, zone: Zone) {
    this.selected = null;
    this.render();
    showCardSheet(id, { label: zone === "col" ? "Utiliser dans le deck" : "Échanger cette carte", run: () => this.startSwap(id, zone) });
  }

  private startSwap(id: CardId, zone: Zone) {
    this.selected = null;
    this.swapping = { id, zone };
    buzz();
    this.render();
    const target = zone === "col" ? this.deckGrid : this.colGrid;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  private tap(id: CardId, zone: Zone) {
    const sw = this.swapping;
    if (sw) {
      if (sw.zone !== zone || zone === "deck") {
        if (sw.id !== id) {
          this.apply(sw.id, sw.zone, id, zone);
          return;
        }
      }
      this.swapping = null;
      this.render();
      return;
    }
    if (this.selected?.id === id) this.selected = null;
    else {
      this.selected = { id, zone };
      buzz(6);
    }
    this.render();
  }

  /** Échange deux cartes ; renvoie les index du deck modifiés. */
  private apply(a: CardId, za: Zone, b: CardId, zb: Zone) {
    const deck = app.deck.slice();
    const changed: number[] = [];
    if (za === "deck" && zb === "deck") {
      const i = deck.indexOf(a);
      const j = deck.indexOf(b);
      [deck[i], deck[j]] = [deck[j], deck[i]];
      changed.push(i, j);
    } else if (za === "deck" || zb === "deck") {
      const inDeck = za === "deck" ? a : b;
      const incoming = za === "deck" ? b : a;
      const i = deck.indexOf(inDeck);
      deck[i] = incoming;
      changed.push(i);
    } else return;
    this.selected = null;
    this.swapping = null;
    buzz(12);
    setDeck(deck); // déclenche render() via l'événement « deck »
    this.render(changed);
  }

  // ----- Glisser-déposer -----

  private down(e: PointerEvent, id: CardId, zone: Zone, slot: HTMLElement) {
    if (e.button !== 0 || this.drag) return;
    this.cancelPending();
    // Souris : on glisse tout de suite. Doigt : appui long, ou carte déjà sélectionnée (touch-action: none en CSS).
    const immediate = e.pointerType === "mouse" || this.selected?.id === id;
    const p: Pending = { id, zone, slot, x: e.clientX, y: e.clientY, pointerId: e.pointerId, timer: 0 };
    this.pending = p;
    if (!immediate) p.timer = window.setTimeout(() => this.startDrag(p, p.x, p.y), 280);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointerId) return;
      if (this.drag) return this.moveDrag(ev.clientX, ev.clientY);
      const d = Math.hypot(ev.clientX - p.x, ev.clientY - p.y);
      if (immediate && d > 6) this.startDrag(p, ev.clientX, ev.clientY);
      else if (!immediate && d > 10) this.cancelPending(); // c'est un défilement
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointerId) return;
      cleanup();
      if (this.drag) return this.endDrag(ev.type === "pointerup");
      const wasPending = this.pending === p;
      this.cancelPending();
      if (wasPending && ev.type === "pointerup") this.tap(id, zone);
    };
    const cleanup = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  }

  private cancelPending() {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private startDrag(p: Pending, x: number, y: number) {
    if (this.pending !== p) return;
    this.cancelPending();
    const card = p.slot.querySelector<HTMLElement>(".card")!;
    const r = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add("dk-ghost");
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.appendChild(ghost);
    p.slot.classList.add("dk-src");
    this.selected = null;
    this.el.querySelector(".dk-pop")?.remove();
    this.el.querySelector(".dk-sel")?.classList.remove("dk-sel");
    document.body.classList.add("is-dragging");
    activeDrag = true;
    buzz(14);
    this.drag = { id: p.id, zone: p.zone, slot: p.slot, ghost, dx: p.x - r.left, dy: p.y - r.top, x, y, lastX: x, target: null, raf: 0 };
    this.el.classList.add("dragging", `drag-from-${p.zone}`);
    this.moveDrag(x, y);
    const loop = () => {
      const d = this.drag;
      if (!d) return;
      this.autoScroll(d.y);
      d.raf = requestAnimationFrame(loop);
    };
    this.drag.raf = requestAnimationFrame(loop);
  }

  private autoScroll(y: number) {
    const sc = this.scroller;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const edge = 70;
    if (y < r.top + edge) sc.scrollTop -= Math.ceil((r.top + edge - y) / 6);
    else if (y > r.bottom - edge - 70) sc.scrollTop += Math.ceil((y - (r.bottom - edge - 70)) / 6);
  }

  private moveDrag(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const vx = x - d.lastX;
    d.lastX = x;
    d.x = x;
    d.y = y;
    const tilt = Math.max(-10, Math.min(10, vx * 0.8));
    d.ghost.style.transform = `translate3d(${x - d.dx - parseFloat(d.ghost.style.left)}px, ${y - d.dy - parseFloat(d.ghost.style.top)}px, 0) rotate(${tilt}deg) scale(1.1)`;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(".dk-slot") ?? null;
    let target: HTMLElement | null = null;
    if (hit && hit !== d.slot && this.el.contains(hit)) {
      const z = hit.dataset.zone as Zone;
      if (d.zone === "deck" || z === "deck") target = hit;
    }
    if (target !== d.target) {
      d.target?.classList.remove("dk-target");
      target?.classList.add("dk-target");
      if (target) buzz(5);
      d.target = target;
    }
  }

  private endDrag(drop: boolean) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    activeDrag = false;
    cancelAnimationFrame(d.raf);
    document.body.classList.remove("is-dragging");
    this.el.classList.remove("dragging", "drag-from-deck", "drag-from-col");
    d.target?.classList.remove("dk-target");
    const target = drop ? d.target : null;
    const dest = (target ?? d.slot).querySelector<HTMLElement>(".card")!.getBoundingClientRect();
    d.ghost.classList.add("settling");
    d.ghost.style.transform = `translate3d(${dest.left - parseFloat(d.ghost.style.left)}px, ${dest.top - parseFloat(d.ghost.style.top)}px, 0) scale(1)`;
    const finish = () => {
      d.ghost.remove();
      d.slot.classList.remove("dk-src");
      if (target) this.apply(d.id, d.zone, target.dataset.card as CardId, target.dataset.zone as Zone);
    };
    setTimeout(finish, 170);
  }
}
