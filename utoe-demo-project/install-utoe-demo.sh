#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-utoe-demo.sh
# One-time setup: installs utoe-plugin@1.1.6 and bootstraps the project.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()    { echo -e "${CYAN}[utoe-demo]${NC} $*"; }
ok()     { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn()   { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
die()    { echo -e "${RED}[ FAIL ]${NC} $*"; exit 1; }

# ── Node.js version check ─────────────────────────────────────────────────────
NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js >=18 required. Found: $(node --version 2>/dev/null || echo 'not installed')"
fi
ok "Node.js $(node --version)"

# ── API key check (warn only — proxy can start without it) ────────────────────
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set. The proxy will start but real API calls will fail."
  warn "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
else
  ok "ANTHROPIC_API_KEY detected"
fi

# ── Install utoe-plugin from npm ──────────────────────────────────────────────
log "Installing utoe-plugin@1.1.6 from npm..."
npm install utoe-plugin@1.1.6 --save 2>&1 | tail -5
ok "utoe-plugin@1.1.6 installed"

# ── Create a minimal .env.utoe so the proxy picks up the key ─────────────────
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ ! -f ".env.utoe" ]; then
  cat > .env.utoe <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
UTOE_PORT=8787
UTOE_MODE=bridge
EOF
  ok "Created .env.utoe"
elif [ -f ".env.utoe" ]; then
  ok ".env.utoe already exists — skipping"
else
  cat > .env.utoe <<'EOF'
# Fill in your Anthropic API key:
# ANTHROPIC_API_KEY=sk-ant-...
UTOE_PORT=8787
UTOE_MODE=bridge
EOF
  warn "Created .env.utoe (placeholder) — add your ANTHROPIC_API_KEY before running tests"
fi

# ── Bootstrap project support files via `utoe init` ──────────────────────────
log "Running 'npx utoe init' to bootstrap claude.md + .utoe/ support files..."
npx utoe init --yes 2>/dev/null || {
  warn "'npx utoe init' returned non-zero. Creating support files manually..."
  mkdir -p .utoe/logs .utoe/skills

  # claude.md — minimal, under 60 lines
  if [ ! -f claude.md ]; then
    cat > claude.md <<'CLAUDEMD'
# Project Context

## Overview
UTOE Demo — Node.js CLI Todo App built to showcase token savings.

## Stack
Node.js 18+, TypeScript, UTOE proxy (port 8787)

## Key Conventions
- Follow existing patterns before adding new ones
- All heavy content lives in .utoe/logs/ — not here

## UTOE Notes
- Support files: .utoe/logs/{tech_debt,bug_list,architecture_decisions,...}.md
- Skills: .utoe/skills/*.md
- Memory: .utoe_memory.json (auto-managed)

## Active Decisions
- TypeScript strict mode
- In-memory storage for todo items (no DB for demo simplicity)
- Commander.js for CLI argument parsing

## Out of Scope
- Persistent database
- Multi-user support
- Web UI
CLAUDEMD
    ok "Created claude.md"
  fi

  # Support files
  for f in tech_debt bug_list architecture_decisions security_checklist temp_decisions progress errors; do
    target=".utoe/logs/${f}.md"
    if [ ! -f "$target" ]; then
      title=$(echo "$f" | tr '_' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')
      echo -e "# ${title}\n\nAuto-populated by UTOE post-prompt hooks.\n" > "$target"
    fi
  done

  # schema.json
  cat > .utoe/schema.json <<EOF
{
  "version": "1.0.0",
  "generated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project": "utoe-demo",
  "files": []
}
EOF

  touch .utoe/skills/.gitkeep
  ok "Support files created manually"
}

ok "Project bootstrap complete"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next steps:"
echo "    1.  ./start-utoe.sh &          # start proxy (background)"
echo "    2.  ./run-demo-comparison.sh   # run full demo"
echo ""
echo "  Or run tests individually:"
echo "    node test-without-utoe.js      # without UTOE"
echo "    node test-with-utoe.js         # with UTOE"
echo ""
