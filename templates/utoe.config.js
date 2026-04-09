/**
 * UTOE Configuration File — JavaScript version
 *
 * Copy this file to your project root as `utoe.config.js`.
 * Most users don't need this — UTOE works with zero config via .env.utoe.
 * Use this file for advanced routing rules, custom compression, or multi-project setups.
 *
 * @example
 * ```bash
 * # Zero-config (recommended for most users):
 * npx utoe init && npx utoe start
 * ```
 *
 * @type {import('utoe-plugin').UTOEConfig}
 */
export default {
  // ── Server ─────────────────────────────────────────────────────────────────
  port: 8787,

  // ── Execution mode ──────────────────────────────────────────────────────────
  // 'bridge' — optimize prompts only, forward to original AI (default)
  // 'proxy'  — UTOE calls LLMs directly using your API keys
  UTOE_MODE: 'bridge',

  // ── Compression ────────────────────────────────────────────────────────────
  compression: {
    losslessOnly: false,
    aggressiveCode: false,
    toolOutputs: true,
  },

  // ── Routing ─────────────────────────────────────────────────────────────────
  routing: {
    // preferredOrder: ['groq', 'anthropic', 'openai', 'ollama'],
    // forceProvider: 'anthropic',
    // forceModel: 'claude-sonnet-4-6',
    // maxCostPerRequestUsd: 0.01,
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  memory: {
    historyWindow: 6,
    maxHistoryTokens: 2000,
    ragEnabled: false,
  },

  // ── Token limits ────────────────────────────────────────────────────────────
  limits: {
    maxInputTokens: 16000,
    maxOutputTokens: 1024,
    relevanceThreshold: 0.12,
  },

  // ── Privacy ─────────────────────────────────────────────────────────────────
  privacy: {
    piiRedaction: true,
    telemetry: 'local',
  },
};
