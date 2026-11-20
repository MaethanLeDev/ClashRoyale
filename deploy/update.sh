#!/usr/bin/env bash
# Récupère la dernière version du jeu, recompile et redémarre le service.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
sudo systemctl restart usmb-arena
sleep 2
systemctl --no-pager --lines=5 status usmb-arena
