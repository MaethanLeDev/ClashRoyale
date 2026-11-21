import { CARDS, type CardId } from "../../shared/cards";
import { MAX_ELIXIR, RESOURCE_NAME } from "../../shared/constants";
import type { PlayerSnap, StateMsg, Team } from "../../shared/protocol";
import { cardEl, crownSvg, h, toast } from "./ui";
import { getTilt, onTilt, setTilt } from "./settings";
import { icon } from "./icons";

export interface HudOptions {
  team: Team;
  myId: string;
  players: PlayerSnap[];
  onCardDown(card: CardId, e: PointerEvent): void;
  onEmote(emote: string): void;
  onBack(): void;
  backLabel?: string;
}

import { EMOTES } from "../../shared/emotes";
import { emoteEl } from "./emotes";

export class Hud {
  root: HTMLDivElement;
  overlay: HTMLDivElement;
  private bottom: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private slotCards: (CardId | null)[] = [null, null, null, null];
  private nextWrap: HTMLDivElement;
  private nextCard: CardId | null = null;
  private fill: HTMLDivElement;
  private dropNum: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private timerLbl: HTMLDivElement;
  private timerVal: HTMLDivElement;
  private allyCrowns: HTMLSpanElement;
  private enemyCrowns: HTMLSpanElement;
  private dbl: HTMLDivElement;
  private countdown: HTMLDivElement;
  private emoteMenu: HTMLDivElement | null = null;
  private lastEmote = 0;
  private settingsPanel: HTMLDivElement | null = null;
  private offTilt: (() => void) | null = null;
  private lastPhase = "";
  private lastCount = -1;
  private elixir = 0;
  private selected: CardId | null = null;
  private ended = false;

  constructor(parent: HTMLElement, private opts: HudOptions) {
    this.overlay = h("div", { class: "hud", style: { pointerEvents: "none" } });
    this.allyCrowns = h("span", {}, "0");
    this.enemyCrowns = h("span", {}, "0");
    this.timerLbl = h("div", { class: "lbl" }, "Temps");
    this.timerVal = h("div", { class: "val" }, "3:00");
    this.timerEl = h("div", { class: "timer" }, this.timerLbl, this.timerVal);
    const top = h(
      "div",
      { class: "hud-top" },
      h("div", { class: "crowns ally" }, crownSvg("#ffd84a"), this.allyCrowns),
      this.timerEl,
      h("div", { class: "crowns enemy" }, this.enemyCrowns, crownSvg("#ffd84a")),
    );
    this.dbl = h("div", { class: "dbl-badge" }, `${RESOURCE_NAME} x2`);
    this.dbl.style.display = "none";

    const allies = opts.players.filter((p) => p.tm === opts.team);
    const enemies = opts.players.filter((p) => p.tm !== opts.team);
    const names = (list: PlayerSnap[], cls: string, side: string) =>
      h("div", { class: `names ${side}` }, ...list.map((p) => h("div", { class: cls }, p.id === opts.myId ? `${p.name} (toi)` : p.name)));

    this.countdown = h("div", { class: "countdown" });

    this.nextWrap = h("div", { class: "next" }, h("div", { class: "lbl" }, "Suivante"));
    const handRow = h("div", { class: "hand-row" }, this.nextWrap);
    for (let i = 0; i < 4; i++) {
      const slot = h("div", { class: "card" });
      slot.addEventListener("pointerdown", (e) => {
        const card = this.slotCards[i];
        if (!card || this.ended) return;
        e.preventDefault();
        opts.onCardDown(card, e);
      });
      handRow.appendChild(slot);
      this.slots.push(slot);
    }
    this.fill = h("div", { class: "fill", style: { width: "0%" } });
    this.dropNum = h("div", { class: "drop" }, "0");
    const ticks = h("div", { class: "ticks" }, ...Array.from({ length: 10 }, () => h("span")));
    const emoteBtn = h("button", { class: "emote-btn", title: "Émotes", onclick: () => this.toggleEmotes() }, "💬");
    const settingsBtn = h("button", { class: "emote-btn settings-btn", title: "Caméra", onclick: () => this.toggleSettings() }, icon("camera"));
    this.bottom = h(
      "div",
      { class: "hud-bottom" },
      emoteBtn,
      settingsBtn,
      handRow,
      h("div", { class: "elixir" }, this.dropNum, h("div", { class: "bar" }, this.fill, ticks, h("div", { class: "rname" }, RESOURCE_NAME))),
    );

    this.root = h(
      "div",
      { class: "hud" },
      this.overlay,
      top,
      this.dbl,
      names(allies, "t-ally", "left"),
      names(enemies, "t-enemy", "right"),
      this.countdown,
      this.bottom,
    );
    parent.appendChild(this.root);
  }

  bottomHeight(): number {
    return this.bottom.getBoundingClientRect().height || 190;
  }

  topHeight(): number {
    return 70;
  }

  private toggleEmotes() {
    if (this.emoteMenu) {
      this.emoteMenu.remove();
      this.emoteMenu = null;
      return;
    }
    this.emoteMenu = h(
      "div",
      { class: "emote-menu" },
      ...EMOTES.map((e) =>
        h("button", {
          class: "emote-choice",
          title: e.text,
          onclick: () => {
            const now = performance.now();
            if (now - this.lastEmote < 1500) return;
            this.lastEmote = now;
            this.opts.onEmote(e.id);
            this.toggleEmotes();
          },
        }, emoteEl(e, true)),
      ),
    );
    this.bottom.appendChild(this.emoteMenu);
  }

  private toggleSettings() {
    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
      this.offTilt?.();
      this.offTilt = null;
      return;
    }
    const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(getTilt() * 100)) }) as HTMLInputElement;
    slider.addEventListener("input", () => setTilt(Number(slider.value) / 100));
    this.offTilt = onTilt((t) => (slider.value = String(Math.round(t * 100))));
    this.settingsPanel = h(
      "div",
      { class: "settings-panel" },
      h("div", { class: "lbl" }, "Caméra"),
      h("div", { class: "tilt-row" }, h("span", {}, "Vue du dessus"), slider, h("span", {}, "Immersive")),
    );
    this.bottom.appendChild(this.settingsPanel);
  }

  setSelected(card: CardId | null, dragging: boolean) {
    this.selected = card;
    for (const [i, slot] of this.slots.entries()) {
      const isSel = card !== null && this.slotCards[i] === card;
      slot.classList.toggle("selected", isSel && !dragging);
      slot.classList.toggle("dragging", isSel && dragging);
    }
  }

  toast(msg: string) {
    toast(this.root, msg);
  }

  update(s: StateMsg) {
    for (let i = 0; i < 4; i++) {
      const card = s.hand[i] ?? null;
      if (card !== this.slotCards[i]) {
        this.slotCards[i] = card;
        const slot = this.slots[i];
        slot.replaceChildren();
        if (card) {
          const fresh = cardEl(card);
          slot.dataset.rarity = fresh.dataset.rarity;
          slot.dataset.card = card;
          slot.style.setProperty("--focus", fresh.style.getPropertyValue("--focus"));
          slot.append(...Array.from(fresh.childNodes));
          slot.classList.remove("swap");
          void slot.offsetWidth;
          slot.classList.add("swap");
        }
      }
      const c = card ? CARDS[card] : null;
      this.slots[i].classList.toggle("disabled", !!c && s.el < c.cost);
    }
    if (this.selected) this.setSelected(this.selected, this.slots.some((x) => x.classList.contains("dragging")));
    if (s.next !== this.nextCard) {
      this.nextCard = s.next;
      this.nextWrap.querySelector(".card")?.remove();
      if (s.next) this.nextWrap.appendChild(cardEl(s.next, { showName: false }));
    }
    this.elixir = s.el;
    this.fill.style.width = `${(Math.min(MAX_ELIXIR, s.el) / MAX_ELIXIR) * 100}%`;
    this.dropNum.textContent = String(Math.floor(s.el));

    const me = this.opts.team;
    this.allyCrowns.textContent = String(s.crowns[me]);
    this.enemyCrowns.textContent = String(s.crowns[me === 0 ? 1 : 0]);

    if (s.phase === "countdown") {
      if (s.left !== this.lastCount) {
        this.lastCount = s.left;
        this.countdown.replaceChildren(h("span", {}, String(Math.max(1, s.left))));
      }
    } else if (this.lastPhase === "countdown") {
      this.countdown.replaceChildren(h("span", {}, "C'est parti !"));
      this.countdown.style.fontSize = "clamp(48px, 12vw, 110px)";
      setTimeout(() => this.countdown.replaceChildren(), 900);
    }
    if (s.phase === "tiebreak" && this.lastPhase !== "tiebreak") {
      this.countdown.style.fontSize = "clamp(40px, 10vw, 90px)";
      this.countdown.replaceChildren(h("span", {}, "Départage !"));
      setTimeout(() => this.countdown.replaceChildren(), 1600);
    }
    if (s.phase === "overtime" && this.lastPhase === "playing") {
      this.countdown.style.fontSize = "clamp(40px, 10vw, 90px)";
      this.countdown.replaceChildren(h("span", {}, "Prolongations !"));
      setTimeout(() => this.countdown.replaceChildren(), 1400);
    }
    this.lastPhase = s.phase;

    const left = s.phase === "countdown" ? 180 : s.left;
    const m = Math.floor(left / 60);
    const sec = left % 60;
    this.timerVal.textContent = `${m}:${String(sec).padStart(2, "0")}`;
    this.timerLbl.textContent = s.phase === "tiebreak" ? "Départage" : s.phase === "overtime" ? "Prolongations" : "Temps";
    this.timerEl.classList.toggle("urgent", s.phase !== "countdown" && left <= 30);
    this.dbl.style.display = s.dbl ? "" : "none";
  }

  showEnd(winner: Team | -1, crowns: [number, number], trophies?: { delta: number; total: number }) {
    if (this.ended) return;
    this.ended = true;
    this.emoteMenu?.remove();
    this.settingsPanel?.remove();
    const me = this.opts.team;
    const them = me === 0 ? 1 : 0;
    const res = winner === -1 ? "draw" : winner === me ? "win" : "lose";
    const title = res === "win" ? "Victoire !" : res === "lose" ? "Défaite…" : "Égalité";
    let delay = 0.5;
    const side = (n: number, color: string) =>
      h(
        "div",
        { class: "side" },
        ...[0, 1, 2].map((i) => {
          const s = crownSvg(color);
          if (i >= n) s.classList.add("crown-off");
          else {
            s.classList.add("crown-pop");
            s.style.animationDelay = `${(delay += 0.22)}s`;
          }
          return s;
        }),
      );
    const letters = h("div", { class: `end-title ${res}` }, ...[...title].map((ch, i) => {
      const span = h("span", { class: "letter" }, ch === " " ? "\u00a0" : ch);
      span.style.animationDelay = `${i * 0.05}s`;
      return span;
    }));
    const mine = side(crowns[me], "#5aa8ff");
    const theirs = side(crowns[them], "#ff6b6b");
    const count = h("span", {}, trophies ? String(trophies.total - trophies.delta) : "");
    const trophyEl = trophies
      ? h(
          "div",
          { class: `end-trophies ${trophies.delta > 0 ? "up" : trophies.delta < 0 ? "down" : ""}` },
          `🏆 ${trophies.delta > 0 ? "+" : ""}${trophies.delta}`,
          h("small", {}, count, " trophées"),
        )
      : null;
    const btn = h("button", { class: "btn gold big end-btn", onclick: () => this.opts.onBack() }, this.opts.backLabel ?? "Retour au salon");
    const card = h(
      "div",
      { class: "end-card" },
      letters,
      h("div", { class: "end-crowns" }, mine, h("span", {}, `${crowns[me]} - ${crowns[them]}`), theirs),
      trophyEl,
      btn,
    );
    const screen = h("div", { class: `end-screen ${res}` }, card);
    this.root.appendChild(screen);
    if (res === "win") this.confetti(screen);
    if (trophies && trophyEl) {
      const from = trophies.total - trophies.delta;
      const startAt = performance.now() + (delay + 0.4) * 1000;
      const tick = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - startAt) / 900));
        count.textContent = String(Math.round(from + (trophies.total - from) * (1 - (1 - k) ** 3)));
        if (k < 1 && screen.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  private confetti(parent: HTMLElement) {
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    parent.prepend(canvas);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (canvas.width = parent.clientWidth * dpr);
    const H = (canvas.height = parent.clientHeight * dpr);
    const g = canvas.getContext("2d")!;
    const colors = ["#ffd84a", "#5aa8ff", "#ff6bd6", "#7cff8a", "#ffffff", "#ff8a3a"];
    const parts = Array.from({ length: 160 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.45,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (-8 - Math.random() * 12) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      s: (5 + Math.random() * 6) * dpr,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.globalAlpha = Math.max(0, 1 - t / 4.5);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
      if (t < 4.5 && canvas.isConnected) requestAnimationFrame(frame);
      else canvas.remove();
    };
    requestAnimationFrame(frame);
  }

  destroy() {
    this.offTilt?.();
    this.root.remove();
  }
}
