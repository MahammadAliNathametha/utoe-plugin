/**
 * UTOE Compression Engine — TypeScript type-safe interface
 *
 * Multi-layer semantic compression pipeline:
 *  Layer 1 — Filler & boilerplate removal (lossless)
 *  Layer 2 — Whitespace normalization (lossless)
 *  Layer 3 — Sentence deduplication (lossless)
 *  Layer 4 — Redundant clause removal (near-lossless, <2% quality loss)
 *  Layer 5 — Tool-output compression: git log, npm, docker (structured)
 *  Layer 6 — JSON SmartCrusher (structured lossless)
 *  Layer 7 — Large code block summarization (lossy, configurable)
 *  Layer 8 — Semantic sentence deduplication (near-lossless)
 *
 * @example
 * ```typescript
 * import { compress, estimateTokens } from './compression.js';
 *
 * const { compressed, stats } = compress(
 *   'Hey, could you please kindly help me understand async/await? Thanks!',
 *   { lossless: false }
 * );
 * // stats.savedPct ~= 40-60%
 * ```
 */
import type { CompressionResult, CompressOptions, ProviderName } from './types.js';
/**
 * Accurate token estimation using provider-aware tokenizer table.
 * Falls back to generic heuristic if provider/model is not specified.
 */
export declare function estimateTokens(text: string | null | undefined, provider?: ProviderName, model?: string): number;
/**
 * Accurate tiktoken-based token counter.
 * Falls back to estimateTokens() if @dqbd/tiktoken is not installed.
 */
export declare function countTokensAccurate(text: string, model?: string): Promise<number>;
/**
 * Compress text using the multi-layer UTOE pipeline.
 * Target: 50-80% compression with <3% quality loss on typical coding prompts.
 */
export declare function compress(text: string, opts?: CompressOptions): CompressionResult;
/**
 * Compress an array of chat messages.
 */
export declare function compressMessages(messages: Array<{
    role: string;
    content: string;
}>, opts?: CompressOptions): {
    messages: typeof messages;
    totalSaved: number;
};
/**
 * Contextual Compression Ratio: measures how much of the original semantic
 * content is preserved after compression. Score 0-1 (1 = perfect retention).
 * Uses Jaccard similarity on key terms (nouns, verbs, identifiers).
 */
export declare function computeCCR(original: string, compressed: string): number;
/**
 * queryAwareFilter: Given a query string and a large context text,
 * returns only the most relevant sentences/paragraphs.
 * Used for RAG pre-filtering before sending to LLM.
 */
export declare function queryAwareFilter(context: string, query: string, opts?: {
    maxTokens?: number;
    topK?: number;
    threshold?: number;
}): string;
/**
 * preserveAST: Compress code while preserving its structural integrity.
 * Uses tree-sitter if available for accurate AST traversal.
 * Falls back to regex-based structural analysis.
 *
 * Guarantees:
 *  - All function/class/export names retained
 *  - All imports retained
 *  - No removal of tokens that are identifiers
 */
export declare function preserveAST(code: string, lang?: string): string;
export interface UniversalCompressorOptions {
    /** Use LLMLingua-2 neural compression if available (optional dep: @atjsh/llmlingua-2) */
    useLLMLingua?: boolean;
    /** Apply query-aware filtering before compression */
    queryAwareFilter?: boolean;
    /** Preserve AST structure in code blocks */
    preserveAST?: boolean;
    /** Enable CCR (Contextual Compression Ratio) computation */
    computeCCR?: boolean;
    /** Target CCR floor (0-1). If compression drops below this, use lossless. Default: 0.7 */
    ccrFloor?: number;
    /** Compression options forwarded to the pipeline */
    pipeline?: CompressOptions;
}
export interface UniversalCompressionResult extends CompressionResult {
    /** Contextual Compression Ratio (0-1). Only set if computeCCR=true. */
    ccr?: number;
    /** Whether LLMLingua-2 was applied */
    usedLLMLingua?: boolean;
    /** Whether AST preservation was applied */
    usedAST?: boolean;
    /** Relevant context extracted (if queryAwareFilter was used) */
    filteredContext?: string;
}
/**
 * UniversalCompressor — the full UTOE compression stack.
 *
 * Layers (in order):
 *  1. Query-aware context filter (optional, for RAG use-cases)
 *  2. Multi-layer pipeline (filler, whitespace, dedup, JSON, code)
 *  3. AST-preserving code compression (optional, tree-sitter)
 *  4. LLMLingua-2 neural compression (optional, requires @atjsh/llmlingua-2)
 *  5. CCR validation — if below ccrFloor, fall back to lossless pipeline
 *
 * @example
 * ```typescript
 * const uc = new UniversalCompressor({ preserveAST: true, computeCCR: true });
 * const { compressed, stats, ccr } = uc.compress(longCodeContext);
 * console.log(`CCR: ${ccr?.toFixed(2)} | Saved: ${stats.savedPct}%`);
 * ```
 */
export declare class UniversalCompressor {
    private readonly _opts;
    private _llmLinguaLoaded;
    private _llmLinguaFn;
    constructor(opts?: UniversalCompressorOptions);
    /**
     * Synchronous compression path (no LLMLingua-2).
     */
    compress(text: string, query?: string): UniversalCompressionResult;
    /**
     * Async compression path — includes optional LLMLingua-2 neural compression.
     * Falls back to synchronous pipeline if @atjsh/llmlingua-2 is not installed.
     */
    compressAsync(text: string, query?: string): Promise<UniversalCompressionResult>;
    /**
     * Compress a query+context pair for RAG use-cases.
     * Filters context to only relevant parts, then compresses.
     */
    compressForRAG(context: string, query: string, opts?: {
        maxContextTokens?: number;
        topK?: number;
    }): UniversalCompressionResult;
    private _loadLLMLingua;
}
/** Convenience singleton for default use. */
export declare const universalCompressor: UniversalCompressor;
//# sourceMappingURL=compression.d.ts.map