/**
 * UTOE Local Optimizer — runs the compression pipeline locally (no network calls).
 *
 * Used by:
 *  - The CLI hook (utoe hook) to pre-compress prompts before they reach the AI
 *  - The proxy /rewrite endpoint
 *  - Programmatic callers who want offline prompt optimization
 *
 * @example
 * ```typescript
 * import { runLocalOptimizer } from 'utoe-plugin';
 * const { optimized, stats } = runLocalOptimizer('Hey, could you please help me fix this bug?');
 * console.log(`Saved ${stats.savedPct}% tokens`);
 * ```
 */
import { compress, estimateTokens } from './compression.js';
/**
 * Compress a prompt using the UTOE multi-layer pipeline.
 * No network required — runs entirely in-process.
 */
export function runLocalOptimizer(prompt, opts = {}) {
    const originalTokens = estimateTokens(prompt);
    const { compressed, stats } = compress(prompt, opts);
    return {
        optimized: compressed,
        stats: {
            originalTokens,
            optimizedTokens: stats.compressedTokens,
            savedTokens: stats.savedTokens,
            savedPct: stats.savedPct,
        },
    };
}
//# sourceMappingURL=local-optimizer.js.map