#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"
REQ_FILE="$BACKEND_DIR/requirements-core.txt"

if [ -x "$VENV_DIR/bin/uvicorn" ]; then
  exit 0
fi

echo "[ImageLab] Bootstrapping Python backend environment in $VENV_DIR..."

if ! python3 -m venv "$VENV_DIR" >/dev/null 2>&1; then
  rm -rf "$VENV_DIR"
  python3 -m venv --without-pip "$VENV_DIR"
fi

if [ ! -x "$VENV_DIR/bin/pip" ]; then
  echo "[ImageLab] Installing pip into backend virtual environment..."
  curl -fsSL https://bootstrap.pypa.io/get-pip.py | "$VENV_DIR/bin/python" - --quiet
fi

echo "[ImageLab] Installing backend scientific packages..."
"$VENV_DIR/bin/pip" install --quiet --no-cache-dir -r "$REQ_FILE"
echo "[ImageLab] Backend Python environment is ready."
