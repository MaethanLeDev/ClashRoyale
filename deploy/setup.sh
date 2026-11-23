#!/usr/bin/env bash
# Installe USMB Arena comme service sur une machine Linux Debian/Ubuntu (Raspberry Pi OS, Oracle Cloud Ubuntu…).
# Usage : bash deploy/setup.sh [JETON_DU_TUNNEL_CLOUDFLARE]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
TOKEN="${1:-}"

step() { printf '\n\033[1;33m== %s\033[0m\n' "$1"; }

step "Paquets de base"
sudo apt-get update
sudo apt-get install -y curl git ca-certificates

MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if [ "$MEM_MB" -lt 2000 ] && [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  step "Peu de mémoire (${MEM_MB} Mo) : ajout de 2 Go de swap pour pouvoir compiler"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  step "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node $(node -v), npm $(npm -v)"

step "Installation des dépendances et compilation du jeu"
cd "$APP_DIR"
npm ci
npm run build

step "Service systemd usmb-arena (démarre tout seul au boot)"
NPM_BIN="$(command -v npm)"
sudo tee /etc/systemd/system/usmb-arena.service >/dev/null <<UNIT
[Unit]
Description=USMB Arena
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=NODE_ENV=production
ExecStart=$NPM_BIN start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now usmb-arena
sleep 3
if curl -fsS "http://localhost:$PORT" >/dev/null; then
  echo "Le jeu répond sur http://localhost:$PORT"
else
  echo "Le jeu ne répond pas encore. Regarde les logs : journalctl -u usmb-arena -n 50"
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  step "Installation de cloudflared"
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
fi

if [ -n "$TOKEN" ]; then
  step "Connexion du tunnel Cloudflare"
  if systemctl list-unit-files cloudflared.service >/dev/null 2>&1 && systemctl is-enabled cloudflared >/dev/null 2>&1; then
    echo "Un service cloudflared existe déjà, on le laisse tel quel."
  else
    sudo cloudflared service install "$TOKEN"
  fi
else
  echo
  echo "Pas de jeton Cloudflare fourni : le jeu tourne en local seulement."
  echo "Relance avec : bash deploy/setup.sh <JETON> (voir deploy/DEPLOY.md)."
fi

step "Terminé"
echo "Logs du jeu      : journalctl -u usmb-arena -f"
echo "Mettre à jour    : bash deploy/update.sh"
echo "Base de comptes  : $APP_DIR/data/db.json (sauvegardes quotidiennes dans data/backups/)"
