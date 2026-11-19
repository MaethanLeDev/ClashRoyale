import type { EmoteDef } from "../../shared/emotes";

export function emoteEl(def: EmoteDef, small: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = `emote emote-${def.anim}${small ? " small" : ""}`;
  const head = document.createElement("img");
  head.src = `/heads/${def.head}.png`;
  head.alt = "";
  head.draggable = false;
  head.className = "emote-head";
  root.append(head);
  if (def.anim === "cry") {
    for (const side of ["l", "r"]) {
      const tear = document.createElement("span");
      tear.className = `tear ${side}`;
      root.append(tear);
    }
  }
  if (def.anim === "rage") {
    for (let i = 0; i < 3; i++) {
      const puff = document.createElement("span");
      puff.className = `puff p${i}`;
      root.append(puff);
    }
  }
  if (def.anim === "laugh") {
    for (let i = 0; i < 2; i++) {
      const d = document.createElement("span");
      d.className = `drop d${i}`;
      root.append(d);
    }
  }
  if (def.anim === "vroom") {
    for (let i = 0; i < 3; i++) {
      const l = document.createElement("span");
      l.className = `speed s${i}`;
      root.append(l);
    }
  }
  const text = document.createElement("div");
  text.className = "emote-text";
  text.textContent = def.text;
  root.append(text);
  return root;
}
