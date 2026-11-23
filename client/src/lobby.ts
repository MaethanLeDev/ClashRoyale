import { ARENAS } from "../../shared/arenas";
import { CARDS } from "../../shared/cards";
import type { Mode, RoomPlayer, Team } from "../../shared/protocol";
import { initial } from "./account";
import { arenaArt } from "./arenaArt";
import { DeckEditor } from "./deckEditor";
import { icon } from "./icons";
import { openSheet } from "./sheet";
import { app, buzz, net, on } from "./state";
import { cardEl, h, toast } from "./ui";

/** Écran de salon (combat amical), par-dessus les pages du menu. */
export class Lobby {
  el: HTMLElement;
  private body = h("div", { class: "lobby-body" });
  private foot = h("footer", { class: "lobby-foot" });
  private codeEl = h("b", { class: "lobby-code" });
  private art = h("div", { class: "lobby-art" });
  private artArena = -1;
  private seen = new Set<string>();
  private offs: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    const leave = () => net.send({ type: "leave" });
    this.el = h(
      "div",
      { class: "lobby" },
      h(
        "header",
        { class: "lobby-top" },
        h("button", { class: "icon-btn", "aria-label": "Quitter le salon", onclick: leave }, icon("back")),
        h("div", { class: "lobby-title" }, h("span", {}, "Salon"), this.codeEl),
        h("button", { class: "icon-btn", "aria-label": "Partager le code", onclick: () => this.share() }, icon("share")),
      ),
      h("div", { class: "lobby-scroll" }, this.body),
      this.foot,
    );
    parent.appendChild(this.el);
    this.offs.push(on("deck", () => this.update()));
  }

  destroy() {
    this.offs.forEach((o) => o());
    this.el.classList.add("leaving");
    setTimeout(() => this.el.remove(), 220);
  }

  private async share() {
    const room = app.room;
    if (!room) return;
    const url = location.origin;
    const text = `Rejoins mon salon USMB Arena avec le code ${room.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "USMB Arena", text, url });
        return;
      }
    } catch {
      /* partage annulé */
    }
    try {
      await navigator.clipboard.writeText(room.id);
      toast(document.getElementById("ui")!, `Code ${room.id} copié`, true);
    } catch {
      toast(document.getElementById("ui")!, `Code du salon : ${room.id}`, true);
    }
  }

  update() {
    const room = app.room;
    if (!room) return;
    const isHost = room.hostId === app.myId;
    const per = room.mode === "1v1" ? 1 : 2;
    const me = room.players.find((p) => p.id === app.myId);
    const arena = ARENAS[room.arena] ?? ARENAS[0];
    this.codeEl.textContent = room.id;

    if (this.artArena !== arena.id) {
      this.artArena = arena.id;
      this.art.replaceChildren(arenaArt(arena.id));
    }

    const player = (p: RoomPlayer) =>
      h(
        "div",
        { class: `lb-player${p.id === app.myId ? " me" : ""}${this.seen.has(p.id) ? "" : " new"}` },
        h("div", { class: `avatar t${p.team}${p.bot ? " bot" : ""}` }, p.bot ? icon("bot") : initial(p.name)),
        h("div", { class: "lb-name" }, h("b", {}, p.name, p.id === app.myId ? h("small", {}, " (toi)") : null), p.account ? h("span", { class: "lb-acc", title: "Compte" }, icon("lock")) : null),
        p.id === room.hostId
          ? h("span", { class: "tag host" }, "Hôte")
          : p.bot
            ? h("span", { class: "tag" }, "Bot")
            : h("span", { class: `tag ${p.ready ? "ready" : "wait"}` }, p.ready ? icon("check") : null, p.ready ? "Prêt" : "Pas prêt"),
      );
    const team = (t: Team) => {
      const players = room.players.filter((p) => p.team === t);
      const slots: HTMLElement[] = players.map(player);
      while (slots.length < per) slots.push(h("div", { class: "lb-player empty" }, h("div", { class: "avatar ghost" }, icon("plus")), h("div", { class: "lb-name" }, h("span", {}, "Place libre"), h("small", {}, "sinon un bot"))));
      return h("div", { class: `lb-team t${t}` }, h("div", { class: "lb-team-name" }, t === 0 ? "Équipe bleue" : "Équipe rouge"), ...slots);
    };

    const modeSeg = h(
      "div",
      { class: `segmented${isHost ? "" : " readonly"}` },
      ...(["1v1", "2v2"] as Mode[]).map((m) =>
        h("button", { class: room.mode === m ? "on" : "", disabled: !isHost ? "true" : undefined, onclick: () => isHost && room.mode !== m && net.send({ type: "mode", mode: m }) }, m),
      ),
    );

    queueMicrotask(() => room.players.forEach((p) => this.seen.add(p.id)));
    const avg = app.deck.reduce((s, c) => s + CARDS[c].cost, 0) / app.deck.length;
    this.body.replaceChildren(
      h(
        "div",
        { class: "lobby-hero" },
        this.art,
        h(
          "div",
          { class: "lobby-hero-cap" },
          h("span", { class: "arena-num" }, `Arène ${arena.id + 1}`),
          h("span", { class: "arena-name" }, arena.name),
          room.botStyle ? h("span", { class: "bot-style" }, icon("bot"), `${room.botStyle.label} · ${room.botStyle.description}`) : null,
        ),
      ),
      h("div", { class: "lb-row" }, h("span", { class: "field-label" }, "Mode"), modeSeg),
      h("div", { class: "lb-teams" }, team(0), h("div", { class: "lb-vs" }, "VS"), team(1)),
      h(
        "div",
        { class: "lb-tools" },
        h("button", { class: "chip-btn", onclick: () => net.send({ type: "team" }) }, icon("swap"), "Changer d'équipe"),
        isHost ? h("button", { class: "chip-btn", "aria-label": "Ajouter un bot", onclick: () => net.send({ type: "addBot" }) }, icon("plus"), "Bot") : null,
        isHost ? h("button", { class: "chip-btn", "aria-label": "Retirer un bot", onclick: () => net.send({ type: "removeBot" }) }, icon("minus"), "Bot") : null,
      ),
      h(
        "button",
        { class: "lb-deck", onclick: () => this.editDeck(!!me?.ready) },
        h("div", { class: "lb-deck-head" }, h("b", {}, "Ton deck"), h("span", { class: "avg-chip" }, icon("coffee"), avg.toFixed(1)), h("span", { class: "lb-edit" }, icon("edit"), "Modifier")),
        h("div", { class: "mini-deck" }, ...app.deck.map((c) => cardEl(c, { showName: false }))),
      ),
    );

    const waiting = room.players.filter((p) => !p.bot && p.id !== room.hostId && !p.ready).map((p) => p.name);
    if (isHost) {
      const btn = h("button", { class: "btn gold block big", onclick: () => (buzz(15), net.send({ type: "start" })) }, "Lancer la partie") as HTMLButtonElement;
      if (waiting.length) btn.disabled = true;
      this.foot.replaceChildren(btn, h("div", { class: "foot-hint" }, waiting.length ? `En attente de : ${waiting.join(", ")}` : "Les places vides seront complétées par des bots."));
    } else {
      const ready = !!me?.ready;
      this.foot.replaceChildren(
        h("button", { class: `btn block big ${ready ? "ghost" : "gold"}`, onclick: () => (buzz(), net.send({ type: "ready", ready: !ready })) }, ready ? icon("check") : null, ready ? "Prêt ! (annuler)" : "Je suis prêt"),
        h("div", { class: "foot-hint" }, ready ? "L'hôte lance la partie dès que tout le monde est prêt." : "Vérifie ton deck, puis indique que tu es prêt."),
      );
    }
  }

  private editDeck(wasReady: boolean) {
    if (wasReady) net.send({ type: "ready", ready: false });
    const editor = new DeckEditor({ embedded: true, title: h("span") });
    const sheet = openSheet({
      cls: "deck-sheet",
      title: "Ton deck",
      content: [editor.el],
      footer: h("button", { class: "btn gold block", onclick: () => sheet.close() }, "Terminé"),
      onClose: () => editor.dispose(),
    });
    editor.setScroller(sheet.body);
  }
}
