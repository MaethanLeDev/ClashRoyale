export interface ArenaDef {
  id: number;
  name: string;
  tagline: string;
  trophies: number;
  colors: [string, string];
  icon: string;
}

export const ARENAS: ArenaDef[] = [
  { id: 0, name: "Campus du Bourget", tagline: "Là où tout commence, entre l'amphi et le parking.", trophies: 0, colors: ["#4f9a3c", "#2b5f2a"], icon: "🏫" },
  { id: 1, name: "Plage du Lac", tagline: "Sable chaud, eau turquoise et parasols.", trophies: 300, colors: ["#3cc2d6", "#e0b56a"], icon: "🏖️" },
  { id: 2, name: "Station des Partiels", tagline: "Neige, sapins et révisions glaciales.", trophies: 600, colors: ["#bfe3ff", "#5b7fa8"], icon: "🏔️" },
  { id: 3, name: "Soirée BDE", tagline: "Néons, basses qui tapent et pelouse piétinée.", trophies: 1000, colors: ["#b14dff", "#1b1440"], icon: "🪩" },
  { id: 4, name: "Volcan des Rattrapages", tagline: "La dernière chance. Le sol est littéralement en lave.", trophies: 1500, colors: ["#ff6a1a", "#2a0d0a"], icon: "🌋" },
];

export const TROPHY_WIN = 30;
export const TROPHY_LOSS = 20;

export function arenaFor(trophies: number): ArenaDef {
  let current = ARENAS[0];
  for (const a of ARENAS) if (trophies >= a.trophies) current = a;
  return current;
}
