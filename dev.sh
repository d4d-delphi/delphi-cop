#!/usr/bin/env bash
#
# Run both DELPHI dev servers locally:
#   - FastAPI backend (backend_app) -> http://localhost:8000  (docs at /docs)
#   - Next.js frontend (web-ui)     -> http://localhost:3000  (API viewer at /server)
#
# Usage:
#   ./dev.sh
#
# Ctrl-C stops both.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend_app"
FRONTEND_DIR="$ROOT/web-ui"

BACKEND_PORT=8000
FRONTEND_PORT=3000

pids=()

cleanup() {
  echo ""
  echo "==> Shutting down dev servers..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- Backend -----------------------------------------------------------------
echo "==> Starting FastAPI backend on :$BACKEND_PORT"
cd "$BACKEND_DIR"

# Backend needs Python 3.11+ (uses `X | None` type syntax). Prefer a new enough one.
PYTHON=""
for candidate in python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
      PYTHON="$candidate"
      break
    fi
  fi
done
if [ -z "$PYTHON" ]; then
  echo "    ERROR: Python 3.11+ not found (backend requires it). Install it and retry." >&2
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "    Creating virtualenv (.venv) with $PYTHON ..."
  "$PYTHON" -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# backend_app is read-only and serves a pre-built Stage-2 cache. Warn (don't fail)
# if it's missing — rebuild with: python scripts/recache.py --reuse-abox
if [ ! -f "cache/belief_snapshot.jsonl" ]; then
  echo "    WARNING: cache/ missing — run 'python scripts/recache.py --reuse-abox' in backend_app."
fi

uvicorn app.main:app --reload --port "$BACKEND_PORT" &
pids+=($!)

# --- Frontend ----------------------------------------------------------------
echo "==> Starting Next.js frontend on :$FRONTEND_PORT"
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "    Installing frontend deps (npm install) ..."
  npm install
fi

if [ ! -f ".env.local" ]; then
  echo "    WARNING: web-ui/.env.local missing — copy .env.example to .env.local."
fi

npm run dev &
pids+=($!)

echo ""
echo "==> Backend:  http://localhost:$BACKEND_PORT/docs   (health: /health)"
echo "==> Frontend: http://localhost:$FRONTEND_PORT        (API viewer: /server)"
echo "==> Press Ctrl-C to stop both."

wait
