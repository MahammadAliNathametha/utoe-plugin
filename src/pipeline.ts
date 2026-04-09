/**
 * UTOE 10-Stage Pipeline
 *
 * Stages:
 *  1. Input Cleaner      — strip filler, normalize whitespace
 *  2. Intent Detector    — classify task type
 *  3. Topic Shift        — detect conversation topic change
 *  4. Model Router       — plan provider/model + budget tokens
 *  5. Memory Recall      — inject relevant facts (budgeted)
 *  6. Prompt Builder     — combine input + memory context
 *  7. Flag Injection     — inject runtime flags via CommandEngine
 *  8. Token Guard        — trim messages to context window budget
 *  9. LLM Executor       — call provider with fallback chain
 * 10. Telemetry + Learn  — update session state and memory
 */

import { memory } from './memory.js';
import { router } from './router.js';
import { executor } from './executor.js';
import { compress, estimateTokens } from './compression.js';
import { suggestBetterPrompt as suggestPrompt, scorePrompt, detectIntent } from './prompt-suggester.js';
import { enforceTokenEnvelope } from './token-guard.js';
import { commandEngine, createDefaultSession, type SessionState } from './command-engine.js';
import type { ChatMessage, PipelineResult, UTOEConfig } from './types.js';

/**
 * Result of running stages 1-8 only (no LLM call).
 * Used by the transparent proxy: UTOE optimizes the messages, caller forwards them.
 */
export interface OptimizedMessages {
  messages: ChatMessage[];
  savedTokens: number;
  savedPct: number;
  originalTokens: number;
  task: string;
  topic: string;
}

/**
 * Run stages 1–8 of the pipeline (optimize only, no LLM execution).
 * The caller is responsible for forwarding the resulting messages to the LLM.
 * Used by the transparent Anthropic proxy so Claude Code's own auth token is preserved.
 */
export async function optimizeMessages(
  input: string | ChatMessage[],
  config: UTOEConfig = {},
  session: SessionState = createDefaultSession()
): Promise<OptimizedMessages> {
  const messages: ChatMessage[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input;

  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const rawInput = lastUserMsg?.content ?? '';

  const { compressed: cleanedInput, stats: compressionStats } = compress(rawInput, {
    lossless: session.flags.effort === 'high',
    aggressiveCode: session.flags.effort === 'low',
  });

  const task = detectIntent(cleanedInput);
  const topic = detectTopic(cleanedInput);
  session.lastTopic = topic;

  const inputTokens = estimateTokens(cleanedInput);
  const routePlan = router.plan(task, inputTokens, config, {
    effort: session.flags.effort ?? config.effort ?? 'medium',
    sessionId: session.sessionId,
  });
  const selected = routePlan.selected;

  const memoryFacts = await memory.recall(cleanedInput, 5, {
    budget: selected.memory_budget_tokens,
    provider: selected.provider,
    model: selected.model,
  });

  const enrichedInput = memoryFacts.length > 0
    ? `[Memory Context]\n${memoryFacts.join('\n')}\n\n[User Prompt]\n${cleanedInput}`
    : cleanedInput;

  const enrichedMessages: ChatMessage[] = messages.map(m =>
    m === lastUserMsg ? { ...m, content: enrichedInput } : m
  );

  const preparedMessages = commandEngine.prepareMessages(enrichedMessages, session);

  const finalMessages = enforceTokenEnvelope(preparedMessages, selected.context_budget_tokens, {
    provider: selected.provider,
    model: selected.model,
  });

  return {
    messages: finalMessages,
    savedTokens: compressionStats.savedTokens,
    savedPct: compressionStats.savedPct,
    originalTokens: compressionStats.originalTokens,
    task,
    topic,
  };
}

/**
 * Run the full UTOE pipeline for a chat request.
 * Accepts either a plain string or a ChatMessage[] array.
 */
export async function runPipeline(
  input: string | ChatMessage[],
  config: UTOEConfig = {},
  session: SessionState = createDefaultSession()
): Promise<PipelineResult> {
  const startTime = Date.now();

  // ── Normalize input ───────────────────────────────────────────────────────
  const messages: ChatMessage[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input;

  // ── Stage 1: Input cleaner ────────────────────────────────────────────────
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const rawInput = lastUserMsg?.content ?? '';

  const { compressed: cleanedInput, stats: compressionStats } = compress(rawInput, {
    lossless: session.flags.effort === 'high',
    aggressiveCode: session.flags.effort === 'low',
  });

  // ── Stage 2-3: Intent + topic shift ──────────────────────────────────────
  const task = detectIntent(cleanedInput);
  const topic = detectTopic(cleanedInput);
  const topicShifted = session.lastTopic != null && session.lastTopic !== topic;
  session.lastTopic = topic;

  // ── Stage 4: Model router ─────────────────────────────────────────────────
  const inputTokens = estimateTokens(cleanedInput);
  const routePlan = router.plan(task, inputTokens, config, {
    effort: session.flags.effort ?? config.effort ?? 'medium',
    sessionId: session.sessionId,
  });
  const selected = routePlan.selected;

  // ── Stage 5: Memory recall (token-budgeted) ───────────────────────────────
  const memoryFacts = await memory.recall(cleanedInput, 5, {
    budget: selected.memory_budget_tokens,
    provider: selected.provider,
    model: selected.model,
  });

  // ── Stage 6: Prompt builder ───────────────────────────────────────────────
  const enrichedInput = memoryFacts.length > 0
    ? `[Memory Context]\n${memoryFacts.join('\n')}\n\n[User Prompt]\n${cleanedInput}`
    : cleanedInput;

  // Replace last user message content with the compressed + enriched version
  const enrichedMessages: ChatMessage[] = messages.map(m =>
    m === lastUserMsg ? { ...m, content: enrichedInput } : m
  );

  // ── Stage 7: Flag injection ───────────────────────────────────────────────
  const preparedMessages = commandEngine.prepareMessages(enrichedMessages, session);

  // ── Stage 8: Token guard ──────────────────────────────────────────────────
  const finalMessages = enforceTokenEnvelope(preparedMessages, selected.context_budget_tokens, {
    provider: selected.provider,
    model: selected.model,
  });

  // ── Stage 9: LLM execution ────────────────────────────────────────────────
  const execution = await executor.execute(finalMessages, {
    provider: selected.provider,
    model: selected.model,
    fallbackChain: routePlan.fallback_chain,
  });

  // ── Stage 10: Telemetry + learn ───────────────────────────────────────────
  const elapsedMs = Date.now() - startTime;
  const outputTokens = estimateTokens(execution.text, selected.provider, selected.model);

  commandEngine.onResponseReceived(
    rawInput,
    execution.text,
    inputTokens,
    outputTokens,
    compressionStats.savedTokens,
    session
  );

  return {
    response: execution.text,
    optimizedPrompt: enrichedInput,
    mode: config.mode ?? 'bridge',
    model: execution.model,
    provider: execution.provider,
    tier: selected.tier,
    task,
    topic,
    topicShifted,
    inputTokens,
    outputTokens,
    savedTokens: compressionStats.savedTokens,
    savingsPct: compressionStats.savedPct,
    compressionStats,
    elapsedMs,
    routePlan,
    policyVersion: routePlan.router_policy_version,
    conservativeOverride: routePlan.conservative_override,
    routeConfidence: routePlan.confidence,
    telemetry: {
      requestId: routePlan.request_id,
      sessionId: session.sessionId ?? 'local',
      traceId: routePlan.trace_id,
      fallbackUsed: execution.fallbackUsed,
      attempts: execution.attempts,
      estimatedCostUsd: (inputTokens + outputTokens) * (routePlan.candidates_ranked[0]?.predicted_cost_per_1k_usd ?? 0) / 1000,
    },
  };
}

/**
 * Detect the broad topic category from text.
 */
function detectTopic(text: string): 'code' | 'data' | 'writing' | 'infra' | 'general' {
  const t = text.toLowerCase();
  if (/\b(function|class|import|export|const|let|var|def|return|async|await|bug|error|refactor|test)\b/.test(t)) return 'code';
  if (/\b(sql|query|database|table|schema|csv|json|pandas|dataframe|analytics)\b/.test(t)) return 'data';
  if (/\b(docker|kubernetes|k8s|deploy|ci\/cd|pipeline|terraform|aws|gcp|azure|nginx|server)\b/.test(t)) return 'infra';
  if (/\b(write|essay|article|blog|draft|email|report|summarize|translate)\b/.test(t)) return 'writing';
  return 'general';
}

/**
 * Suggest a better version of a prompt.
 * Returns a structured SuggestionResult with JSON rewrite, task detection, and scoring.
 */
export function suggestBetterPrompt(prompt: string) {
  return suggestPrompt(prompt);
}
