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
import type { CompressOptions } from './types.js';
export interface LocalOptimizeResult {
    optimized: string;
    stats: {
        originalTokens: number;
        optimizedTokens: number;
        savedTokens: number;
        savedPct: number;
    };
}
/**
 * Compress a prompt using the UTOE multi-layer pipeline.
 * No network required — runs entirely in-process.
 */
export declare function runLocalOptimizer(prompt: string, opts?: CompressOptions): LocalOptimizeResult;
//# sourceMappingURL=local-optimizer.d.ts.map