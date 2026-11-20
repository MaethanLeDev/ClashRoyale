# Entraînement des bots

Les bots des arènes 2 à 5 sont des petits réseaux de neurones entraînés en jouant des millions de parties contre eux-mêmes et contre d'autres bots. L'arène 1 garde le bot classique, écrit à la main.

| Arène | Bot | Style récompensé |
|---|---|---|
| 2 · Plage du Lac | Le Rusheur | dégâts aux tours, jeu au pont |
| 3 · Station des Partiels | Le Mur | défense, échanges de caféine gagnants |
| 4 · Soirée BDE | Le Devin | préshots : Papy Niels qui touche des troupes posées il y a moins de 2,5 s, et défenses posées dans un couloir calme juste avant que tu y lances une poussée |
| 5 · Volcan des Rattrapages | Le Boss | la victoire avant tout, entraîné contre tous les autres |

Il y a donc **un cerveau par arène**, chacun avec son style. Ensuite, **la difficulté monte avec les trophées** dans chaque arène : temps de réaction plus court, moins d'erreurs volontaires (en bas de l'arène le bot est volontairement bridé, en haut il joue à fond). Le Boss ne triche pas : il est juste entraîné plus longtemps, contre tous les autres.

## Lancer la nuit d'entraînement (Mac)

```bash
git pull
npm install
caffeinate -i npm run train:night
```

`caffeinate -i` empêche le Mac de se mettre en veille. Branche le chargeur. Le script utilise tous les cœurs sauf un, donc le Moniteur d'activité montrera Node vers 1 500 % de CPU. C'est normal, les ventilateurs vont tourner.

Le programme entraîne les 4 bots l'un après l'autre (environ 8 h au total) :

```
[preshot] gén 812 · 1 204 352 parties · 312 parties/s · fitness 0.874 · préshots/partie 1.92 · dernier test 81 % · reste 1h12m40s
  💾 sauvegardé · victoires contre le bot classique : 81.3 %
```

- **parties/s** : la vitesse réelle de ta machine.
- **fitness** : la note moyenne (victoire + bonus de style). Elle doit monter en tendance, même si elle fait des vagues.
- **dernier score** : la moyenne des victoires contre toute la ligue (le bot classique et les 3 autres bots), mesurée toutes les 90 s. Le détail par adversaire s'affiche à chaque test. C'est ce score qui décide quel cerveau est publié pour le jeu.

`Ctrl + C` arrête proprement à tout moment : le dernier cerveau sauvegardé est gardé. Relancer la commande reprend là où on s'était arrêté, donc chaque nuit rend les bots plus forts.

Quand les règles du jeu ou de l'IA changent beaucoup (nouvelle carte, équilibrage, nouvelles actions), mieux vaut repartir de zéro :

```bash
caffeinate -i npm run train -- --style night --hours 6 --fresh
```

Autres commandes utiles :

```bash
npm run train -- --style boss --minutes 120     # un seul bot
npm run train:night -- --hours 10               # nuit plus longue
npm run train -- --style preshot --fresh        # repartir de zéro
```

## Le rapport du matin

```bash
npm run train:report
```

Il affiche (et écrit dans `training/rapport.md`) :

- le résumé de chaque cerveau : parties jouées, meilleur pourcentage de victoires ;
- la courbe de progression de la nuit ;
- un tournoi entre tous les bots et le bot classique ;
- les cartes et les placements favoris de chaque bot, dont le pourcentage de QG d'Imad posés en position d'aimant.

`npm run train:report -- --games 100` pour un tournoi plus précis (plus long).

## Ce que ça produit

Un fichier JSON par bot dans `server/brains/` (`rush.json`, `defense.json`, `preshot.json`, `boss.json`). Chaque fichier contient environ 17 000 nombres : les poids du réseau de neurones, plus le deck du bot et quelques statistiques. Le serveur du jeu les recharge tout seul quand ils changent, sans redémarrer.

Pour les partager avec les autres : `git add server/brains && git commit -m "Bots entraînés" && git push`.

L'historique de chaque entraînement est dans `training/logs/<style>.csv`, à ouvrir dans un tableur pour voir la courbe de progression.

## Comment ça marche

**Ce que le bot voit** (environ 120 nombres, 3 fois par seconde) : les PV et la puissance des troupes dans 8 zones de l'arène, les PV des tours, sa caféine et celle de l'adversaire, les cartes de sa main, la dernière carte posée par l'adversaire et où, la troupe ennemie la plus avancée, et **le cycle de l'adversaire** : quelles cartes il a déjà montrées, et lesquelles sont revenues dans sa main (une carte revient après 4 autres poses).

**Ce qu'il peut faire** : attendre, ou choisir une carte de sa main et un endroit. Si la carte est trop chère pour l'instant, il économise jusqu'à pouvoir la poser : « garder sa caféine pour Super Samy » est une seule décision, facile à découvrir. Il peut poser une carte à l'un des 17 points clés (derrière une tour, au pont, au pont adverse, sur la tour adverse, sur la menace, les deux positions « aimant » au centre pour dévier les troupes qui visent les bâtiments entre les deux tours, etc.). Soit 171 actions possibles.

**Son cerveau** : un réseau de neurones de 3 couches (120 → 64 → 48 → 171). Il donne une note à chaque action, et le bot joue la meilleure.

**L'apprentissage** : les stratégies d'évolution (*Evolution Strategies*, la méthode présentée par OpenAI en 2017). À chaque génération :

1. On crée 96 variantes du cerveau en ajoutant un petit bruit aléatoire aux poids.
2. Chaque variante joue 6 parties (contre le bot classique, contre d'anciennes versions d'elle-même et contre les autres styles).
3. On calcule la note de chaque variante avec la récompense du style.
4. On déplace le cerveau dans la direction des variantes qui ont eu les meilleures notes.

C'est de l'apprentissage par renforcement : le bot n'a jamais d'exemple de « bon coup », il découvre tout seul ce qui rapporte des points. Changer la récompense change le style : en donnant des points aux préshots, Le Devin apprend à anticiper. Une petite récompense pour le nombre de cartes différentes jouées l'encourage à utiliser tout son deck au lieu de recycler les 4 ou 5 cartes les moins chères.

## Ce que la première nuit nous a appris

- Les bots dépensaient leur caféine dès qu'ils le pouvaient (2,5 en moyenne) : Super Samy, Natis, Tarit et Imad restaient coincés en main toute la partie. Corrigé en laissant le bot choisir une carte trop chère pour économiser.
- Midas lancé directement sur les tours était la stratégie dominante (945 dégâts pour 3 de caféine sur une tour sans défense). Ses PV passent de 220 à 175 : il meurt en 2 flèches comme le fût de gobelins du vrai jeu.
- Le meilleur cerveau était choisi contre le bot classique seulement : le Boss pouvait perdre contre le Rusheur. Il est maintenant choisi sur sa moyenne contre toute la ligue.

Les récompenses de chaque style sont dans `shared/ai/styles.ts`, et le calcul de la note dans `shared/ai/match.ts`.
