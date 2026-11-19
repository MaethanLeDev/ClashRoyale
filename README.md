# USMB Arena

Jeu de cartes en temps réel dans le navigateur, édition IUT : deux couloirs, une rivière, des tours à raser, et les cartes sont les potes de la promo.

- Arène 3D (Three.js) : terrain, rivière animée, ponts, campus autour
- Serveur Node faisant autorité (WebSocket) : 1v1, 2v2, bots, salons avec code
- Fonctionne sur PC et téléphone, glisser-déposer ou toucher-toucher

## Jouer en réseau local

Il faut [Node.js](https://nodejs.org) 20 ou plus sur la machine qui héberge.

```bash
npm install
npm run build
npm start
```

Le serveur affiche ses adresses, par exemple :

```
Sur cette machine :   http://localhost:3000
Sur le réseau local : http://192.168.1.42:3000
```

Tout le monde ouvre l'adresse « réseau local » dans son navigateur (même Wi-Fi). Un joueur crée un salon, les autres tapent le code à 4 lettres ou cliquent dessus dans la liste. Les places vides sont remplies par des bots au lancement.

Si les autres n'arrivent pas à se connecter, vérifier que le pare-feu de la machine hôte autorise le port 3000. Le port se change avec `PORT=4000 npm start`.

## Développement

```bash
npm run dev        # serveur (port 3000) + Vite avec rechargement à chaud (port 5173)
npm run typecheck  # vérification TypeScript
npm run simtest    # parties bot contre bot sans navigateur, pour l'équilibrage
```

En mode dev, ouvrir `http://<ip>:5173`.

## Structure

```
shared/     code commun client + serveur
  cards.ts      toutes les cartes et leurs stats
  constants.ts  dimensions de l'arène, tours, caféine, durée
  sim.ts        moteur de jeu (déplacements, ciblage, combats, tours, sorts)
  rules.ts      règles de placement
  protocol.ts   messages réseau
server/     serveur HTTP + WebSocket, salons, bots
client/     interface et rendu 3D
  src/game/     arène, modèles, effets, vue
  public/       photos des cartes (cards/) et têtes rondes (heads/)
tools/      script de préparation des photos, test de simulation
```

## Les cartes

| Carte | Coût | Rôle |
|---|---|---|
| Goutier | 3 | Essaim de 10 |
| Midas | 3 | Lancé n'importe où, arrive à 3 |
| Nazar | 3 | Mineur : creuse jusqu'à n'importe où |
| Papy Niels | 3 | Sort : dégâts + gel |
| Valère | 4 | Anti-tank, gros dégâts |
| Tordeux | 4 | Tireur à distance |
| Imad | 4 | Bâtiment défensif (QG) |
| Natis | 5 | Tank qui vise les bâtiments |
| Super Samy | 10 | Géant : rase toute tour qu'il touche |

Un deck contient 8 cartes, modifiable dans « Mon deck ».

## Ajouter une carte

1. Mettre la photo dans `client/public/cards/<id>.png` et une tête ronde dans `client/public/heads/<id>.png` (voir `tools/prepare_photos.py`).
2. Ajouter l'entrée dans `shared/cards.ts` (stats, apparence) et l'id dans le type `CardId`.
3. Ajouter le cadrage de la photo dans `FOCUS` (`client/src/ui.ts`).
4. `npm run simtest` pour vérifier que l'équilibrage tient.
