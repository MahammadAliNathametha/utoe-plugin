/**
 * UTOE Multi-Layer Memory Engine — TypeScript
 *
 * Three memory layers:
 *  1. Short-term  — in-process session ring buffer (last 20 turns)
 *  2. Long-term   — persistent JSON facts file (TTL: 30 days, PII-redacted)
 *  3. Project RAG — file-level vector search (see rag.ts)
 *
 * @example
 * ```typescript
 * import { memory } from './memory.js';
 * memory.update('My project uses React 18', 'Got it, using React 18 hooks.');
 * const facts = memory.recallSync('React hooks', 4);
 * ```
 */
import type { MemoryStats, MemoryFact, ProviderName } from './types.js';
export declare class MemoryEngine {
    private readonly _short;
    private readonly _long;
    private _rag;
    recall(query: string, topK?: number, opts?: {
        budget?: number;
        provider?: ProviderName;
        model?: string;
    }): Promise<string[]>;
    recallSync(query: string, topK?: number, opts?: {
        budget?: number;
        provider?: ProviderName;
        model?: string;
    }): string[];
    update(userMsg: string, assistantMsg: string): void;
    forget(query?: string): number;
    addFact(fact: string, source?: MemoryFact['source']): boolean;
    enableRAG(rag: NonNullable<typeof this._rag>): void;
    clearShortTerm(): void;
    clearAll(): void;
    stats(): MemoryStats;
}
export declare const memory: MemoryEngine;
export { bootstrapProjectFiles, enforceClaudeMdLimit, loadRelevantSupportFiles, } from './project-bootstrap.js';
//# sourceMappingURL=memory.d.ts.map