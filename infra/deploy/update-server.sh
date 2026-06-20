#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/leafora}"

cd "$APP_DIR"
git pull --ff-only

if [ -d "$APP_DIR/apps/api/.venv" ]; then
  "$APP_DIR/apps/api/.venv/bin/pip" install "$APP_DIR/apps/api"
  (
    set -a
    # shellcheck disable=SC1091
    . /etc/leafora/api.env
    set +a
    cd "$APP_DIR/apps/api"
    "$APP_DIR/apps/api/.venv/bin/alembic" upgrade head
  )
  sudo systemctl restart leafora-api
fi

sudo nginx -t
sudo systemctl reload nginx

echo "Leafora updated from $APP_DIR"
