/**
 * UTOE Project RAG — TypeScript
 *
 * Indexes your project into a local vector store for semantic search.
 * Backed by better-sqlite3 (persistent) or in-memory (fallback).
 * Optionally uses @xenova/transformers ONNX for sentence embeddings.
 *
 * @example
 * ```typescript
 * import { ProjectRAG } from './rag.js';
 * const rag = new ProjectRAG(process.cwd());
 * await rag.indexProject({ verbose: true });
 * const results = await rag.search('React component lifecycle', 5);
 * ```
 */
import type { RAGSearchResult, RAGIndexResult, RAGStats } from './types.js';
export declare class ProjectRAG {
    readonly projectDir: string;
    private readonly _store;
    private _embeddingFn;
    constructor(projectDir?: string, opts?: {
        dbPath?: string;
    });
    private _getEmbeddingFn;
    indexProject(opts?: {
        verbose?: boolean;
    }): Promise<RAGIndexResult>;
    search(query: string, topK?: number): Promise<RAGSearchResult[]>;
    getContextForQuery(query: string, maxTokens?: number): Promise<string>;
    stats(): RAGStats;
    clear(): void;
}
export declare function getProjectRAG(projectDir?: string): ProjectRAG;
//# sourceMappingURL=rag.d.ts.map