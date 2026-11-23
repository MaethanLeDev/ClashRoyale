export type CardId =
  | "midas" | "valere" | "samy" | "tordeux" | "natis" | "goutier" | "imad" | "niels" | "nazar" | "tarit" | "taritPilot" | "savy"
  | "matous" | "pompon" | "pantoufle" | "tigrou" | "mathisucre" | "saez" | "paco";

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
  splash?: number;
  towerDamageMult?: number;
  jumpsRiver?: boolean;
  deathDamage?: { radius: number; damage: number };
  deathSpawn?: CardId;
  height: number;
  lifetime?: number;
  revive?: number;
  boomerang?: { distance: number; speed: number; width: number };
  brew?: { every: number; amount: number };
}

export interface SpellStats {
  radius: number;
  damage: number;
  towerDamage: number;
  freeze: number;
  delay: number;
  roll?: { distance: number; speed: number; width: number; knockback: number };
}

export interface CardDef {
  id: CardId;
  kind: CardKind;
  hidden?: boolean;
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
  spawns?: CardId[];
  unit?: UnitStats;
  spell?: SpellStats;
  look: {
    body: number;
    accent: number;
    scale: number;
    cape?: number;
    weapon?: "sword" | "dagger" | "finger" | "pickaxe" | "orb" | "briefcase";
    building?: boolean;
    vehicle?: boolean;
    cat?: boolean;
    coffee?: boolean;
  };
}

const CAT: UnitStats = {
  hp: 300, damage: 85, hitSpeed: 1.0, firstHit: 0.3, speed: 1.9, range: 0.6, sight: 5.5,
  radius: 0.42, mass: 2, targetsBuildingsOnly: false, height: 0.9, revive: 0.5,
};

const catCard = (id: CardId, name: string, body: number, accent: number): CardDef => ({
  id,
  kind: "troop",
  hidden: true,
  name,
  title: `${name}, un des Matous`,
  description: "Un des trois Matous. Quand il tombe, il se relève une fois avec la moitié de sa vie.",
  cost: 0,
  rarity: "épique",
  role: "Chat",
  count: 1,
  spawnRadius: 0,
  deployAnywhere: false,
  unit: CAT,
  look: { body, accent, scale: 0.8, cat: true },
});

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
      hp: 175, damage: 105, hitSpeed: 1.1, firstHit: 0.3, speed: 1.9, range: 0.6, sight: 5.5,
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
    description: "Il pointe, ça part. Tire depuis son index d'aussi loin qu'une tour, et encaisse pas mal de coups.",
    cost: 4,
    rarity: "rare",
    role: "Distance",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 760, damage: 150, hitSpeed: 1.2, firstHit: 0.4, speed: 1.0, range: 6.6, sight: 7.5,
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
  tarit: {
    id: "tarit",
    kind: "troop",
    name: "Tarit",
    title: "Tarit et sa Duster",
    description: "Légende du parking au volant de sa Duster noire. Il fonce droit sur les tours et saute par-dessus la rivière. Quand la Duster rend l'âme, elle explose et Tarit sort pour taper tout le monde.",
    cost: 7,
    rarity: "légendaire",
    role: "Véhicule",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 2400, damage: 260, hitSpeed: 1.4, firstHit: 0.5, speed: 1.5, range: 0.8, sight: 7,
      radius: 0.95, mass: 20, targetsBuildingsOnly: true, height: 1.8, jumpsRiver: true,
      deathDamage: { radius: 2.2, damage: 220 }, deathSpawn: "taritPilot",
    },
    look: { body: 0x121417, accent: 0xc0c4cc, scale: 1, vehicle: true },
  },
  savy: {
    id: "savy",
    kind: "troop",
    name: "Savy",
    title: "Savy le Sorcier",
    description: "Toujours le sourire, même quand il crame tout le monde. Ses boules de feu explosent et touchent tout ce qui se trouve autour de la cible.",
    cost: 5,
    rarity: "rare",
    role: "Dégâts de zone",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 640, damage: 210, hitSpeed: 1.4, firstHit: 0.5, speed: 1.0, range: 5, sight: 6.5,
      radius: 0.5, mass: 4, targetsBuildingsOnly: false, height: 1.5, splash: 1.5,
      projectile: { speed: 11, kind: "fireball" },
    },
    look: { body: 0x2b2d33, accent: 0xff7a1a, scale: 1, weapon: "orb" },
  },
  matous: {
    id: "matous",
    kind: "troop",
    name: "Les Matous",
    title: "Pompon, Pantoufle et Tigrou",
    description: "Trois chats casqués, rapides et teigneux. Ils ont neuf vies : chacun se relève une fois avec la moitié de sa vie quand on croit l'avoir eu.",
    cost: 4,
    rarity: "épique",
    role: "Trio",
    count: 3,
    spawnRadius: 0.8,
    deployAnywhere: false,
    spawns: ["pompon", "pantoufle", "tigrou"],
    unit: CAT,
    look: { body: 0xd9853b, accent: 0xb8bcc4, scale: 0.8, cat: true },
  },
  pompon: catCard("pompon", "Pompon", 0xd9853b, 0xf3e3cf),
  pantoufle: catCard("pantoufle", "Pantoufle", 0x5d6068, 0x8a8e96),
  tigrou: catCard("tigrou", "Tigrou", 0x8a6a48, 0xe9dcc7),
  mathisucre: {
    id: "mathisucre",
    kind: "spell",
    name: "Mathisucre",
    title: "Mathisucre la Bûche",
    description: "Bras et jambes tendus, Mathisucre se jette au sol et roule droit devant lui. Il écrase tout sur son passage et repousse les troupes.",
    cost: 2,
    rarity: "légendaire",
    role: "Rouleau",
    count: 0,
    spawnRadius: 0,
    deployAnywhere: true,
    spell: { radius: 1.9, damage: 200, towerDamage: 60, freeze: 0, delay: 0, roll: { distance: 10, speed: 7, width: 3.8, knockback: 1 } },
    look: { body: 0x1f2a44, accent: 0xffffff, scale: 1 },
  },
  saez: {
    id: "saez",
    kind: "troop",
    name: "Michel Saez",
    title: "Michel Saez et sa Mallette",
    description: "Le prof lance sa mallette : elle traverse toute la rangée, puis revient dans sa main en corrigeant tout le monde une deuxième fois.",
    cost: 5,
    rarity: "épique",
    role: "Aller-retour",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 1000, damage: 105, hitSpeed: 2.4, firstHit: 0.5, speed: 1.0, range: 4.5, sight: 6,
      radius: 0.5, mass: 5, targetsBuildingsOnly: false, height: 1.5,
      boomerang: { distance: 6.5, speed: 10, width: 0.9 },
    },
    look: { body: 0xb29a78, accent: 0x5b3a22, scale: 1, weapon: "briefcase" },
  },
  paco: {
    id: "paco",
    kind: "building",
    name: "Paco",
    title: "La Machine à Café de Paco",
    description: "Paco installe sa machine à café. Elle ne se défend pas, mais elle te sert 1 Caféine toutes les 8,5 secondes tant qu'elle tient debout.",
    cost: 6,
    rarity: "rare",
    role: "Production",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 900, damage: 0, hitSpeed: 1, firstHit: 0, speed: 0, range: 0, sight: 0,
      radius: 1.0, mass: 1000, targetsBuildingsOnly: false, height: 2.4, lifetime: 70,
      brew: { every: 8.5, amount: 1 },
    },
    look: { body: 0x3a2a22, accent: 0xc8a27a, scale: 1, building: true, coffee: true },
  },
  taritPilot: {
    id: "taritPilot",
    kind: "troop",
    hidden: true,
    name: "Tarit",
    title: "Tarit à pied",
    description: "Sorti de sa Duster en flammes, Tarit tape tout ce qui passe.",
    cost: 0,
    rarity: "légendaire",
    role: "Combattant",
    count: 1,
    spawnRadius: 0,
    deployAnywhere: false,
    unit: {
      hp: 600, damage: 150, hitSpeed: 1.1, firstHit: 0.3, speed: 1.3, range: 0.7, sight: 5.5,
      radius: 0.45, mass: 4, targetsBuildingsOnly: false, height: 1.5,
    },
    look: { body: 0xc8b496, accent: 0x8a7458, scale: 1 },
  },
};



export function parentCard(id: CardId): CardDef {
  return Object.values(CARDS).find((c) => c.spawns?.includes(id)) ?? CARDS[id];
}

export function unitValue(id: CardId): number {
  const c = parentCard(id);
  if (c.count <= 0) return 0;
  return c.cost / c.count / (c.unit?.revive ? 1 + c.unit.revive : 1);
}

export const CARD_IDS = (Object.keys(CARDS) as CardId[]).filter((c) => !CARDS[c].hidden);

export const DECK_SIZE = 8;

export const DEFAULT_DECK: CardId[] = ["goutier", "midas", "valere", "tordeux", "natis", "samy", "nazar", "niels"];
