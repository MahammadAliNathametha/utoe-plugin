/**
 * UTOE Token Guard — enforces context window budgets on message arrays.
 *
 * Trims oldest non-pinned messages to fit within the requested token budget.
 * Always preserves:
 *  - The system message (if present at index 0)
 *  - The last user message (so the model always has the current request)
 */
import type { ChatMessage, ProviderName } from './types.js';
export declare function getModelContextLimit(provider: ProviderName, model: string): number;
/**
 * Trim a messages array to fit within `contextBudget` tokens.
 *
 * Pinned messages (system + last user) are never removed.
 * All other messages are dropped oldest-first until the budget is satisfied.
 */
export declare function enforceTokenEnvelope(messages: ChatMessage[], contextBudget: number, opts?: {
    provider?: ProviderName;
    model?: string;
}): ChatMessage[];
//# sourceMappingURL=token-guard.d.ts.map