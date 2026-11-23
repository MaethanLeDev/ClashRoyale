import { ARENAS, arenaFor, TROPHY_LOSS, TROPHY_WIN } from "../../shared/arenas";
import { STYLES } from "../../shared/ai/styles";
import { arenaArt } from "./arenaArt";
import { icon } from "./icons";
import { createPreview, type Preview } from "./preview";
import { getTilt, onTilt, setTilt } from "./settings";
import { closeAllSheets, openSheet, type Sheet } from "./sheet";
import { app, hello, net, on, setName, store } from "./state";
import { h, toast } from "./ui";

const ui = () => document.getElementById("ui")!;

export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

// ---------- Pseudo obligatoire avant de jouer ----------

export function requireName(then: () => void) {
  if (!app.connected) {
    toast(ui(), "Serveur injoignable, on réessaie…");
    return;
  }
  if (app.name.trim()) {
    hello();
    then();
    return;
  }
  const input = h("input", { class: "input", type: "text", maxlength: "16", placeholder: "Ton pseudo", autocomplete: "nickname", enterkeyhint: "go" }) as HTMLInputElement;
  const go = () => {
    const v = input.value.trim();
    if (!v) {
      input.focus();
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 400);
      return;
    }
    setName(v);
    sheet.close();
    hello();
    then();
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  const sheet = openSheet({
    title: "Comment on t'appelle ?",
    content: [
      h("p", { class: "muted" }, "Choisis un pseudo pour entrer dans l'arène. Tu pourras créer un compte plus tard pour garder tes trophées."),
      input,
      h("button", { class: "link-btn", onclick: () => (sheet.close(), openAuth("login")) }, "J'ai déjà un compte"),
    ],
    footer: h("button", { class: "btn gold block", onclick: go }, "C'est parti"),
  });
  setTimeout(() => input.focus(), 250);
}

// ---------- Compte ----------

export function openAccount() {
  let sheet: Sheet;
  const body = h("div", { class: "account" });
  const render = () => {
    const p = app.profile;
    const guest = !app.account;
    const pseudo = h("input", { class: "input", type: "text", maxlength: "16", placeholder: "Ton pseudo", value: app.name, autocomplete: "nickname" }) as HTMLInputElement;
    pseudo.addEventListener("change", () => {
      setName(pseudo.value);
      hello();
    });
    const arena = arenaFor(p.trophies);
    const parts: (Node | null)[] = [
      h(
        "div",
        { class: "acc-head" },
        h("div", { class: `avatar xl${guest ? " guest" : ""}` }, app.name ? initial(app.name) : icon("user")),
        h(
          "div",
          {},
          h("div", { class: "acc-name" }, app.name || "Sans pseudo"),
          h("div", { class: "chips" }, guest ? h("span", { class: "chip" }, "Invité") : h("span", { class: "chip ok" }, icon("lock"), "Compte protégé"), h("span", { class: "chip" }, `Arène ${arena.id + 1}`)),
        ),
      ),
      guest
        ? h(
            "div",
            { class: "acc-guest" },
            h("label", { class: "field-label" }, "Pseudo"),
            pseudo,
            h("p", { class: "muted small" }, "En invité, tes trophées sont liés à ce pseudo. Crée un compte pour le protéger par un mot de passe et retrouver ton deck partout."),
            h(
              "div",
              { class: "row2" },
              h("button", { class: "btn ghost", onclick: () => openAuth("login") }, icon("login"), "Connexion"),
              h("button", { class: "btn", onclick: () => openAuth("register") }, "Créer un compte"),
            ),
          )
        : null,
      h(
        "div",
        { class: "acc-stats" },
        stat(icon("trophy"), String(p.trophies), "Trophées"),
        stat(icon("crown"), String(p.best), "Record"),
        stat(null, String(p.wins), "Victoires", "win"),
        stat(null, String(p.losses), "Défaites", "loss"),
      ),
      h(
        "div",
        { class: "menu-list" },
        row(icon("route"), "Voie des trophées", "Les arènes et leurs paliers", () => openRoad()),
        row(icon("camera"), "Caméra en jeu", "Vue du dessus ou immersive", () => openCamera()),
        guest ? null : row(icon("logout"), "Se déconnecter", null, () => (doLogout(), sheet.close()), "danger"),
      ),
    ];
    body.replaceChildren(...parts.filter((p): p is Node => !!p));
  };
  render();
  const offs = [on("profile", render), on("auth", render)];
  sheet = openSheet({ title: "Profil", content: [body], cls: "account-sheet", onClose: () => offs.forEach((o) => o()) });
}

function stat(ic: Node | null, value: string, label: string, cls = ""): HTMLElement {
  return h("div", { class: `acc-stat ${cls}` }, h("div", { class: "v" }, ic, value), h("div", { class: "k" }, label));
}

function row(ic: Node, title: string, sub: string | null, onclick: () => void, cls = ""): HTMLElement {
  return h("button", { class: `menu-row ${cls}`, onclick }, h("span", { class: "mr-ico" }, ic), h("span", { class: "mr-text" }, h("b", {}, title), sub ? h("small", {}, sub) : null), icon("next", "mr-chev"));
}

function doLogout() {
  net.send({ type: "logout", token: store.get("authToken") ?? undefined });
  store.remove("authToken");
  setName("");
}

// ---------- Connexion / inscription ----------

let auth: { sheet: Sheet; error: HTMLElement; busy: (b: boolean) => void } | null = null;

export function openAuth(mode: "login" | "register") {
  auth?.sheet.close();
  const name = h("input", { class: "input", type: "text", maxlength: "16", placeholder: "Pseudo", value: app.name, autocomplete: "username" }) as HTMLInputElement;
  const pass = h("input", { class: "input", type: "password", placeholder: "Mot de passe", autocomplete: mode === "login" ? "current-password" : "new-password" }) as HTMLInputElement;
  const confirm = h("input", { class: "input", type: "password", placeholder: "Confirme le mot de passe", autocomplete: "new-password" }) as HTMLInputElement;
  const error = h("div", { class: "form-error", role: "alert" });
  const submitBtn = h("button", { class: "btn gold block" }, mode === "login" ? "Se connecter" : "Créer le compte") as HTMLButtonElement;
  const submit = () => {
    error.textContent = "";
    if (!app.connected) {
      error.textContent = "Serveur injoignable pour l'instant";
      return;
    }
    if (mode === "register" && pass.value !== confirm.value) {
      error.textContent = "Les deux mots de passe ne sont pas identiques";
      return;
    }
    submitBtn.disabled = true;
    net.send({ type: mode, name: name.value, password: pass.value });
  };
  submitBtn.addEventListener("click", submit);
  for (const input of [name, pass, confirm]) input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  const seg = h(
    "div",
    { class: "segmented" },
    h("button", { class: mode === "login" ? "on" : "", onclick: () => mode !== "login" && openAuth("login") }, "Connexion"),
    h("button", { class: mode === "register" ? "on" : "", onclick: () => mode !== "register" && openAuth("register") }, "Créer un compte"),
  );
  const sheet = openSheet({
    title: mode === "login" ? "Connexion" : "Nouveau compte",
    content: [
      seg,
      h(
        "p",
        { class: "muted" },
        mode === "login"
          ? "Retrouve tes trophées et ton deck depuis n'importe quel appareil."
          : "Ton pseudo sera protégé par un mot de passe. Tes trophées d'invité sont repris si tu gardes le même pseudo.",
      ),
      h("div", { class: "form" }, name, pass, mode === "register" ? confirm : null, error),
    ],
    footer: submitBtn,
    onClose: () => {
      if (auth?.sheet === sheet) auth = null;
    },
  });
  auth = { sheet, error, busy: (b) => (submitBtn.disabled = b) };
  setTimeout(() => (app.name ? pass : name).focus(), 250);
}

export function authFailed(msg: string): boolean {
  if (!auth) return false;
  auth.error.textContent = msg;
  auth.busy(false);
  return true;
}

export function authSucceeded() {
  auth?.sheet.close();
  auth = null;
}

// ---------- Entraînement contre un bot précis ----------

export interface PracticeBotInfo {
  id: string;
  arena: number;
  label: string;
  description: string;
}

/** Un bot par arène : le classique en arène 1, puis les cerveaux entraînés. */
export const PRACTICE_BOTS: PracticeBotInfo[] = [
  { id: "classic", arena: 0, label: "Bot classique", description: "Le bot écrit à la main, celui du Campus. Idéal pour tester un deck." },
  ...STYLES.map((s) => ({ id: s.id, arena: s.arena, label: s.label, description: s.description })),
].sort((a, b) => a.arena - b.arena);

export function botForArena(arena: number): PracticeBotInfo | undefined {
  return PRACTICE_BOTS.find((b) => b.arena === arena);
}

/** Partie d'entraînement 1v1 contre ce bot, à pleine puissance, sans trophées en jeu. */
export function startPractice(botId: string) {
  requireName(() => {
    closeAllSheets();
    net.send({ type: "practice", bot: botId });
  });
}

function practiceBtn(botId: string): HTMLElement {
  return h(
    "button",
    {
      class: "chip-btn practice-btn",
      onclick: (e: Event) => {
        e.stopPropagation();
        startPractice(botId);
      },
    },
    icon("swords"),
    "S'entraîner",
  );
}

// ---------- Voie des trophées ----------

export function openRoad() {
  const t = app.profile.trophies;
  const steps: HTMLElement[] = [];
  [...ARENAS].reverse().forEach((a) => {
    const next = ARENAS[a.id + 1];
    const unlocked = t >= a.trophies;
    const current = unlocked && (!next || t < next.trophies);
    const frac = next ? Math.max(0, Math.min(1, (t - a.trophies) / (next.trophies - a.trophies))) : 1;
    const bot = botForArena(a.id);
    const art = h("div", { class: "road-art" }, arenaArt(a.id, { still: !current }), unlocked ? null : h("div", { class: "road-lock" }, icon("lock")));
    const step = h(
      "div",
      { class: `road-step${unlocked ? "" : " locked"}${current ? " current" : ""}` },
      art,
      h(
        "div",
        { class: "road-info" },
        h("div", { class: "road-num" }, `Arène ${a.id + 1}`, current ? h("span", { class: "chip ok" }, "Tu es ici") : null),
        h("div", { class: "road-name" }, a.name),
        h("div", { class: "road-tag" }, a.tagline),
        h(
          "div",
          { class: "road-foot" },
          h("span", { class: "road-req" }, icon("trophy"), String(a.trophies)),
          bot ? h("span", { class: "road-bot" }, icon("bot"), bot.label) : null,
        ),
        bot ? practiceBtn(bot.id) : null,
      ),
    );
    if (unlocked) {
      step.addEventListener("click", () => openPreview3d(a.id));
      step.setAttribute("role", "button");
      step.title = "Aperçu 3D";
    }
    if (next) {
      const link = h("div", { class: "road-link" }, h("div", { class: "fill" }));
      (link.firstChild as HTMLElement).style.height = `${frac * 100}%`;
      steps.push(link);
    }
    steps.push(step);
  });
  // arène la plus haute en haut, comme une route qu'on gravit
  const list = h("div", { class: "road" }, ...steps);
  openSheet({
    title: "Voie des trophées",
    cls: "road-sheet",
    content: [
      h("div", { class: "road-summary" }, icon("trophy"), h("b", {}, String(t)), h("span", { class: "muted" }, ` · victoire +${TROPHY_WIN}, défaite −${TROPHY_LOSS} (moitié contre des bots)`)),
      h("p", { class: "muted small road-hint" }, "« S'entraîner » lance un duel contre le bot de l'arène, à sa puissance maximale. Aucun trophée en jeu, même pour les arènes pas encore débloquées."),
      list,
    ],
  });
  requestAnimationFrame(() => list.querySelector(".current")?.scrollIntoView({ block: "center" }));
}

function openPreview3d(arena: number) {
  let preview: Preview | null = null;
  const box = h("div", { class: "preview-box wide" });
  openSheet({ title: ARENAS[arena].name, content: [box], onClose: () => preview?.dispose() });
  requestAnimationFrame(() => (preview = createPreview(box, arena)));
}

// ---------- Caméra ----------

export function openCamera() {
  let preview: Preview | null = null;
  const box = h("div", { class: "preview-box" });
  const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(getTilt() * 100)), "aria-label": "Inclinaison de la caméra" }) as HTMLInputElement;
  slider.addEventListener("input", () => setTilt(Number(slider.value) / 100));
  const off = onTilt((v) => (slider.value = String(Math.round(v * 100))));
  openSheet({
    title: "Caméra en jeu",
    content: [
      box,
      h("div", { class: "tilt-row" }, h("span", {}, "Du dessus"), slider, h("span", {}, "Immersive")),
      h("p", { class: "muted small" }, "Sur PC, la molette règle aussi la caméra en pleine partie."),
    ],
    onClose: () => {
      off();
      preview?.dispose();
    },
  });
  requestAnimationFrame(() => (preview = createPreview(box, arenaFor(app.profile.trophies).id)));
}
