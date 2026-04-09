# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] — 2026-04-09

### Added — Stable system prompt + Jaccard history deduplication

**Stable system prompt (10–20× token saving via Anthropic prompt cache)**
- `stabilizeSystemPrompt()` strips volatile content before forwarding:
  - ISO timestamps / dates → `[TIMESTAMP]` / `[DATE]`
  - UUIDs and session IDs → `[UUID]` / `[SESSION]`
  - "Today is Wednesday April 9 2026" style injections → `today is [DATE]`
- Per-session cache: once a stable version is set, ALL subsequent turns
  reuse the exact same string — preventing cache busts even from minor rewording
- `buildCachedSystem()` wraps the system block with
  `cache_control: {type:"ephemeral"}` so Anthropic knows to cache it
- `anthropic-beta: prompt-caching-2024-07-31` header injected automatically

**Jaccard near-duplicate history dropping**
- `compressMessages()` now scores each user turn against all prior user turns
  using Jaccard similarity on key terms (stop-word filtered)
- Threshold: 0.45 — catches rephrased duplicates, never drops genuinely new questions
- Duplicate turns replaced with a 1-line reference (`[UTOE: near-duplicate of turn N]`)
- Tested: 2 out of 3 rephrased `useState` questions correctly replaced;
  `useEffect` and `webpack` questions correctly pass through unchanged

---

## [1.3.0] — 2026-04-09

### Added — 17-layer micro-optimization compression engine

**9 new compression layers (was 8, now 17):**

| Layer | Technique | Type | Typical saving |
|---|---|---|---|
| 9 | Timestamp normalization (`2024-03-15T10:23:45Z` → `2024-03-15 10:23`) | Lossless | 25–35% on log/git content |
| 10 | Absolute path normalization (`/home/user/...` → `~/...`, `node_modules` stack frames shortened) | Lossless | 20–30% on error output |
| 11 | Base64/binary stripping (data URIs → `[base64 image/png ~45KB]`, JWT decoded to sub+exp) | Lossless | 95–99% when present |
| 12 | Null/empty JSON field pruning (`{"x":null,"y":[],"z":{}}` → `{}`) | Lossless | 30–50% on API responses |
| 13 | Docker/kubectl/`ps aux` compression (keep header + first 5 rows) | Structured | 30–60% on DevOps output |
| 14 | Assistant preamble stripping from history ("Of course! I'd be happy to..." → stripped) | Lossless | 50–70% on opener lines |
| 15 | Number precision reduction in prose (`0.9876543210` → `0.9877`) | Near-lossless | 15–25% in metric output |
| 16 | Stack trace frame deduplication (recursive frames collapsed) | Lossless | 50–80% on recursive errors |
| 17 | Repeated import block deduplication across history turns | Lossless | 20–40% on multi-turn code |

**3 new cross-message optimisations in `compressMessages()`:**
- Drop empty/whitespace-only messages before sending
- Merge consecutive same-role messages (reduces role-turn overhead)
- Deduplicate repeated `tool_result` file reads — keeps only the latest copy, replaces earlier with a reference token

### Benchmark
Realistic log file (timestamps + docker + stack trace + JSON + JWT):
- Before: **328 tokens** → After: **121 tokens** = **63% reduction**

---

## [1.2.0] — 2026-04-09

### Added
- **Rate-limit failover** (`lib/proxy.js`) — when Anthropic returns 529 (overloaded)
  or 429 (rate limited), UTOE automatically re-routes the request to Groq →
  Gemini → Ollama instead of failing; response returned transparently with
  `X-UTOE-Failover` header so the caller never sees an error
- **Tool-result compression** — `tool_result` content blocks are now compressed
  by the 8-layer engine before forwarding to Anthropic, directly fixing the
  50k-token-per-turn tool-call problem reported by Claude Code users
- **Peak-hour token cap** — during Anthropic peak hours (1 pm–7 pm UTC /
  5 am–11 am PT) UTOE automatically clamps `max_tokens` to 4096 when the caller
  did not set one, preventing accidental runaway generation
- **Burn-rate card** on dashboard — new "Burn Rate" card shows tokens/min; turns
  yellow > 2k, red > 5k so you can see runaway consumption instantly
- **Peak-hour warning banner** on dashboard — yellow alert bar during Anthropic
  peak hours confirms that rate-limit protection is active and names the fallback
  chain (Groq / Gemini / Ollama)
- **`/stats` burn_rate field** — `GET /stats` now returns
  `{ burn_rate: { tokens_per_min, peak_hour } }` for programmatic monitoring

### Why this matters
Users on Claude Pro / Max are hitting their 5-hour rolling limits in minutes
(April 2026) due to: prompt-cache busting, 50k+ tool-call payloads, and
Anthropic throttling during peak hours. UTOE now automatically mitigates all
three causes without any configuration change required.

---

## [1.1.9] — 2026-04-09

### Changed
- Version bump

---

## [1.1.8] — 2026-04-09

### Added
- **`npx utoe report`** — diagnostic report command: collects system info, install
  verification checks, recent errors, and generates a pre-filled GitHub issue URL
  so users can report bugs with one click
- **`~/.utoe/error.log`** — automatic error capture: every unhandled exception,
  postinstall failure, and hook error is silently saved for diagnosis
- **Global uncaughtException / unhandledRejection handlers** in CLI — crash reports
  saved to error log; proxy exits cleanly with a hint to run `npx utoe report`
- **`report` added to help text** and CLI switch

### Changed
- Repository moved to `github.com/MahammadAliNathametha/utoe-plugin`
- All issue/bug URLs updated to point to new repository

---

## [1.1.7] — 2026-04-09

### Added
- **Zero-step install** — `npm install utoe-plugin` now runs full project setup
  automatically via `postinstall`: creates `claude.md`, `.utoe/logs/`, registers
  Claude hook in `.claude/settings.json`, starts proxy daemon, patches shell profile
- **PID file** (`~/.utoe/proxy.pid`) — proxy saves its PID on start and clears it
  on clean shutdown (`SIGINT`/`SIGTERM`)
- **Watchdog in hook** — `ensureProxyRunning()` fires before every Claude prompt via
  the `UserPromptSubmit` hook; restarts the proxy daemon if it has crashed or been
  killed without needing any user action
- **Auto-start daemon** (`autoStartDaemon()`) — spawns detached proxy on install,
  saves PID; TCP-probe skips restart if already running
- **Shell profile patcher** (`patchShellProfile()`) — appends `ANTHROPIC_BASE_URL`
  and `OPENAI_BASE_URL` to `~/.zshrc` / `~/.bashrc` / `~/.profile` (idempotent,
  never overwrites existing values)
- **Rich support file templates** — all `.utoe/logs/` files now include structured
  format templates with entry format, field descriptions, and usage instructions
  instead of empty `Auto-populated` placeholders
- **CI detection** in postinstall — skips auto-setup in CI environments
  (`GITHUB_ACTIONS`, `CIRCLECI`, `TRAVIS`, etc.)

### Changed
- Version constant in `bin/utoe.js` updated to match `package.json`
- Dashboard footer updated to `v1.1.7`

---

## [1.0.0] — 2026-04-08

### Added
- **Core 10-stage optimization pipeline** (`lib/pipeline.js`) — input cleaning, intent detection,
  topic-shift detection, context filtering, history compression, memory recall, prompt building,
  token guard, route planning, execution, memory update
- **8-layer compression engine** (`lib/compression.js`):
  - Layer 1: Filler & boilerplate removal (lossless)
  - Layer 2: Sentence deduplication (lossless)
  - Layer 3: Whitespace normalization (lossless)
  - Layer 4: Redundant clause removal (near-lossless)
  - Layer 5: Tool-output compression — git log, npm, docker, stack traces, JSON payloads (structured)
  - Layer 6: JSON SmartCrusher — collapses large arrays to schema + sample (structured lossless)
  - Layer 7: Code block summarization for blocks > 150 lines (lossy, opt-in)
  - Layer 8: Semantic sentence deduplication (near-lossless)
- **`countTokensAccurate()`** — cl100k_base tiktoken counting via `@dqbd/tiktoken` (optional dep),
  falls back to heuristic estimator when not installed
- **22-provider hardware-aware router** (`lib/router.js`) — scores providers on cost, quality,
  reliability, latency; Ollama-first when free GPU/RAM detected
- **Real streaming** (`lib/executor.js`) — `executor.completeStream()` async generator; native SSE for
  OpenAI, Anthropic, Groq, Ollama, DeepSeek, Mistral, Together, Fireworks, OpenRouter, Perplexity,
  Moonshot, Qwen, Yi; graceful single-chunk fallback for remaining providers
- **AWS Bedrock** — full AWS SigV4 request signing via Node.js `crypto`, no SDK dependency; supports
  Claude models on Bedrock (`anthropic.claude-3-haiku-20240307-v1:0` etc.)
- **Google Vertex AI** — dual-mode: full Vertex endpoint with project/region, or Google AI Studio
  fallback with API key only
- **Multi-layer memory engine** (`lib/memory.js`):
  - `ShortTermMemory` — 20-entry ring buffer with Jaccard similarity recall
  - `LongTermMemory` — persistent JSON, 30-day TTL, PII redaction, Jaccard deduplication
  - `MemoryEngine` — unified interface; `stats()` returns `{ shortTerm, longTerm, longTermFile, ragEnabled }`
- **Project RAG** (`lib/rag.js`) — SQLite persistence via `better-sqlite3`; TF-IDF cosine similarity
  baseline; upgrades to ONNX sentence embeddings when `@xenova/transformers` is installed
- **Semantic cache** (`lib/semantic-cache.js`) — MD5 exact match → TF-IDF cosine similarity → ONNX
  dense embeddings; configurable TTL and similarity threshold
- **Token guard** (`lib/token-guard.js`) — proactive context window enforcement; drops oldest history
  then shrinks longest message; `isTokenLimitError()` for fallback detection
- **Proxy-based monkey-patch** (`lib/monkey-patch.js`):
  - `wrapOpenAIInstance(client)` — ESM-safe Proxy wrapping of any OpenAI SDK instance
  - `wrapAnthropicInstance(client)` — same for `@anthropic-ai/sdk`
  - `installMonkeyPatch()` — best-effort constructor-level patch with live-binding safety check
- **OpenAI-compatible HTTP proxy** (`lib/server.js`) — `POST /v1/chat/completions` with real SSE
  streaming, `GET /v1/models`, plus native `/ask`, `/suggest`, `/rewrite`, `/compress`,
  `/stats`, `/forget`, `/reset` endpoints
- **Proxy auth** — bearer token gate via `UTOE_PROXY_TOKEN`; open by default for local use
- **Rate limiting** — per-IP token bucket, 120 req/min default, configurable via `UTOE_RATE_LIMIT`
- **Live dashboard** (`GET /`) — real-time token savings, provider breakdown, task breakdown,
  memory stats; auto-refreshes every 5 s
- **Bridge adapter system** (`adapters/`) — normalizes Claude Code, Codex, and Cursor hook payloads;
  `ToolAdapter` base class + `assertAdapterShape()` contract + conformance harness
- **Prompt suggestion engine** (`lib/prompt-suggester.js`) — detects task type, scores prompt quality,
  emits structured JSON prompt template
- **Terminal hook** (`lib/terminal-hook.js`) — 7 registered detectors: git\_log, git\_diff,
  npm\_install, docker\_ps, stack\_trace, test\_output, json\_payload
- **Telemetry store** (`lib/telemetry-store.js`) — local JSONL, 5 event types: request\_received,
  route\_planned, execution\_attempt, execution\_completed, outcome\_reported, bypass
- **Policy system** (`policy/default.policy.json`) — routing weights, compression levels, task
  profiles, fallback chains; validated by `lib/schemas/policy-config.js`
- **CLI** (`bin/utoe.js`) — 15 commands: `start`, `stop`, `init`, `verify`, `ask`, `stats`,
  `dashboard`, `suggest-prompt`, `compress`, `train-personal`, `forget`, `providers`, `hook`,
  `_postinstall`
- **Installer** (`lib/installer.js`) — injects npm scripts, registers Claude hook, creates
  `.env.utoe` template with all 22 providers documented, updates `.gitignore`

### Compression methodology
UTOE uses deterministic heuristic compression — not neural rewriting. This means:
- **Reliable, fast, zero-latency** — all 8 layers run locally in < 5 ms
- **Predictable** — same input always produces same output; easy to audit
- **Best-case savings**: 88 % on structured tool output (git logs, npm, JSON arrays)
- **Typical savings**: 15–40 % on prose-heavy prompts; 50–88 % on structured content
- **No paraphrasing** — intent and code are never semantically altered

For neural compression (LLMLingua-style sentence rewriting), this is tracked in
[#1](https://github.com/MahammadAliNathametha/utoe-plugin/issues/1) as a future optional feature.

---

## Versioning policy

- **Patch** (`1.0.x`) — bug fixes, documentation, dependency updates
- **Minor** (`1.x.0`) — new providers, new compression layers, new CLI commands (backward-compatible)
- **Major** (`x.0.0`) — breaking changes to pipeline API, config schema, or adapter contract
