import { ARENAS, arenaFor } from "../../shared/arenas";
import type { Mode, RoomInfo } from "../../shared/protocol";
import { initial, openAccount, openRoad, PRACTICE_BOTS, requireName, startPractice } from "./account";
import { arenaArt, pauseArt } from "./arenaArt";
import { DeckEditor } from "./deckEditor";
import { icon } from "./icons";
import { Lobby } from "./lobby";
import { closeAllSheets } from "./sheet";
import { app, buzz, net, on, setMode } from "./state";
import { h, toast } from "./ui";

const PAGES = [
  { key: "deck", label: "Deck", ico: "cards" },
  { key: "home", label: "Combat", ico: "swords" },
  { key: "friends", label: "Amis", ico: "users" },
] as const;

/** Les trois pages qui se balayent (Deck ← Combat → Amis) + la barre d'onglets. */
export class Menu {
  root: HTMLElement;
  private pager: HTMLElement;
  private pages: HTMLElement[];
  private tabs: HTMLButtonElement[];
  private indicator: HTMLElement;
  private index = 1;
  private deck: DeckEditor;
  private lobby: Lobby | null = null;
  private playBtn!: HTMLButtonElement;
  private prevBtn: HTMLElement;
  private nextBtn: HTMLElement;

  constructor(parent: HTMLElement) {
    this.deck = new DeckEditor();
    const deckPage = h("section", { class: "page page-deck", "aria-label": "Deck" }, h("div", { class: "page-inner" }, this.deck.el));
    this.deck.setScroller(deckPage);
    this.pages = [deckPage, this.buildHome(), this.buildFriends()];
    this.pager = h("main", { class: "pager" }, ...this.pages);
    this.indicator = h("span", { class: "tab-ind" });
    this.tabs = PAGES.map((p, i) =>
      h("button", { class: "tab", "aria-label": p.label, onclick: () => this.goTo(i) }, icon(p.ico), h("span", {}, p.label)),
    ) as HTMLButtonElement[];
    const tabbar = h("nav", { class: "tabbar" }, h("div", { class: "tabbar-in" }, this.indicator, ...this.tabs));
    // Sur PC (souris), des flèches sur les côtés remplacent le balayage
    this.prevBtn = h("button", { class: "edge-nav prev", onclick: () => this.goTo(this.index - 1) }, icon("back"), h("span"));
    this.nextBtn = h("button", { class: "edge-nav next", onclick: () => this.goTo(this.index + 1) }, h("span"), icon("next"));
    this.root = h("div", { class: "menu" }, h("div", { class: "menu-bg" }), this.pager, this.prevBtn, this.nextBtn, tabbar);
    parent.prepend(this.root);

    let raf = 0;
    this.pager.addEventListener(
      "scroll",
      () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => this.onScroll());
      },
      { passive: true },
    );
    addEventListener("resize", () => this.goTo(this.index, false));
    addEventListener("keydown", (e) => {
      if (this.root.hidden || this.lobby || document.querySelector(".sheet-backdrop")) return;
      if ((e.target as Element).closest("input")) return;
      if (e.key === "ArrowLeft") this.goTo(Math.max(0, this.index - 1));
      if (e.key === "ArrowRight") this.goTo(Math.min(2, this.index + 1));
    });
    this.mouseSwipe();
    requestAnimationFrame(() => this.goTo(1, false));
    on("room", () => this.syncLobby());
  }

  /** Le défilement natif suit le doigt et le pavé tactile ; on ajoute le clic-glisser à la souris. */
  private mouseSwipe() {
    const pager = this.pager;
    pager.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as Element).closest("input, .dk-slot, .dk-pop, .code-wrap")) return;
      const x0 = e.clientX;
      const left0 = pager.scrollLeft;
      const start = this.index;
      let t = performance.now();
      let lastX = x0;
      let v = 0;
      let dragging = false;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        if (!dragging) {
          if (Math.abs(dx) < 8) return;
          dragging = true;
          pager.classList.add("mouse-drag");
        }
        const now = performance.now();
        v = (ev.clientX - lastX) / Math.max(1, now - t);
        lastX = ev.clientX;
        t = now;
        pager.scrollLeft = left0 - dx;
      };
      const up = (ev: PointerEvent) => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        if (!dragging) return;
        const dx = ev.clientX - x0;
        const w = pager.clientWidth;
        let target = start;
        if (dx < -w * 0.18 || v < -0.4) target = start + 1;
        else if (dx > w * 0.18 || v > 0.4) target = start - 1;
        target = Math.max(0, Math.min(2, target));
        pager.classList.remove("mouse-drag");
        this.goTo(target);
        // Le relâchement ne doit pas déclencher le bouton sous la souris
        addEventListener("click", (c) => (c.stopPropagation(), c.preventDefault()), { capture: true, once: true });
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    });
  }

  goTo(i: number, smooth = true) {
    const w = this.pager.clientWidth;
    this.pager.scrollTo({ left: i * w, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
    if (!smooth) this.onScroll();
  }

  private onScroll() {
    if (this.root.hidden || !this.pager.clientWidth) return;
    const w = this.pager.clientWidth;
    const pos = this.pager.scrollLeft / w;
    this.root.style.setProperty("--pos", pos.toFixed(3));
    const i = Math.round(pos);
    if (i !== this.index) {
      this.index = i;
      if (i !== 0) this.deck.deselect();
      pauseArt(this.pages[1], i !== 1);
    }
    this.tabs.forEach((t, k) => t.classList.toggle("on", k === i));
    const edge = (btn: HTMLElement, k: number) => {
      btn.hidden = k < 0 || k > 2;
      if (!btn.hidden) {
        btn.querySelector("span")!.textContent = PAGES[k].label;
        btn.setAttribute("aria-label", PAGES[k].label);
      }
    };
    edge(this.prevBtn, i - 1);
    edge(this.nextBtn, i + 1);
  }

  show() {
    const i = this.index;
    this.root.hidden = false;
    this.goTo(i, false);
    pauseArt(this.root, false);
    pauseArt(this.pages[1], i !== 1);
    this.syncLobby();
  }

  hide() {
    closeAllSheets();
    this.root.hidden = true;
    pauseArt(this.root, true);
    this.lobby?.destroy();
    this.lobby = null;
    this.setPlayBusy(false);
  }

  /** Ouvre / ferme l'écran de salon selon l'état du serveur. */
  syncLobby() {
    if (this.root.hidden) return;
    const room = app.room;
    if (room && !room.solo) {
      if (!this.lobby) {
        closeAllSheets();
        this.lobby = new Lobby(this.root);
      }
      this.lobby.update();
    } else if (this.lobby) {
      this.lobby.destroy();
      this.lobby = null;
    }
  }

  setPlayBusy(busy: boolean) {
    this.playBtn?.classList.toggle("busy", busy);
  }

  // ---------- Accueil ----------

  private buildHome(): HTMLElement {
    const trophyPill = h("button", { class: "pill trophy-pill", onclick: () => openRoad(), "aria-label": "Voie des trophées" }, icon("trophy"), h("b"));
    const avatar = h("button", { class: "avatar-btn", onclick: () => openAccount(), "aria-label": "Profil" });
    const artBox = h("div", { class: "arena-art-box" });
    const arenaNum = h("span", { class: "arena-num" });
    const arenaName = h("span", { class: "arena-name" });
    const arenaCard = h(
      "button",
      { class: "arena-card", onclick: () => openRoad(), "aria-label": "Voir les arènes" },
      artBox,
      h("div", { class: "arena-caption" }, h("div", {}, arenaNum, arenaName), h("span", { class: "arena-more" }, icon("route"))),
    );
    const fill = h("div", { class: "tp-fill" });
    const tpNow = h("span", { class: "tp-now" });
    const tpNext = h("span", { class: "tp-next" });
    const progress = h(
      "button",
      { class: "trophy-progress", onclick: () => openRoad(), "aria-label": "Progression des trophées" },
      h("div", { class: "tp-bar" }, fill, h("div", { class: "tp-text" }, icon("trophy"), tpNow)),
      tpNext,
    );
    const modeVal = h("span", { class: "mode-val" });
    const modeBtn = h("button", { class: "mode-btn", "aria-label": "Changer de mode" }, h("span", { class: "mode-lbl" }, "Mode"), modeVal, h("span", { class: "mode-dots" }));
    const playSub = h("span", { class: "play-sub" });
    this.playBtn = h(
      "button",
      {
        class: "play-btn",
        onclick: () =>
          requireName(() => {
            buzz(15);
            this.setPlayBusy(true);
            net.send({ type: "solo", mode: app.mode });
            setTimeout(() => this.setPlayBusy(false), 4000);
          }),
      },
      h("span", { class: "play-title" }, "Jouer"),
      playSub,
    ) as HTMLButtonElement;
    modeBtn.addEventListener("click", () => {
      const next: Mode = app.mode === "1v1" ? "2v2" : "1v1";
      setMode(next);
      buzz();
      modeBtn.classList.remove("flip");
      void modeBtn.offsetWidth;
      modeBtn.classList.add("flip");
    });

    const page = h(
      "section",
      { class: "page page-home", "aria-label": "Combat" },
      h(
        "div",
        { class: "page-inner home" },
        h("header", { class: "home-top" }, trophyPill, avatar),
        h("img", { class: "home-logo", src: "/logo.webp", alt: "USMB Arena", draggable: "false" }),
        h("div", { class: "home-center" }, arenaCard, progress),
        h("div", { class: "play-row" }, modeBtn, this.playBtn),
      ),
    );

    let shownArena = -1;
    const renderProfile = () => {
      const t = app.profile.trophies;
      const a = arenaFor(t);
      const next = ARENAS[a.id + 1];
      (trophyPill.lastChild as HTMLElement).textContent = String(t);
      if (app.name) avatar.replaceChildren(h("span", {}, initial(app.name)));
      else avatar.replaceChildren(icon("user"), h("i", { class: "dot" }));
      avatar.classList.toggle("account", !!app.account);
      if (a.id !== shownArena) {
        shownArena = a.id;
        artBox.replaceChildren(arenaArt(a.id));
        arenaCard.style.setProperty("--a1", a.colors[0]);
        arenaCard.style.setProperty("--a2", a.colors[1]);
      }
      arenaNum.textContent = `Arène ${a.id + 1}`;
      arenaName.textContent = a.name;
      if (next) {
        const frac = Math.max(0, Math.min(1, (t - a.trophies) / (next.trophies - a.trophies)));
        fill.style.width = `${Math.max(4, frac * 100)}%`;
        tpNow.textContent = `${t} / ${next.trophies}`;
        tpNext.replaceChildren(h("span", {}, "Prochaine : "), h("b", {}, next.name));
      } else {
        fill.style.width = "100%";
        tpNow.textContent = `${t}`;
        tpNext.replaceChildren(h("b", {}, "Arène ultime atteinte"), h("span", {}, ` · record ${app.profile.best}`));
      }
    };
    const renderMode = () => {
      modeVal.textContent = app.mode;
      modeBtn.dataset.mode = app.mode;
      playSub.textContent = app.mode === "1v1" ? "Duel contre un bot" : "Toi + 1 bot contre 2 bots";
    };
    renderProfile();
    renderMode();
    on("profile", renderProfile);
    on("auth", renderProfile);
    on("mode", renderMode);
    return page;
  }

  // ---------- Combats amicaux ----------

  private buildFriends(): HTMLElement {
    const create = (mode: Mode) => () => requireName(() => net.send({ type: "create", mode }));
    const code = h("input", {
      class: "code-input",
      type: "text",
      inputmode: "text",
      autocapitalize: "characters",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: "4",
      "aria-label": "Code du salon",
    }) as HTMLInputElement;
    const boxes = Array.from({ length: 4 }, () => h("span", { class: "code-box" }));
    const joinBtn = h("button", { class: "btn", disabled: "true" }, "Rejoindre") as HTMLButtonElement;
    const syncCode = () => {
      const v = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (v !== code.value) code.value = v;
      boxes.forEach((b, i) => {
        b.textContent = v[i] ?? "";
        b.classList.toggle("filled", !!v[i]);
        b.classList.toggle("caret", document.activeElement === code && i === Math.min(v.length, 3));
      });
      joinBtn.disabled = v.length !== 4;
    };
    const join = () => {
      const v = code.value.trim().toUpperCase();
      if (v.length !== 4) return toast(document.getElementById("ui")!, "Le code fait 4 caractères");
      requireName(() => net.send({ type: "join", roomId: v }));
    };
    code.addEventListener("input", syncCode);
    code.addEventListener("focus", syncCode);
    code.addEventListener("blur", syncCode);
    code.addEventListener("keydown", (e) => e.key === "Enter" && join());
    joinBtn.addEventListener("click", join);

    const list = h("div", { class: "room-list" });
    const count = h("span", { class: "count" });
    const renderRooms = () => {
      // Salons ouverts + toutes les parties en cours (même contre les bots) pour pouvoir les regarder
      const rooms = app.rooms.filter((r) => !r.solo || r.status === "playing");
      const open = rooms.filter((r) => r.status === "lobby");
      const playing = rooms.filter((r) => r.status === "playing");
      count.textContent = String(rooms.length);
      count.hidden = !rooms.length;
      if (!rooms.length) {
        list.replaceChildren(
          h(
            "div",
            { class: "empty-state" },
            h("div", { class: "es-ico" }, icon("swords")),
            h("b", {}, "Aucun salon pour l'instant"),
            h("span", {}, "Lance un duel et envoie le code à tes potes."),
          ),
        );
        return;
      }
      list.replaceChildren(...[...open, ...playing].map(roomRow));
    };
    const roomRow = (r: RoomInfo) => {
      const host = r.players.find((p) => p.id === r.hostId)?.name ?? "?";
      const cap = r.mode === "1v1" ? 2 : 4;
      const humans = r.players.filter((p) => !p.bot);
      const seats = Array.from({ length: cap }, (_, i) => {
        const p = r.players[i];
        if (!p) return h("span", { class: "seat empty" });
        return h("span", { class: `seat t${p.team}${p.bot ? " bot" : ""}`, title: p.name }, p.bot ? icon("bot") : initial(p.name));
      });
      const lobby = r.status === "lobby";
      return h(
        "div",
        { class: `room-row${lobby ? "" : " playing"}` },
        h("div", { class: "rr-code" }, r.id),
        h(
          "div",
          { class: "rr-info" },
          h("div", { class: "rr-title" }, lobby ? `Salon de ${host}` : r.players.map((p) => p.name).join(" vs ")),
          h(
            "div",
            { class: "rr-meta" },
            h("span", { class: `chip mode-${r.mode}` }, r.mode),
            h("span", { class: "seats" }, ...seats),
            lobby ? h("span", { class: "muted" }, `${humans.length}/${cap}`) : h("span", { class: "live" }, h("i"), "En jeu"),
            !lobby && r.spectators ? h("span", { class: "muted spec-count" }, icon("eye"), String(r.spectators)) : null,
          ),
        ),
        lobby
          ? h("button", { class: "btn small", onclick: () => requireName(() => net.send({ type: "join", roomId: r.id })) }, "Rejoindre")
          : h("button", { class: "btn small ghost", onclick: () => requireName(() => net.send({ type: "spectate", roomId: r.id })) }, icon("eye"), "Regarder"),
      );
    };
    renderRooms();
    on("rooms", renderRooms);

    return h(
      "section",
      { class: "page page-friends", "aria-label": "Combats amicaux" },
      h(
        "div",
        { class: "page-inner" },
        h("header", { class: "page-head" }, h("div", {}, h("h1", {}, "Combats amicaux"), h("p", {}, "Défie tes potes, ou rejoins leur salon."))),
        h(
          "div",
          { class: "fr-actions" },
          h("button", { class: "fr-tile duel", onclick: create("1v1") }, h("span", { class: "fr-ico" }, icon("swords")), h("b", {}, "Duel 1v1"), h("small", {}, "Crée un salon et partage le code")),
          h("button", { class: "fr-tile team", onclick: create("2v2") }, h("span", { class: "fr-ico" }, icon("users")), h("b", {}, "Équipe 2v2"), h("small", {}, "Les places vides seront des bots")),
        ),
        h(
          "div",
          { class: "fr-join" },
          h("div", { class: "field-label" }, "Rejoindre avec un code"),
          h("div", { class: "fr-join-row" }, h("label", { class: "code-wrap" }, ...boxes, code), joinBtn),
        ),
        h("div", { class: "section-title" }, h("span", {}, "Salons en cours"), count),
        list,
        h("div", { class: "section-title" }, h("span", {}, "Entraînement"), h("span", { class: "count" }, "sans trophées")),
        h(
          "div",
          { class: "practice-list" },
          ...PRACTICE_BOTS.map((b) =>
            h(
              "button",
              { class: "practice-row", onclick: () => startPractice(b.id) },
              h("div", { class: "practice-art" }, arenaArt(b.arena, { still: true })),
              h("div", { class: "practice-info" }, h("span", { class: "arena-num" }, `Arène ${b.arena + 1}`), h("b", {}, b.label), h("small", {}, b.description)),
              h("span", { class: "practice-go" }, icon("swords")),
            ),
          ),
        ),
      ),
    );
  }
}
