# Mettre USMB Arena en ligne sur clashusmb.refactor-dev.fr

Le jeu tourne sur une machine Linux allumée en permanence (Raspberry Pi à la maison ou VM gratuite Oracle Cloud). **Cloudflare Tunnel** relie cette machine au domaine, en HTTPS, sans ouvrir de port sur la box ni sur le pare-feu Oracle. Tout est gratuit.

Besoins mesurés : moins de 5 % d'un cœur de Raspberry Pi 4 et environ **0,2 Mbit/s en envoi par joueur** (3 Mbit/s pour 15 joueurs). Les fichiers du jeu sont mis en cache par Cloudflare.

## 1. Préparer la machine

### Option A : Raspberry Pi

- Pi 4 ou Pi 5 conseillé (un Pi 3B+ passe aussi), en **Raspberry Pi OS 64 bits** (la version Lite suffit).
- Avec Raspberry Pi Imager, active SSH et crée ton utilisateur avant de flasher la carte SD.
- Branche-le en Ethernet si possible, puis connecte-toi : `ssh ton-utilisateur@raspberrypi.local`.

### Option B : Oracle Cloud (gratuit)

1. Crée un compte sur oracle.com/cloud/free. Une carte bancaire est demandée pour vérifier l'identité ; l'offre « Always Free » ne débite rien tant qu'on reste dans ses limites.
2. *Compute → Instances → Create instance* :
   - Image : **Ubuntu 24.04** (version aarch64)
   - Shape : **VM.Standard.A1.Flex** (Ampere), 2 OCPU et 12 Go de mémoire
   - Clés SSH : « Generate a key pair » et **télécharge la clé privée**
   - Réseau : crée d'abord le réseau avec *Networking → Virtual cloud networks → Start VCN Wizard → Create VCN with Internet Connectivity*, puis choisis ce VCN et son sous-réseau **public** dans le formulaire de l'instance, et active « Automatically assign public IPv4 address ».
   - Si Oracle répond **« Out of capacity »** (fréquent pour les machines ARM, surtout à Paris qui n'a qu'une zone) : réessaie à d'autres heures, ou prends la forme **VM.Standard.E2.1.Micro** (AMD, 1 Go de RAM, aussi « Always Free »). Elle suffit pour le jeu ; le script ajoute automatiquement 2 Go de swap pour pouvoir compiler. Choisis alors l'image Ubuntu 24.04 **non** aarch64.
3. Connecte-toi : `ssh -i chemin/vers/la-cle.key ubuntu@IP_PUBLIQUE_DE_LA_VM`.

Inutile d'ouvrir des ports dans Oracle : le tunnel sort de la VM vers Cloudflare.

Les instances Always Free très peu utilisées pendant 7 jours peuvent être récupérées par Oracle. Les sauvegardes de `data/db.json` (voir plus bas) permettent de tout remonter ailleurs en cas de problème.

## 2. Récupérer le jeu

```bash
git clone -b claude/clash-royale-web-usmb-qtr4vb https://github.com/MaethanLeDev/ClashRoyale.git
cd ClashRoyale
```

Si le dépôt est privé, GitHub demande ton pseudo et un **jeton d'accès** (Settings → Developer settings → Personal access tokens) à la place du mot de passe.

## 3. Créer le tunnel Cloudflare

Dans le tableau de bord Cloudflare (les intitulés peuvent varier légèrement) :

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, type **Cloudflared**, nom `usmb-arena`.
2. Cloudflare affiche une commande d'installation contenant un long **jeton** (la suite de caractères après `service install`). Copie seulement ce jeton.
3. Étape *Public hostname* :
   - Subdomain : `clashusmb`
   - Domain : `refactor-dev.fr`
   - Service : type **HTTP**, URL **`localhost:3000`**
4. Enregistre.

Les WebSockets passent par défaut, rien d'autre à configurer.

## 4. Installer

Sur la machine, dans le dossier `ClashRoyale` :

```bash
bash deploy/setup.sh LE_JETON_COPIÉ
```

Le script installe Node.js 22 si besoin, compile le jeu, crée le service `usmb-arena` (relancé automatiquement au démarrage et en cas de plantage), installe `cloudflared` et branche le tunnel.

Ouvre **https://clashusmb.refactor-dev.fr** : c'est en ligne.

## Au quotidien

| Action | Commande |
|---|---|
| Mettre à jour le jeu après un `git push` | `bash deploy/update.sh` |
| Voir les logs en direct | `journalctl -u usmb-arena -f` |
| Redémarrer | `sudo systemctl restart usmb-arena` |
| État du tunnel | `systemctl status cloudflared` |
| Récupérer une sauvegarde sur ton PC | `scp utilisateur@machine:ClashRoyale/data/backups/db-AAAA-MM-JJ.json .` |

Les comptes, trophées et decks sont dans `data/db.json`. Une copie est faite chaque jour dans `data/backups/` (les 14 derniers jours sont gardés). Pour déménager le serveur, il suffit de copier `data/db.json` sur la nouvelle machine.

## Protections en place

- 12 connexions maximum par adresse IP, 200 salons maximum.
- Connexion : 15 tentatives par IP toutes les 10 minutes, et un compte est bloqué 15 minutes après 8 mots de passe faux.
- Un client qui inonde le serveur de messages est déconnecté ; un message ne peut pas dépasser 16 Ko.
- Mots de passe hachés avec scrypt, jamais stockés en clair. Le HTTPS est assuré par Cloudflare.
