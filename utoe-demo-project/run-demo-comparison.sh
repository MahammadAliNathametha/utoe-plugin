#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-demo-comparison.sh
#
# One-command full demo:
#  1. Verifies prerequisites (Node, proxy, API key)
#  2. Runs test-without-utoe.js  (dry-run if no API key)
#  3. Runs test-with-utoe.js     (dry-run if no API key / proxy not up)
#  4. Prints side-by-side comparison table
#
# Usage:
#   ./run-demo-comparison.sh             # auto-detect live vs dry-run
#   ./run-demo-comparison.sh --dry-run   # force dry-run (no API calls)
#   ./run-demo-comparison.sh --live      # force live (errors if key missing)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

UTOE_PORT="${UTOE_PORT:-8787}"
PROXY_URL="http://localhost:${UTOE_PORT}"

log()     { echo -e "${CYAN}[demo]${NC} $*"; }
ok()      { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
die()     { echo -e "${RED}[ FAIL ]${NC} $*"; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}\n"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
FORCE_DRY=false
FORCE_LIVE=false
for arg in "$@"; do
  case $arg in
    --dry-run) FORCE_DRY=true ;;
    --live)    FORCE_LIVE=true ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       UTOE Plugin — Token Savings Demo               ║${NC}"
echo -e "${BOLD}${CYAN}║       Building a CLI Todo App: with vs without UTOE  ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────────────────
header "Prerequisites"

# Node.js
NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js >=18 required. Found: $(node --version 2>/dev/null || echo 'not found')"
fi
ok "Node.js $(node --version)"

# utoe-plugin installed?
if [ ! -d "node_modules/utoe-plugin" ]; then
  warn "utoe-plugin not found. Running install-utoe-demo.sh first..."
  bash install-utoe-demo.sh
fi
ok "utoe-plugin installed"

# Determine run mode
if $FORCE_DRY; then
  RUN_MODE="dry-run"
elif $FORCE_LIVE; then
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    die "--live requires ANTHROPIC_API_KEY to be set"
  fi
  RUN_MODE="live"
else
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    RUN_MODE="live"
  else
    RUN_MODE="dry-run"
    warn "ANTHROPIC_API_KEY not set — running in dry-run mode (token estimation only)"
  fi
fi

# Check proxy in live mode
PROXY_UP=false
if [ "$RUN_MODE" = "live" ]; then
  if curl -sf "${PROXY_URL}/health" >/dev/null 2>&1; then
    PROXY_UP=true
    ok "UTOE proxy running at ${PROXY_URL}"
  else
    warn "UTOE proxy not detected at ${PROXY_URL}"
    warn "Starting it now..."
    bash start-utoe.sh &
    sleep 3
    if curl -sf "${PROXY_URL}/health" >/dev/null 2>&1; then
      PROXY_UP=true
      ok "Proxy started successfully"
    else
      warn "Proxy still not ready — falling back to dry-run for UTOE test"
      RUN_MODE="dry-run"
    fi
  fi
fi

echo ""
echo -e "  Run mode : ${BOLD}${RUN_MODE}${NC}"
echo -e "  Proxy    : $([ "$PROXY_UP" = "true" ] && echo "${GREEN}UP${NC}" || echo "${YELLOW}N/A (dry-run)${NC}")"
echo ""

# ── Step 1: Run WITHOUT UTOE ──────────────────────────────────────────────────
header "Step 1/2: Running WITHOUT UTOE"
echo "  This sends full accumulated context to the API on every turn."
echo "  Token count grows with each message — just like a normal Claude session."
echo ""

if [ "$RUN_MODE" = "dry-run" ]; then
  node test-without-utoe.js --dry-run
else
  node test-without-utoe.js
fi

# ── Step 2: Run WITH UTOE ─────────────────────────────────────────────────────
header "Step 2/2: Running WITH UTOE"
echo "  This routes all calls through the UTOE proxy (port ${UTOE_PORT})."
echo "  UTOE compresses prompts, trims history, and injects only relevant memory."
echo ""
echo "  Slash commands triggered mid-session:"
echo "    Turn 5 → /compact   (compress conversation history)"
echo "    Turn 8 → /effort low (switch to fast/cheap mode)"
echo ""

if [ "$RUN_MODE" = "dry-run" ]; then
  node test-with-utoe.js --dry-run
else
  ANTHROPIC_BASE_URL="${PROXY_URL}" node test-with-utoe.js
fi

# ── Step 3: Print comparison ──────────────────────────────────────────────────
header "Results Comparison"
node measure-tokens.js --compare

# ── Step 4: Show proxy stats (live only) ─────────────────────────────────────
if $PROXY_UP; then
  echo ""
  log "Live proxy stats from ${PROXY_URL}/stats:"
  STATS=$(curl -sf "${PROXY_URL}/stats" 2>/dev/null || echo '{"error":"unavailable"}')
  echo "  $STATS" | python3 -m json.tool 2>/dev/null || echo "  $STATS"
  echo ""
  log "Dashboard: open ${PROXY_URL}/ in your browser for live metrics"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Demo complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Key takeaways:"
echo "  • UTOE intercepts every request at the proxy layer — zero code changes"
echo "  • /compact and /effort low saved tokens mid-session automatically"
echo "  • claude.md stays under 60 lines; heavy logs go to .utoe/logs/"
echo "  • Semantic cache means repeated questions cost 0 tokens on 2nd hit"
echo "  • Your API key is never stored — it passes through transparently"
echo ""
echo "  Next: try a real Claude Code session with UTOE:"
echo "    export ANTHROPIC_BASE_URL=http://localhost:${UTOE_PORT}"
echo "    claude                    # Claude CLI routes via UTOE automatically"
echo ""
