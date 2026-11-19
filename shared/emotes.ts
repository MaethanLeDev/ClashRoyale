import type { CardId } from "./cards";

export interface EmoteDef {
  id: string;
  head: CardId;
  text: string;
  anim: "laugh" | "stamp" | "shock" | "rage" | "cry" | "vroom";
}

export const EMOTES: EmoteDef[] = [
  { id: "mdr", head: "valere", text: "MDR", anim: "laugh" },
  { id: "gg", head: "tordeux", text: "GG", anim: "stamp" },
  { id: "quoi", head: "niels", text: "QUOI ?!", anim: "shock" },
  { id: "grr", head: "midas", text: "GRRR", anim: "rage" },
  { id: "ouin", head: "natis", text: "OUIN", anim: "cry" },
  { id: "vroum", head: "tarit", text: "VROUM", anim: "vroom" },
];

export function emoteById(id: string): EmoteDef | undefined {
  return EMOTES.find((e) => e.id === id);
}
