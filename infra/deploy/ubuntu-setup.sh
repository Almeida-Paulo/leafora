#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  curl \
  git \
  nginx \
  postgresql \
  postgresql-contrib \
  postgis \
  python3 \
  python3-venv \
  rsync \
  ufw

sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable

echo "Base packages installed. Configure PostgreSQL, Python venv, Nginx and Sui CLI next."
