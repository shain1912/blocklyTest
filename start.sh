#!/bin/bash
# One-command startup: runs both the Vite dev server and the Python backend.
# Usage:   ./start.sh
# Kill with Ctrl-C (both processes get terminated).
set -e
cd "$(dirname "$0")"

# Load .env so the frontend picks up VITE_* and the backend can see its own env
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

# Ensure backend deps are installed (idempotent)
python3 -m pip install -q -r backend/requirements.txt || true

# Free our ports from any leftover process
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true

# Start the Python backend
python3 backend/main.py > /tmp/blockly-backend.log 2>&1 &
BACKEND_PID=$!
echo "[start.sh] backend PID $BACKEND_PID (log: /tmp/blockly-backend.log)"

# Start the Vite dev server
npm run dev > /tmp/blockly-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "[start.sh] frontend PID $FRONTEND_PID (log: /tmp/blockly-frontend.log)"

cleanup() {
  echo ""
  echo "[start.sh] stopping…"
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  fuser -k 5173/tcp 2>/dev/null || true
  fuser -k 8000/tcp 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[start.sh] waiting for servers…"
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:8000/health && curl -fs -o /dev/null http://127.0.0.1:5173; then
    echo "[start.sh] ready:"
    echo "   frontend  → http://localhost:5173"
    echo "   backend   → http://localhost:8000"
    break
  fi
  sleep 0.5
done

wait
