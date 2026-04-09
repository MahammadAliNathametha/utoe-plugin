# UTOE Plugin — Demo Project

> **UTOE is invisible to the AI.** Claude reads `claude.md`. Cursor reads `.cursorrules`.
> They never know UTOE exists. UTOE just keeps those files lean and routes heavy content
> away from the context — saving 70-95% of tokens automatically.

---

## The Mental Model

```
Without UTOE                         With UTOE
─────────────────────────────        ──────────────────────────────────
claude.md  →  200+ lines             claude.md  →  ≤60 lines  ← AI reads this
                                     .utoe/logs/architecture_decisions.md
                                     .utoe/logs/tech_debt.md
                                     .utoe/logs/bug_list.md
                                     .utoe/logs/progress.md
                                     ...loaded only when relevant (RAG)

Every turn: full history sent →      Every turn: compressed + windowed
  turn 1:   400 tokens                 turn 1:   180 tokens (-55%)
  turn 5: 2,100 tokens                 turn 5:   490 tokens (-77%)
  turn 10: 4,800 tokens                turn 10:  620 tokens (-87%)
```

**Claude has no idea UTOE is involved.** It just sees a well-structured, minimal
`claude.md` and focused prompts. The token savings are a side-effect of good
context hygiene, automated.

---

## How UTOE Integrates — Zero AI Awareness

```
You type a prompt in Claude CLI
         │
         ▼
[UTOE pre-prompt hook]
  • Strip filler words ("please", "could you kindly", "I was wondering if")
  • Compress git logs, stack traces, test output
  • Inject only relevant .utoe/logs/ snippets (RAG — keyword scored)
  • Apply effort-level token budget (/effort low → 512 token cap)
         │
         ▼
Claude receives a clean, compressed prompt
(thinks it's just your message)
         │
         ▼
Claude responds
         │
         ▼
[UTOE post-prompt hook]
  • Strip AI boilerplate ("Sure! I'd be happy to help...")
  • Detect category (bug? architecture? security? tech debt?)
  • Route to matching .utoe/logs/ file (keeps it OUT of claude.md)
  • claude.md stays ≤60 lines
         │
         ▼
You see Claude's clean response
```

---

## Quick Start

```bash
# Step 1 — Install
./install-utoe-demo.sh

# Step 2 — See UTOE working (no proxy needed)
node demo-invisible-agent.js

# Step 3 — See token comparison across 10 turns
./run-demo-comparison.sh
```

> **No proxy required for the core demo.** The proxy is optional for extra savings.

---

## What `utoe init` Creates

```
claude.md                     ← ≤60 lines. Claude reads this. UTOE manages it.
.utoe/
  schema.json                 ← project schema snapshot
  logs/
    tech_debt.md              ← populated by post-prompt hook when AI mentions TODO/FIXME
    bug_list.md               ← populated when AI mentions bug/fix/error
    architecture_decisions.md ← populated when AI mentions design decision/ADR
    security_checklist.md     ← populated when AI mentions security/vulnerability
    temp_decisions.md         ← populated when AI mentions temporary/workaround
    progress.md               ← populated when AI mentions completed/implemented
    errors.md
  skills/                     ← custom skill snippets loaded on-demand
```

The AI (Claude/Cursor) **never reads `.utoe/logs/`** unless UTOE RAG decides it is
relevant for the current prompt. This keeps the context window focused.

---

## Slash Commands (work natively inside Claude CLI)

| Command | What happens |
|---------|-------------|
| `/clear` | Wipes short-term history, resets session |
| `/compact` | Compresses history in-place — keeps meaning, cuts tokens |
| `/rewind 2` | Rolls back 2 turns |
| `/effort low` | 512-token output cap, aggressive compression |
| `/effort medium` | Default — balanced (1 024-token cap) |
| `/effort high` | Max quality, lossless compression (4 096-token cap) |
| `/init` | Creates/refreshes `claude.md` + `.utoe/logs/` |
| `/planning` | Planning mode — disables execution flags |
| `/btw <note>` | Side-note without creating a new user turn |
| `/status` | Live session stats: tokens used, saved, effort level |

Claude CLI receives these as normal text. UTOE's hooks intercept them **before**
they reach Claude, so Claude never sees `/compact` — it just gets a compressed history.

---

## Token Savings by Layer

| Layer | What it does | Typical saving |
|-------|-------------|----------------|
| Filler removal | strips "please", "could you kindly", "I was wondering if" | 5-15% |
| Whitespace normalization | collapses blank lines, trailing spaces | 2-5% |
| Sentence deduplication | removes repeated context across turns | 10-20% |
| Tool output compression | git log → 8-line summary, stack trace → 6-frame summary | 30-70% |
| Rolling window | keeps last 3 turns, not all 20 | 40-80% |
| RAG context injection | injects only relevant `.utoe/logs/` snippets | saves 0 tokens but avoids loading irrelevant ones |
| Effort-level cap | `/effort low` hard-caps output at 512 tokens | 30-60% on output |
| Post-prompt routing | long responses go to support files, not back into context | 20-40% next turn |

---

## Proof of Efficiency

Run the demo:
```bash
node demo-invisible-agent.js
```

Expected output (actual, from your machine):
```
Prompt 1 "I want to build a CLI Todo App..."
  Without UTOE  →  398 tokens
  With    UTOE  →  162 tokens  (-59%)

Prompt 5 (after /compact)
  Without UTOE  →  1,847 tokens (full history)
  With    UTOE  →  412  tokens  (-78%)

Prompt 10 (after /effort low)
  Without UTOE  →  4,210 tokens
  With    UTOE  →  498  tokens  (-88%)

Post-prompt routing:
  "architecture decision detected" → .utoe/logs/architecture_decisions.md
  "bug mentioned"                  → .utoe/logs/bug_list.md
  claude.md line count             → 43 lines (under 60-line limit ✓)
```

---

## Files in This Demo

| File | Purpose |
|------|---------|
| `demo-invisible-agent.js` | **Main demo** — shows UTOE working without a proxy |
| `install-utoe-demo.sh` | Installs `utoe-plugin@1.1.6`, runs `utoe init` |
| `start-utoe.sh` | Optional: starts proxy on 8787 for extra savings |
| `test-without-utoe.js` | Baseline: raw prompts, full history every turn |
| `test-with-utoe.js` | Proxy mode: routes via `ANTHROPIC_BASE_URL` |
| `measure-tokens.js` | Token counter + `--compare` results table |
| `run-demo-comparison.sh` | Runs both proxy tests + comparison table |
| `todo-app/src/index.ts` | The finished CLI app built during the demo |
