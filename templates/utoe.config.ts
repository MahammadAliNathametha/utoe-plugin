/**
 * UTOE Configuration File — TypeScript version
 *
 * Copy this file to your project root as `utoe.config.ts`.
 * Most users don't need this — UTOE works with zero config via .env.utoe.
 * Use this file for advanced routing, custom compression, or multi-project setups.
 *
 * @example
 * ```bash
 * # Zero-config (recommended for most users):
 * npx utoe init && npx utoe start
 * ```
 */

import type { UTOEConfig } from 'utoe-plugin';

const config: UTOEConfig = {

  // ── Server ──────────────────────────────────────────────────────────────────
  port: 8787,

  // ── Execution mode ───────────────────────────────────────────────────────────
  // 'bridge' — optimize prompts + pass to original AI (default, zero-config)
  // 'proxy'  — UTOE calls LLMs directly using your API keys
  UTOE_MODE: 'bridge',

  // ── Compression ──────────────────────────────────────────────────────────────
  compression: {
    losslessOnly: false,
    aggressiveCode: false,
    toolOutputs: true,
    preserveAST: false,
    useLLMLingua: false,
    ccrFloor: 0.7,
  },

  // ── Routing ──────────────────────────────────────────────────────────────────
  routing: {
    // preferredOrder: ['groq', 'deepseek', 'anthropic', 'openai', 'ollama'],
    // forceProvider: 'anthropic',
    // forceModel: 'claude-sonnet-4-6',
    // maxCostPerRequestUsd: 0.01,
    effortDefault: 'medium',
  },

  // ── Memory ───────────────────────────────────────────────────────────────────
  memory: {
    historyWindow: 6,
    maxHistoryTokens: 2000,
    ragEnabled: false,
    longTermTTLDays: 30,
  },

  // ── Token limits ─────────────────────────────────────────────────────────────
  limits: {
    maxInputTokens: 16000,
    maxOutputTokens: 1024,
    relevanceThreshold: 0.12,
  },

  // ── Command engine ────────────────────────────────────────────────────────────
  commands: {
    enableSlashCommands: true,
    enableEscEsc: true,
    enablePreHooks: true,
    enablePostHooks: true,
    autoStoreOutputs: true,
  },

  // ── Runtime flags ────────────────────────────────────────────────────────────
  flags: {
    disable_mcp: false,
    disable_auto_memory: false,
    disable_background_tasks: false,
    disable_thinking: false,
  },

  // ── Privacy ───────────────────────────────────────────────────────────────────
  privacy: {
    piiRedaction: true,
    telemetry: 'local',
  },
};

export default config;
