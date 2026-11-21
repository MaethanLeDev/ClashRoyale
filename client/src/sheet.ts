import { icon } from "./icons";
import { h } from "./ui";

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
  readonly closed: boolean;
}

const stack: Sheet[] = [];

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) stack[stack.length - 1].close();
});

/**
 * Panneau qui monte du bas sur téléphone (fermeture en le tirant vers le bas)
 * et s'affiche au centre sur grand écran.
 */
export function openSheet(opts: {
  title?: string | Node;
  content: (Node | null | false)[];
  footer?: Node | null;
  cls?: string;
  onClose?: () => void;
}): Sheet {
  const parent = document.getElementById("ui")!;
  const closeBtn = h("button", { class: "icon-btn ghost", "aria-label": "Fermer" }, icon("x"));
  const head = h("header", { class: "sheet-head" }, h("div", { class: "sheet-grip" }), opts.title ? h("h2", {}, opts.title) : h("span"), closeBtn);
  const body = h("div", { class: "sheet-body" }, ...opts.content);
  const panel = h("div", { class: `sheet ${opts.cls ?? ""}`, role: "dialog", "aria-modal": "true" }, head, body, opts.footer ? h("footer", { class: "sheet-foot" }, opts.footer) : null);
  const backdrop = h("div", { class: "sheet-backdrop" }, panel);
  let closed = false;

  const sheet: Sheet = {
    el: panel,
    body,
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(sheet), 1);
      backdrop.classList.add("closing");
      panel.style.transform = "";
      setTimeout(() => backdrop.remove(), 230);
      opts.onClose?.();
    },
  };

  closeBtn.addEventListener("click", () => sheet.close());
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) sheet.close();
  });

  // Tirer vers le bas pour fermer (par la poignée / l'en-tête)
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button") || matchMedia("(min-width: 700px)").matches) return;
    const y0 = e.clientY;
    const t0 = performance.now();
    let dy = 0;
    panel.classList.add("dragging");
    head.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      dy = Math.max(0, ev.clientY - y0);
      panel.style.transform = `translateY(${dy}px)`;
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      head.removeEventListener("pointercancel", up);
      panel.classList.remove("dragging");
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 110 || (dy > 30 && v > 0.6)) sheet.close();
      else panel.style.transform = "";
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
    head.addEventListener("pointercancel", up);
  });

  parent.appendChild(backdrop);
  stack.push(sheet);
  return sheet;
}

export function closeAllSheets() {
  for (const s of stack.slice()) s.close();
}
