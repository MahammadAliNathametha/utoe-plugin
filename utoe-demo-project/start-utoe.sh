#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-utoe.sh
# Starts the UTOE proxy on port 8787 and exports ANTHROPIC_BASE_URL.
# Run this in the background: ./start-utoe.sh &
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

UTOE_PORT="${UTOE_PORT:-8787}"
UTOE_PID_FILE=".utoe-proxy.pid"
HEALTH_URL="http://localhost:${UTOE_PORT}/health"
MAX_WAIT=15  # seconds

log()  { echo -e "${CYAN}[utoe-proxy]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
die()  { echo -e "${RED}[ FAIL ]${NC} $*"; exit 1; }

# ── Already running? ──────────────────────────────────────────────────────────
if [ -f "$UTOE_PID_FILE" ]; then
  OLD_PID=$(cat "$UTOE_PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    warn "UTOE proxy already running (PID $OLD_PID). Skipping start."
    echo "  Health: $(curl -sf $HEALTH_URL | python3 -m json.tool 2>/dev/null || echo 'unreachable')"
    exit 0
  else
    rm -f "$UTOE_PID_FILE"
  fi
fi

# ── Port check ────────────────────────────────────────────────────────────────
if lsof -ti:"$UTOE_PORT" >/dev/null 2>&1; then
  EXISTING=$(lsof -ti:"$UTOE_PORT")
  warn "Port $UTOE_PORT already in use by PID $EXISTING."
  warn "Kill it with: kill $EXISTING   or set UTOE_PORT=<other> and retry."
  exit 1
fi

# ── Start the proxy ───────────────────────────────────────────────────────────
log "Starting UTOE proxy on port ${UTOE_PORT}..."

# Load .env.utoe if present
if [ -f ".env.utoe" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env.utoe 2>/dev/null || true
  set +o allexport
fi

export UTOE_PORT
export ANTHROPIC_BASE_URL="http://localhost:${UTOE_PORT}"

# Start proxy in background, capturing PID
npx utoe start --port "$UTOE_PORT" > .utoe-proxy.log 2>&1 &
PROXY_PID=$!
echo "$PROXY_PID" > "$UTOE_PID_FILE"

log "Proxy PID: $PROXY_PID — waiting for it to become ready..."

# ── Wait for health endpoint ──────────────────────────────────────────────────
for i in $(seq 1 $MAX_WAIT); do
  sleep 1
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    ok "UTOE proxy is up! (${i}s)"
    break
  fi
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    die "Proxy process exited unexpectedly. Check .utoe-proxy.log:"
    cat .utoe-proxy.log
    exit 1
  fi
  echo -n "."
done

# Final reachability check
HEALTH=$(curl -sf "$HEALTH_URL" 2>/dev/null)
if [ -z "$HEALTH" ]; then
  die "Proxy did not become healthy in ${MAX_WAIT}s. Logs:"
  cat .utoe-proxy.log
  exit 1
fi

# ── Print status ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  UTOE Proxy RUNNING${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  PID:              $PROXY_PID"
echo "  Port:             $UTOE_PORT"
echo "  Dashboard:        http://localhost:${UTOE_PORT}/"
echo "  Health:           $HEALTH_URL"
echo ""
echo "  To route Claude CLI through UTOE, set:"
echo "    export ANTHROPIC_BASE_URL=http://localhost:${UTOE_PORT}"
echo ""
echo "  To stop the proxy:"
echo "    npx utoe stop   OR   kill $PROXY_PID"
echo ""

# ── Tail logs in foreground (useful when called as background job) ────────────
# If this script is PID 1 in the subshell (foreground), wait keeps it alive.
# When called with &, the parent shell continues immediately.
if [ "${UTOE_FOREGROUND:-}" = "1" ]; then
  wait "$PROXY_PID"
fi
