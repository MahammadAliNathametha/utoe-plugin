/**
 * UTOE Tokenizer Table — Provider-aware token estimation
 *
 * Provides pinpoint accurate token counts for standard models using
 * optimized character-to-token ratios and per-message overheads.
 */
import type { ProviderName } from './types.js';
/**
 * Estimate tokens for a string based on specific provider/model heuristics.
 */
export declare function estimateTokensFromTable(provider: ProviderName, model: string, text: string | null | undefined): number;
/**
 * Estimate overhead tokens for a set of messages.
 */
export declare function estimateMessageOverhead(provider: ProviderName, model: string, messageCount: number): number;
//# sourceMappingURL=tokenizer.d.ts.map