/**
 * UTOE Semantic Cache — deduplicate LLM calls using Jaccard similarity.
 *
 * Two-tier storage:
 *  1. In-memory LRU (fast, ephemeral, 500 entries)
 *  2. SQLite persistence (optional — requires better-sqlite3)
 *
 * A cache hit is returned when a new prompt is semantically close
 * (Jaccard similarity ≥ threshold) to a previously seen prompt.
 * Default threshold: 0.88 — close enough to be the same question,
 * dissimilar enough not to confuse different questions.
 */
import type { CacheEntry, CacheStats, ProviderName } from './types.js';
declare class SemanticCache {
    private readonly _threshold;
    private readonly _maxEntries;
    private _store;
    private _hits;
    private _misses;
    private _db;
    private _dbReady;
    constructor(opts?: {
        threshold?: number;
        maxEntries?: number;
        dbPath?: string;
    });
    private _initDb;
    get(prompt: string): Promise<CacheEntry | null>;
    set(prompt: string, response: string, model: string, provider: ProviderName): Promise<void>;
    clear(): void;
    stats(): CacheStats;
}
export declare const semanticCache: SemanticCache;
export {};
//# sourceMappingURL=semantic-cache.d.ts.map