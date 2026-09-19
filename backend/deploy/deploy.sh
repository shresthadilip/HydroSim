#!/usr/bin/env bash
set -e

REPO_DIR="/var/www/HydroSim"
BACKEND_DIR="$REPO_DIR/backend"
SERVICE_NAME="hydrosim"

echo "=== 1. Pulling latest git changes ==="
cd "$REPO_DIR"
git pull origin main

echo "=== 2. Navigating to backend directory ==="
cd "$BACKEND_DIR"

echo "=== 3. Syncing Python dependencies ==="
if command -v uv &> /dev/null; then
    uv sync
elif [ -d ".venv" ]; then
    source .venv/bin/activate
    pip install -e .
else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e .
fi

echo "=== 4. Restarting systemd service ($SERVICE_NAME) ==="
sudo systemctl restart $SERVICE_NAME

echo "=== 5. Checking service status ==="
sudo systemctl status $SERVICE_NAME --no-pager

echo "=== Deployment complete! ==="
