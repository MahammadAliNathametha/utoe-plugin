#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/examples/utoe-test-project"
PORT="8011"
LOG_FILE="$ROOT_DIR/.utoe-smoke-server.log"

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

printf "[1/6] Installing UTOE into test project...\n"
(
  cd "$PROJECT_DIR"
  node ../../bin/utoe.js init >/tmp/utoe_test_install.log 2>&1 || {
    cat /tmp/utoe_test_install.log
    exit 1
  }
)

printf "[2/6] Validating installer artifacts...\n"
[[ -f "$PROJECT_DIR/.env.utoe" ]] || { echo "Missing .env.utoe"; exit 1; }
[[ -f "$PROJECT_DIR/.claude/settings.json" ]] || { echo "Missing .claude/settings.json"; exit 1; }
grep -q "utoe.js hook" "$PROJECT_DIR/.claude/settings.json" || { echo "Hook not configured"; exit 1; }

printf "[3/6] Starting UTOE server on port %s...\n" "$PORT"
UTOE_PORT="$PORT" node "$ROOT_DIR/bin/utoe.js" start >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

printf "[4/6] Waiting for /health...\n"
for _ in {1..25}; do
  if curl -s "http://localhost:$PORT/health" >/tmp/utoe_health.json 2>/dev/null; then
    if grep -q '"status":"ok"' /tmp/utoe_health.json; then
      break
    fi
  fi
  sleep 0.4
done
grep -q '"status":"ok"' /tmp/utoe_health.json || {
  echo "Server health check failed"
  tail -n 80 "$LOG_FILE" || true
  exit 1
}

printf "[5/6] Testing /suggest and /rewrite endpoints...\n"
SUGGEST_JSON="$(curl -s -X POST "http://localhost:$PORT/suggest" -H "Content-Type: application/json" -d '{"message":"please help me debug this node error"}')"
REWRITE_JSON="$(curl -s -X POST "http://localhost:$PORT/rewrite" -H "Content-Type: application/json" -d '{"message":"please explain what this api does and clean the prompt"}')"

node -e "const s=JSON.parse(process.argv[1]); if(!s.suggested||!s.task){process.exit(1)}" "$SUGGEST_JSON" || { echo "/suggest validation failed"; echo "$SUGGEST_JSON"; exit 1; }
node -e "const r=JSON.parse(process.argv[1]); if(!r.structured||!r.cleaned){process.exit(1)}" "$REWRITE_JSON" || { echo "/rewrite validation failed"; echo "$REWRITE_JSON"; exit 1; }

printf "[6/6] Testing /ask endpoint (response or controlled error)...\n"
ASK_JSON="$(curl -s -X POST "http://localhost:$PORT/ask" -H "Content-Type: application/json" -d '{"message":"summarize: UTOE checks token usage and routing"}')"
node -e "const a=JSON.parse(process.argv[1]); if(!(a.response||a.error)){process.exit(1)}" "$ASK_JSON" || { echo "/ask payload invalid"; echo "$ASK_JSON"; exit 1; }

printf "\nUTOE smoke test passed for test project: %s\n" "$PROJECT_DIR"
printf "Server log: %s\n" "$LOG_FILE"
