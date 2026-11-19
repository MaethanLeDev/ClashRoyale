export type CardId = "midas" | "valere" | "samy" | "tordeux" | "natis" | "goutier" | "imad" | "niels" | "nazar";

export type CardKind = "troop" | "building" | "spell";

export type Rarity = "commune" | "rare" | "épique" | "légendaire";

export interface UnitStats {
  hp: number;
  damage: number;
  hitSpeed: number;
  firstHit: number;
  speed: number;
  range: number;
  sight: number;
  radius: number;
  mass: number;
  targetsBuildingsOnly: boolean;
  projectile?: { speed: number; kind: string };
  towerKiller?: boolean;
  towerDamageMult?: number;
  height: number;
  lifetime?: number;
}

export interface SpellStats {
  radius: number;
  damage: number;
  towerDamage: number;
  freeze: number;
  delay: number;
}

export interface CardDef {
  id: CardId;
  kind: CardKind;
  name: string;
  title: string;
  description: string;
  cost: number;
  rarity: Rarity;
  role: string;
  count: number;
  spawnRadius: number;
  deployAnywhere: boolean;
  delivery?: "thrown" | "dig";
  unit?: UnitStats;
  spell?: SpellStats;
  look: {
    body: number;
    accent: number;
    scale: number;
    cape?: number;
    weapon?: "sword" | "dagger" | "finger" | "pickaxe";
    building?: boolean;
  };
}

export const CARDS: Record<CardId, CardDef> = {
  goutier: {
    id: "goutier",
    kind: "troop",
    name: "Goutier",
    title: "La Horde à Goutier",
    description: "Une nuée de Goutier en doudoune qui submerge tout ce qui passe. Fragiles, mais nombreux.",
    cost: 3,
    rarity: "épique",
    role: "Essaim",
    count: 10,
    spawnRadius: 1.3,
    deployAnywhere: false,
    unit: {
      hp: 85, damage: 70, hitSpeed: 1.0, firstHit: 0.3, speed: 1.6, range: 0.5, sight: 5.5,
      radius: 0.32, mass: 1, targetsBuildingsOnly: false, height: 0.9,
    },
    look: { body: 0x1b1e26, accent: 0x3a3f4d, scale: 0.6 },
  },
  midas: {
    id: "midas",
    kind: "troop",
    name: "Midas",
    title: "Midas le Fourbe",
    description: "Malicieux et sournois. Lancé depuis la tour principale, il atterrit n'importe où sur la carte… et ils sont trois.",
    cost: 3,
    rarity: "épique",
    role: "Infiltration",
    count: 3,
    spawnRadius: 0.6,
    deployAnywhere: true,
    delivery: "thrown",
    unit: {
      hp: 220, damage: 105, hitSpeed: 1.1, firstHit: 0.3, speed: 1.9, range: 0.6, sight: 5.5,
      radius: 0.4, mass: 2, targetsBuildingsOnly: false, height: 1.1,
    },
    look: { body: 0x2f5d3a, accent: 0xd4af37, scale: 0.8, weapon: "dagger" },
  },
  valere: {
    id: "valere",
    kind: "troop",
    name: "Valère",
    title: "Valère le Broyeur",
    description: "Le cauchemar des tanks. Il rigole, puis il frappe très, très fort.",
    cost: 4,
    rarity: "rare",
    role: "Anti-tank",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 1150, damage: 620, hitSpeed: 1.8, firstHit: 0.5, speed: 1.3, range: 0.8, sight: 5.5,
      radius: 0.55, mass: 5, targetsBuildingsOnly: false, height: 1.5,
    },
    look: { body: 0x4a4f63, accent: 0xff7a1a, scale: 1.05, weapon: "sword" },
  },
  tordeux: {
    id: "tordeux",
    kind: "troop",
    name: "Tordeux",
    title: "Tordeux le Doigt d'Or",
    description: "Il pointe, ça part. Tire de très loin depuis son index et encaisse pas mal de coups.",
    cost: 4,
    rarity: "rare",
    role: "Distance",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 760, damage: 150, hitSpeed: 1.2, firstHit: 0.4, speed: 1.0, range: 5.2, sight: 7,
      radius: 0.5, mass: 4, targetsBuildingsOnly: false, height: 1.5,
      projectile: { speed: 14, kind: "finger" },
    },
    look: { body: 0x4a1c24, accent: 0xffd54a, scale: 1, weapon: "finger" },
  },
  natis: {
    id: "natis",
    kind: "troop",
    name: "Natis",
    title: "Natis le Colosse",
    description: "Une montagne de sweat noir. Énormément de vie, et une seule obsession : les bâtiments.",
    cost: 5,
    rarity: "rare",
    role: "Tank",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 3500, damage: 220, hitSpeed: 1.5, firstHit: 0.5, speed: 0.8, range: 1, sight: 7.5,
      radius: 0.8, mass: 12, targetsBuildingsOnly: true, height: 2.2,
    },
    look: { body: 0x141414, accent: 0xd8d8d8, scale: 1.6 },
  },
  samy: {
    id: "samy",
    kind: "troop",
    name: "Super Samy",
    title: "Super Samy",
    description: "Il prend la moitié de l'écran et avance tranquillement. S'il touche une tour, elle est rasée, peu importe sa vie. Il faut tout lui mettre pour l'arrêter.",
    cost: 10,
    rarity: "légendaire",
    role: "Destructeur",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 8500, damage: 0, hitSpeed: 1.5, firstHit: 0.8, speed: 0.45, range: 0.6, sight: 9,
      radius: 1.4, mass: 100, targetsBuildingsOnly: true, height: 9, towerKiller: true,
    },
    look: { body: 0x1f5fd1, accent: 0xd62b2b, scale: 5, cape: 0xd62b2b },
  },
  imad: {
    id: "imad",
    kind: "building",
    name: "Imad",
    title: "Le QG d'Imad",
    description: "Imad réfléchit, puis il tire. Un bâtiment défensif qui attire les colosses qui visent les bâtiments et arrose tout ce qui approche.",
    cost: 4,
    rarity: "rare",
    role: "Bâtiment",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 1300, damage: 120, hitSpeed: 0.9, firstHit: 0.3, speed: 0, range: 6, sight: 6,
      radius: 1.1, mass: 1000, targetsBuildingsOnly: false, height: 2.6, lifetime: 35,
      projectile: { speed: 16, kind: "idea" },
    },
    look: { body: 0x8a7458, accent: 0x23263a, scale: 1, building: true },
  },
  niels: {
    id: "niels",
    kind: "spell",
    name: "Papy Niels",
    title: "Le Regard de Papy Niels",
    description: "Papy Niels écarquille les yeux. Tout ce qu'il fixe prend des dégâts et reste figé sur place.",
    cost: 3,
    rarity: "épique",
    role: "Sort",
    count: 0,
    spawnRadius: 0,
    deployAnywhere: true,
    spell: { radius: 3, damage: 160, towerDamage: 60, freeze: 2.5, delay: 0.7 },
    look: { body: 0x111111, accent: 0xffffff, scale: 1 },
  },
  nazar: {
    id: "nazar",
    kind: "troop",
    name: "Nazar",
    title: "Nazar le Mineur",
    description: "Il creuse un tunnel depuis ta tour principale et surgit n'importe où sur la carte, pioche à la main. Solide, il tape tout ce qui bouge et grignote les tours.",
    cost: 3,
    rarity: "légendaire",
    role: "Mineur",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: true,
    delivery: "dig",
    unit: {
      hp: 1000, damage: 160, hitSpeed: 1.2, firstHit: 0.4, speed: 1.3, range: 0.8, sight: 5.5,
      radius: 0.5, mass: 5, targetsBuildingsOnly: false, height: 1.5, towerDamageMult: 0.35,
    },
    look: { body: 0x1d2a4a, accent: 0x9ec3ff, scale: 1, weapon: "pickaxe" },
  },
};



export const CARD_IDS = Object.keys(CARDS) as CardId[];

export const DECK_SIZE = 8;

export const DEFAULT_DECK: CardId[] = ["goutier", "midas", "valere", "tordeux", "natis", "samy", "nazar", "niels"];
