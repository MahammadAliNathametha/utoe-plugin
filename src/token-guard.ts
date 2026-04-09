/**
 * UTOE Token Guard — enforces context window budgets on message arrays.
 *
 * Trims oldest non-pinned messages to fit within the requested token budget.
 * Always preserves:
 *  - The system message (if present at index 0)
 *  - The last user message (so the model always has the current request)
 */

import type { ChatMessage, ProviderName } from './types.js';
import { estimateTokens } from './compression.js';

// ─── Context window table (tokens) ───────────────────────────────────────────

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  // Anthropic
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Google
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro-001': 1_000_000,
  'gemini-1.5-flash-001': 1_000_000,
  // Groq / Meta Llama
  'llama-3.3-70b-versatile': 131_072,
  'llama-3.1-8b-instant': 131_072,
  'llama3.1:70b': 131_072,
  'llama3.1': 131_072,
  'llama3.2': 131_072,
  'llama3.2:1b': 131_072,
  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'deepseek-reasoner': 64_000,
  // Mistral
  'mistral-large-latest': 32_000,
  'mistral-medium-latest': 32_000,
  'mistral-small-latest': 32_000,
  'codestral-latest': 32_000,
  // Cohere
  'command-r-plus': 128_000,
  'command-r': 128_000,
  'command-light': 4_096,
};

export function getModelContextLimit(provider: ProviderName, model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? 8_192;
}

/**
 * Trim a messages array to fit within `contextBudget` tokens.
 *
 * Pinned messages (system + last user) are never removed.
 * All other messages are dropped oldest-first until the budget is satisfied.
 */
export function enforceTokenEnvelope(
  messages: ChatMessage[],
  contextBudget: number,
  opts: { provider?: ProviderName; model?: string } = {}
): ChatMessage[] {
  if (!messages.length) return messages;

  const modelLimit = getModelContextLimit(
    opts.provider ?? 'openai',
    opts.model ?? 'gpt-4o'
  );
  const budget = Math.min(contextBudget, modelLimit);

  const totalTokens = estimateTokens(messages.map(m => m.content).join('\n'));
  if (totalTokens <= budget) return messages;

  const pinned = new Set<number>();

  // Pin system message
  if (messages[0]?.role === 'system') pinned.add(0);

  // Pin last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { pinned.add(i); break; }
  }

  const result = [...messages];

  for (let i = 0; i < result.length; i++) {
    const current = estimateTokens(result.map(m => m.content).join('\n'));
    if (current <= budget) break;

    // Remap pinned indices after splice
    const originalIdx = messages.indexOf(result[i]!);
    if (!pinned.has(originalIdx)) {
      result.splice(i, 1);
      i--;
    }
  }

  return result;
}
