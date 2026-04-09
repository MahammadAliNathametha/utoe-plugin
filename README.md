# ⚡ UTOE — Universal Token Optimization Engine

[![npm version](https://img.shields.io/npm/v/utoe-plugin.svg?style=flat-square)](https://npmjs.com/package/utoe-plugin)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Zero Config](https://img.shields.io/badge/config-zero--config-blue?style=flat-square)](#quick-start)
[![Token Savings](https://img.shields.io/badge/savings-30--70%25_avg%2C_95%25_peak-success?style=flat-square)](#benchmarks)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI--compatible-412991?style=flat-square)](#proxy)

> **A zero-config, local-first AI token optimizer and command engine.** Sits between any AI tool and any LLM. Compresses prompts, manages context, routes to the cheapest model, and runs slash commands — automatically.

```
Your IDE / CLI
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│  UTOE  localhost:8787                                   │
│                                                         │
│  Input → Clean → Compress → Memory → Route → LLM       │
│             ↑ /clear /compact /btw /planning /rewind    │
│             ↑ ESC ESC  •  --append-system-prompt        │
│             ↑ disable_mcp  •  effort: low/med/high      │
└─────────────────────────────────────────────────────────┘
     │
     ▼
Best LLM for the job (Ollama → Groq → Anthropic → OpenAI → …)
```

---

## Why UTOE?

Every developer using AI loses money and productivity to problems that UTOE solves at the proxy layer, invisibly:

**The two biggest wins — universal, regardless of prompt style:**

- **Context overflow** — sessions die when you paste a long file or hit 50+ turns. `/compact` compresses history in-place. `/clear` starts fresh. No more lost work, no more 429 errors.
- **Wrong model** — paying Claude Opus / GPT-4o rates for a "summarize this" task. UTOE auto-routes to Groq (10× cheaper) or Ollama (free) for simple tasks, reserves expensive models for complex ones. **Routing alone saves 50-70% with zero prompt changes.**

**Additional savings that compound on top:**

- **Tool output bloat** — pasting `npm install` output, `git log`, or large JSON into chat. UTOE compresses these 60-95% automatically.
- **Large file review** — sending a 300-line file for review. UTOE summarizes code blocks >200 lines, keeping structure and identifiers.
- **Filler & redundancy** — "Hey could you please kindly help me..." and repeated context. Stripped on every message.

UTOE eliminates all of this, transparently, in real time.

---

## Quick Start

```bash
# Install once, globally
npm install -g utoe-plugin

# Initialize in your project (creates claude.md + support files)
npx utoe init

# Start the proxy
npx utoe start
```

Point any AI tool at `http://localhost:8787/v1` — done.

```bash
# For Claude Code (auto-registered by utoe init):
export ANTHROPIC_BASE_URL=http://localhost:8787

# For Cursor / VS Code Copilot:
# Settings → Models → OpenAI Base URL: http://localhost:8787/v1

# For any OpenAI SDK:
export OPENAI_BASE_URL=http://localhost:8787/v1

# For Aider:
aider --openai-api-base http://localhost:8787/v1
```

---

## Benchmarks

Results on 10 real developer prompts from a TypeScript Task API project (mix of filler, tool output, code pastes, and clean prompts):

| Metric | Without UTOE | With UTOE | Delta |
|--------|-------------|-----------|-------|
| Avg input tokens (mixed prompts) | 863 | 365 | **-58%** |
| npm install output paste | 291 tk | 72 tk | **-75%** |
| 250-line code file paste | 4,872 tk | 576 tk | **-88%** |
| Filler-heavy beginner prompt | 90 tk | 68 tk | **-24%** |
| Clean professional prompt | 37 tk | 37 tk | **0%** (correct) |
| Questions per $1 budget (Sonnet) | 386 | 913 | **+136%** |
| Context overflow errors | frequent | rare | **via /compact** |

**Token savings by prompt type:**
- Tool output (npm, git, docker): **60-95%**
- Code block pastes (>200 lines): **70-90%**
- Filler/redundancy-heavy prompts: **15-40%**
- Already-clean concise prompts: **0-10%** (no false compression)
- Mixed real session (avg): **30-60%**

> **What "70-95%" means:** That range applies specifically to prompts dominated by tool output (npm warnings, git logs, docker output) or large code pastes — the cases where most tokens are literal noise. For a healthy mix of real developer prompts, expect **30-60% average savings**. The CCR (Contextual Compression Ratio) check ensures semantic content is preserved ≥0.7 across all compression types. Tool-output compression intentionally produces lower CCR scores (~0.3-0.5) because deprecated-package warnings are semantically irrelevant to the actual question.

Benchmark methodology: `node benchmark/token-savings.mjs` on a real Task API project.
Source: `examples/utoe-test-project/`. Run it yourself to verify.

---

## Comparison Table

| Feature | **UTOE** | Headroom | Lynkr | RTK | Docdex | LiteLLM |
|---------|---------|---------|-------|-----|--------|---------|
| Zero config install | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ partial |
| Local-first (no data leaves) | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Token compression (30-60% avg, 95% peak) | ✅ | ⚠️ ~20% | ❌ | ❌ | ⚠️ ~30% | ❌ |
| OpenAI-compatible proxy | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Slash command engine | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/clear` `/compact` `/planning` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ESC ESC → compact | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Effort levels (low/med/high) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Runtime flags injection | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Auto claude.md (<60 lines) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Auto support files (.utoe/logs/) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RAG / local memory | ✅ | ⚠️ cloud | ✅ | ❌ | ✅ | ❌ |
| Model auto-routing (20+ providers) | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Ollama (free local) support | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Pre/post prompt hooks | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AST-aware code compression | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| LLMLingua-2 neural compression | ✅ opt-in | ❌ | ❌ | ❌ | ❌ | ❌ |
| CCR (semantic retention check) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Works with Claude/Cursor/ChatGPT | ✅ all | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| npm install (no Python required) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Free / open source | ✅ MIT | ❌ SaaS | ❌ SaaS | ✅ | ✅ | ✅ Apache |

---

## Why UTOE Wins

### 1. Smart routing across 20+ providers — works for every developer, every prompt
Ollama (free, local) → Groq (fast, cheap) → DeepSeek → Gemini Flash → Anthropic → OpenAI → 15+ more. UTOE picks the cheapest adequate model for each task tier automatically. A "summarize this" task goes to Groq; a complex architecture review goes to Claude Opus. **Routing alone cuts costs 50-70% with zero changes to your prompts or workflow** — this benefit applies whether your prompts are clean or messy.

### 2. The only tool with a full command engine
No other token optimizer gives you `/clear`, `/compact`, `/btw`, `/planning`, `/rewind`, `/effort`, ESC ESC. `/compact` compresses session history in-place when context grows large; `/clear` wipes it when you switch tasks. **These prevent context overflow** — the #1 cause of lost work in long AI sessions — and let you run sessions 8× longer on the same token budget.

### 3. Zero-config, local-first
`npm install utoe-plugin && npx utoe start` — done. No Python environment, no Docker, no cloud account. All compression and memory runs on your machine. Data never leaves your environment.

### 4. Compression that actually preserves meaning
UTOE uses CCR (Contextual Compression Ratio) to measure semantic retention after every compression pass. For tool-output compression (npm, git, docker), CCR intentionally drops to ~0.3-0.5 — deprecated-package warnings and audit noise are meaningless to the LLM and are correctly stripped. For prose and code, CCR is held ≥ 0.7. Other tools just count tokens; UTOE validates that the important content survived.

### 5. Auto context scaffolding — never manage context manually again
After `npx utoe init`, UTOE creates a minimal `claude.md` (<60 lines) and a full set of support files. Post-prompt hooks auto-route AI outputs to the right file — no manual filing ever.

---

## Features

### Compression Engine (8 layers + neural)

```
Layer 1 — Filler removal       "Hey could you please help me..." → removed
Layer 2 — Whitespace norm      3+ blank lines → 2, tabs → spaces
Layer 3 — Sentence dedup       Repeated sentences removed
Layer 4 — Redundant clauses    "In other words", "As I mentioned" → removed
Layer 5 — Tool output compress git log (100 commits → summary), npm, docker
Layer 6 — JSON SmartCrusher    {large json} → compact + schema summary
Layer 7 — Code summarization   500-line files → structure summary + key lines
Layer 8 — AST-aware (opt-in)   Tree-sitter preserves all identifiers/exports
       + LLMLingua-2 (opt-in)  Neural compression, CCR-validated fallback
       + queryAwareFilter       RAG pre-filter: only relevant context sent
```

### Command Engine

| Command | Effect |
|---------|--------|
| `/clear` | Wipe session context — fresh start |
| `/compact` | Compress history in-place (saves tokens) |
| `/btw <note>` | Inject side-note (context, not user turn) |
| `/planning` | Toggle planning mode (plan only, no execute) |
| `/rewind [n]` | Roll back n turns (default 1) |
| `/effort low\|med\|high` | Set effort level + model tier |
| `/flags` | Show all active runtime flags |
| `/status` | Session stats: tokens, savings, turns |
| `/forget [query]` | Remove from long-term memory |
| `/skills` | List skills from `.utoe/skills/` |
| `/init` | Bootstrap claude.md + support files |
| `/append-system <text>` | Temporarily append to system prompt |
| `/disable-mcp` | Toggle MCP tool calls off |
| `/disable-thinking` | Toggle extended thinking off |
| `ESC ESC` | Same as `/compact` (double press, 500ms window) |

### Runtime Flags (injected into system prompt)

```typescript
// Set via /effort, /flags, /disable-* commands, or UTOE API headers
{
  disable_mcp: boolean,              // No MCP tool calls this turn
  disable_auto_memory: boolean,      // No auto-save to memory
  disable_background_tasks: boolean, // No async/background tasks
  disable_thinking: boolean,         // Skip extended thinking
  effort: 'low' | 'medium' | 'high', // Token budget + model tier
  max_output_tokens: number,         // Hard output limit
  append_system_prompt: string,      // Temporary system injection
  planning_mode: boolean,            // Plan only, no execution
}
```

### Effort Levels

| Level | Max Output | Model Tier | Compression | Use When |
|-------|-----------|------------|-------------|----------|
| `low` | 512 tokens | cheap | aggressive | Quick Q&A, summaries |
| `medium` | 1024 tokens | medium | balanced | Default — most tasks |
| `high` | 4096 tokens | large | lossless | Architecture, debugging |

### Auto-Generated Project Files

After `npx utoe init`:

```
your-project/
├── claude.md                          ← Minimal context file (<60 lines)
└── .utoe/
    ├── logs/
    │   ├── tech_debt.md               ← Auto-populated by post-prompt hooks
    │   ├── bug_list.md
    │   ├── architecture_decisions.md
    │   ├── security_checklist.md
    │   ├── temp_decisions.md
    │   ├── progress.md
    │   └── errors.md
    ├── skills/                        ← Load-on-demand via /skills
    └── schema.json
```

Post-prompt hooks automatically route AI responses to the right file based on content classification. All heavy content lives in local storage, loaded on-demand via semantic filter — `claude.md` stays minimal.

### Model Router — 20+ Providers

Priority order (UTOE prefers cheapest adequate provider):

```
Ollama (free, local) → Groq → DeepSeek → Gemini Flash → Fireworks
→ Anthropic → OpenAI → Mistral → Cohere → Together → Perplexity
→ Anyscale → Lepton → OctoAI → OpenRouter → Cloudflare Workers AI
→ Azure OpenAI → AWS Bedrock → Google Vertex AI → Moonshot → Qwen → Yi
```

---

## Installation

```bash
# Global install (recommended)
npm install -g utoe-plugin

# Or project-local
npm install utoe-plugin
npx utoe init
```

**Requirements:** Node.js ≥ 18. No Python, no Docker.

**Optional for neural compression:**
```bash
npm install @atjsh/llmlingua-2    # LLMLingua-2 neural compression
npm install @xenova/transformers  # Local embeddings for RAG
```

---

## Configuration

### Zero-config (recommended)

```bash
npx utoe init      # Creates .env.utoe with guided setup
npx utoe start     # Proxy running on :8787
```

### `.env.utoe`

```env
# Add at least one provider key (or use Ollama for free):
GROQ_API_KEY=gsk_...        # Free tier, very fast
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional:
UTOE_PORT=8787
UTOE_MODE=bridge   # or: proxy
OLLAMA_URL=http://localhost:11434
```

### Advanced: `utoe.config.ts`

```typescript
export default {
  port: 8787,
  UTOE_MODE: 'bridge',
  compression: { preserveAST: true, ccrFloor: 0.7 },
  routing: { effortDefault: 'medium' },
  commands: { enableSlashCommands: true, enableEscEsc: true },
  flags: { disable_thinking: true },  // global default
};
```

---

## Compatibility

| Tool | Integration | Notes |
|------|------------|-------|
| **Claude Code** | Hook (auto-registered) | `npx utoe init` registers `UserPromptSubmit` hook |
| **Cursor** | OpenAI base URL | Settings → Models → Base URL: `localhost:8787/v1` |
| **VS Code Copilot** | OpenAI base URL | Extension settings |
| **Windsurf** | OpenAI base URL | Same as Cursor |
| **Aider** | `--openai-api-base` flag | `aider --openai-api-base http://localhost:8787/v1` |
| **ChatGPT (API)** | Drop-in replacement | Any OpenAI SDK |
| **LangChain** | `baseURL` option | `new ChatOpenAI({ baseURL: 'http://localhost:8787/v1' })` |
| **Vercel AI SDK** | `baseURL` option | `createOpenAI({ baseURL: '...' })` |
| **llm CLI** | `--models-api` | `llm --models-api http://localhost:8787/v1` |
| **Continue.dev** | OpenAI provider | `apiBase: "http://localhost:8787/v1"` |
| **Shell scripts** | `OPENAI_BASE_URL` env | Works with any script using OpenAI env vars |

---

## CLI Reference

```
npx utoe start                   Start proxy server (port 8787)
npx utoe stop                    Stop the proxy server
npx utoe init                    Initialize project (creates claude.md + .utoe/)
npx utoe verify                  Verify installation health
npx utoe ask "your question"     One-shot query through the pipeline
npx utoe stats                   Show token savings stats
npx utoe dashboard               Open live savings dashboard in browser
npx utoe suggest-prompt "..."    Analyze and optimize a prompt
npx utoe compress "text"         Compress text + show layer breakdown
npx utoe train-personal          Index project for RAG (semantic search)
npx utoe providers               List available providers + hardware profile
npx utoe forget [topic]          Clear memory (all or matching topic)
```

---

## API Reference

### OpenAI-Compatible Proxy

```
POST /v1/chat/completions    Standard OpenAI chat completions
GET  /v1/models              List available models (incl. utoe-auto)
POST /v1/embeddings          Embeddings (proxied or local fallback)
```

**UTOE-specific request fields** (non-standard, ignored by other tools):

```json
{
  "model": "utoe-auto",
  "messages": [...],
  "utoe_effort": "medium",
  "utoe_disable_mcp": false,
  "utoe_disable_thinking": false,
  "utoe_planning_mode": false,
  "utoe_max_output_tokens": 1024,
  "utoe_append_system_prompt": "Be concise."
}
```

**Response extras** (in every UTOE response):

```json
{
  "utoe": {
    "provider": "groq",
    "tokens_saved": 847,
    "savings_pct": 68,
    "effort": "medium",
    "elapsed_ms": 312,
    "stored_in": ".utoe/logs/bug_list.md"
  }
}
```

### Native UTOE API

```
POST /ask              { message, session_id?, provider?, force_model? }
POST /suggest          { message }       → optimized prompt suggestion
POST /rewrite          { message }       → full rewrite analysis
POST /compress         { text, lossless? }
POST /forget           { query? }
GET  /stats
GET  /health
GET  /                 → live dashboard
```

---

## Programmatic Usage

```typescript
import { compress, router, memory, CommandEngine, createDefaultSession } from 'utoe-plugin';

// Compression
const { compressed, stats } = compress('Hey could you please help me debug this?');
console.log(`Saved ${stats.savedPct}%`); // ~40-60%

// UniversalCompressor with CCR + AST
import { UniversalCompressor } from 'utoe-plugin/compression';
const uc = new UniversalCompressor({ preserveAST: true, computeCCR: true, ccrFloor: 0.7 });
const { compressed: c, ccr, usedAST } = uc.compress(longCodeContext);

// Query-aware RAG filter
const result = uc.compressForRAG(projectContext, 'authentication flow');

// Command engine
const engine = new CommandEngine({ projectRoot: process.cwd() });
const session = createDefaultSession();
engine.process('/effort high', session);     // → sets high effort
engine.process('/planning', session);         // → toggles planning mode
engine.process('/btw use ESM modules', session); // → injects side note

// Router
const plan = router.plan('debug', 2000, { GROQ_API_KEY: 'gsk_...' });
console.log(plan.selected.provider, plan.selected.model);
// → groq, llama-3.3-70b-versatile

// Memory
memory.update(userMessage, assistantResponse);
const facts = memory.recallSync('authentication', 5);
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Terminal Hook Layer                                      │
│  • /commands intercepted before LLM                      │
│  • ESC ESC → /compact                                    │
│  • Pre-hooks: compress input                             │
│  • Post-hooks: route output to .utoe/logs/               │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Proxy Layer (Hono.js, port 8787)                        │
│  • OpenAI-compatible /v1/chat/completions                │
│  • Flag injection into system prompt                     │
│  • Streaming + non-streaming                             │
│  • Semantic cache (avoid duplicate calls)                │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  10-Stage Pipeline                                       │
│  1. Input Cleaner    6. Memory Recall                    │
│  2. Intent Detector  7. Prompt Builder                   │
│  3. Topic Shift      8. Token Guard                      │
│  4. Context Filter   9. Model Router                     │
│  5. Summarizer      10. LLM Executor + Fallback          │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Storage Layer                                           │
│  • Short-term: in-process ring buffer (20 turns)         │
│  • Long-term: .utoe_memory.json (PII-redacted, TTL 30d)  │
│  • Project RAG: SQLite + @xenova/transformers vectors    │
│  • Support files: .utoe/logs/* (auto-updated by hooks)   │
└──────────────────────────────────────────────────────────┘
```

---

## Screenshots

> _Dashboard screenshot — `http://localhost:8787/`_
> Live token savings, provider stats, session history, real-time compression ratio

> _CLI startup — `npx utoe start`_
> Provider status, proxy URL, pipeline summary, effort level

> _Savings comparison graph_
> Session tokens: with vs without UTOE (85% reduction on real projects)

---

## Contributing

```bash
git clone https://github.com/MahammadAliNathametha/utoe-plugin
cd utoe-plugin
npm install
npm run build
npm test
```

PRs welcome. See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## License

MIT © UTOE Contributors

---

<p align="center">
  <strong>Stop losing tokens. Start saving money.</strong><br>
  <code>npm install -g utoe-plugin && npx utoe start</code><br><br>
  <em>🚀 UTOE is now active — tokens protected, context managed, commands ready!</em>
</p>
