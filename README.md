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

Si le port 3000 est occupé ou bloqué (fréquent sous Windows avec Hyper-V, WSL ou Docker), le serveur essaie tout seul 8080, 8000, etc. et affiche le port retenu. Pour imposer un port :

- PowerShell : `$env:PORT=8080; npm start`
- macOS / Linux : `PORT=8080 npm start`

Si les autres n'arrivent pas à se connecter, accepter la fenêtre du pare-feu Windows au premier lancement (cocher « Réseaux privés »), et vérifier que le Wi-Fi est bien en profil « Privé » et pas « Public ».

## Développement

```bash
npm run dev        # serveur (port 3000) + Vite avec rechargement à chaud (port 5173)
npm run typecheck  # vérification TypeScript
npm run simtest    # parties bot contre bot sans navigateur, pour l'équilibrage
npm run train      # entraînement des bots (voir training/README.md)
```

Pour tester la fin de partie sans attendre 3 minutes : `DEV_MATCH_SECONDS=10 npm start`.

En mode dev, ouvrir `http://<ip>:5173`.

## Structure

```
shared/     code commun client + serveur
  cards.ts      toutes les cartes et leurs stats
  constants.ts  dimensions de l'arène, tours, caféine, durée
  sim.ts        moteur de jeu (déplacements, ciblage, combats, tours, sorts)
  rules.ts      règles de placement
  arenas.ts     arènes et paliers de trophées
  protocol.ts   messages réseau
server/     serveur HTTP + WebSocket, salons, bots, profils (trophées)
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
| Savy | 5 | Sorcier : boules de feu à dégâts de zone |
| Tarit | 7 | Duster qui saute la rivière et vise les tours ; explose à sa mort et Tarit en sort |
| Super Samy | 10 | Géant : rase toute tour qu'il touche |

Un deck contient 8 cartes parmi 11, modifiable dans « Mon deck ».

## Comptes

On joue en invité par défaut (juste un pseudo). « Créer un compte » protège le pseudo par un mot de passe et garde les trophées et le deck sur le serveur : on les retrouve depuis n'importe quel PC qui se connecte au même serveur. La session reste ouverte 60 jours sur chaque navigateur.

Tout est stocké dans `data/db.json` sur la machine qui héberge le serveur (mots de passe hachés avec scrypt, jamais en clair). Pour garder les comptes en changeant de machine, il suffit de copier ce fichier. Un pseudo invité qui crée un compte récupère ses trophées d'invité.

Dans un salon, chaque joueur indique qu'il est **prêt** ; l'hôte ne peut lancer la partie que quand tout le monde l'est. Ouvrir l'éditeur de deck depuis le salon repasse automatiquement en « pas prêt ».

## Arènes et trophées

Victoire +30 trophées, défaite −20 (moitié si l'adversaire n'est composé que de bots). Les trophées sont stockés par pseudo dans `data/profiles.json` sur la machine qui héberge le serveur.

| Arène | Trophées |
|---|---|
| Campus du Bourget | 0 |
| Plage du Lac | 300 |
| Station des Partiels | 600 |
| Soirée BDE | 1000 |
| Volcan des Rattrapages | 1500 |

La partie se joue dans l'arène du joueur humain le mieux classé.

## Bots entraînés par apprentissage par renforcement

Les bots des arènes 2 à 5 sont des réseaux de neurones entraînés en simulation, chacun avec un style : rush, défense, préshot, et le Boss. Voir [training/README.md](training/README.md) pour lancer une nuit d'entraînement (`caffeinate -i npm run train:night` sur Mac).

## Fin de partie

Si les couronnes sont à égalité après les prolongations, toutes les tours perdent des PV de plus en plus vite : la première qui tombe désigne le perdant.

## Caméra

Molette sur PC, ou bouton 🎥 en jeu et « Réglages → Caméra » depuis l'accueil (avec aperçu). Le réglage combine inclinaison et focale (effet « dolly zoom ») : vue quasi du dessus d'un côté, vue rapprochée en perspective de l'autre.

## Modèles 3D

Chaque carte a un modèle low-poly dans `client/public/models/<id>.glb`, généré par `tools/blender/build_unit.py` (Blender 5.3). Une carte sans `.glb` garde le modèle construit en code.

- Tout régénérer : dans Blender, *Scripting → Open → build_unit.py → Run Script*, ou `blender -b -P tools/blender/build_unit.py -- all`
- Une seule carte : `-- valere` ; ré-exporter une collection retouchée à la main : `-- valere export`
- Conventions lues par le jeu : personnage face à −Y, pieds à z = 0, environ 1,9 de haut ; pivots `leg_L`, `leg_R`, `arm_L`, `arm_R` (hanche / épaule), `head_anchor` (photo ronde), `cape`, `bulb` (bâtiment), `wheel_*` (véhicule) ; matériau `team` recoloré à la couleur de l'équipe.

## Ajouter une carte

1. Mettre la photo dans `client/public/cards/<id>.png` et une tête ronde dans `client/public/heads/<id>.png` (voir `tools/prepare_photos.py`).
2. Ajouter l'entrée dans `shared/cards.ts` (stats, apparence) et l'id dans le type `CardId`.
3. Ajouter le cadrage de la photo dans `FOCUS` (`client/src/ui.ts`).
4. `npm run simtest` pour vérifier que l'équilibrage tient.
