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
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ─── TF-IDF vector helpers ────────────────────────────────────────────────────

function tfidfVector(text: string): Record<string, number> {
  const tokens = (text.toLowerCase().match(/\b\w{3,}\b/g) ?? []);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  const vec: Record<string, number> = {};
  for (const [t, count] of tf) vec[t] = count / total;
  return vec;
}

function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of Object.entries(a)) {
    normA += v * v;
    if (b[k]) dot += v * b[k]!;
  }
  for (const v of Object.values(b)) normB += v * v;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function fileHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 16);
}

// ─── File scanner ─────────────────────────────────────────────────────────────

const INDEXABLE_EXT = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.env.example',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', '.venv', 'venv', '.utoe', '.claude',
]);

function* walkDir(dir: string, maxDepth = 6, depth = 0): Generator<string> {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(full, maxDepth, depth + 1);
    else if (entry.isFile() && INDEXABLE_EXT.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

// ─── SQLite store (optional) ──────────────────────────────────────────────────

interface ChunkRow {
  file_path: string;
  chunk_index: number;
  content: string;
  vector_json: string | null;
}

class SQLiteRAGStore {
  private readonly db: any;

  constructor(dbPath: string) {
    // Dynamic import to avoid hard dep
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this._init();
  }

  private _init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        vector_json TEXT,
        indexed_at INTEGER NOT NULL,
        UNIQUE(file_path, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
    `);
  }

  upsertChunk(filePath: string, idx: number, content: string, vectorJson: string | null): void {
    const hash = fileHash(content);
    this.db.prepare(`
      INSERT INTO chunks(file_path, chunk_index, content, content_hash, vector_json, indexed_at)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path, chunk_index) DO UPDATE SET
        content=excluded.content, content_hash=excluded.content_hash,
        vector_json=excluded.vector_json, indexed_at=excluded.indexed_at
    `).run(filePath, idx, content, hash, vectorJson, Date.now());
  }

  getChunks(limit = 10000): ChunkRow[] {
    return this.db.prepare('SELECT * FROM chunks ORDER BY id LIMIT ?').all(limit) as ChunkRow[];
  }

  stats(): RAGStats {
    const row = this.db.prepare('SELECT COUNT(*) as cnt, COUNT(DISTINCT file_path) as files FROM chunks').get() as any;
    return { chunks: row.cnt, files: row.files, backend: 'sqlite' };
  }

  clear(): void { this.db.exec('DELETE FROM chunks'); }
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

class MemoryRAGStore {
  private readonly _store: Array<{ file_path: string; chunk_index: number; content: string; vector_json: string | null }> = [];

  upsertChunk(filePath: string, idx: number, content: string, vectorJson: string | null): void {
    const existing = this._store.findIndex((c) => c.file_path === filePath && c.chunk_index === idx);
    if (existing >= 0) this._store[existing] = { file_path: filePath, chunk_index: idx, content, vector_json: vectorJson };
    else this._store.push({ file_path: filePath, chunk_index: idx, content, vector_json: vectorJson });
  }

  getChunks(limit = 10000): ChunkRow[] { return this._store.slice(0, limit); }
  stats(): RAGStats { return { chunks: this._store.length, backend: 'memory' }; }
  clear(): void { this._store.length = 0; }
}

// ─── ProjectRAG ──────────────────────────────────────────────────────────────

export class ProjectRAG {
  readonly projectDir: string;
  private readonly _store: SQLiteRAGStore | MemoryRAGStore;
  private _embeddingFn: ((text: string) => Promise<number[]>) | null = null;

  constructor(projectDir = process.cwd(), opts: { dbPath?: string } = {}) {
    this.projectDir = projectDir;
    const dbPath = opts.dbPath ?? path.join(projectDir, '.utoe', 'rag.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    try {
      this._store = new SQLiteRAGStore(dbPath);
    } catch {
      this._store = new MemoryRAGStore();
    }
  }

  private async _getEmbeddingFn(): Promise<((text: string) => Promise<number[]>) | null> {
    if (this._embeddingFn) return this._embeddingFn;
    try {
      const { pipeline } = await import('@xenova/transformers');
      const model = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      this._embeddingFn = async (text: string) => {
        const out = await model(text, { pooling: 'mean', normalize: true });
        return Array.from(out.data as Float32Array);
      };
      return this._embeddingFn;
    } catch {
      return null;
    }
  }

  async indexProject(opts: { verbose?: boolean } = {}): Promise<RAGIndexResult> {
    const verbose = opts.verbose !== false;
    let indexed = 0, skipped = 0;
    if (verbose) process.stdout.write('[UTOE RAG] Indexing project...\n');

    const embFn = await this._getEmbeddingFn();

    for (const filePath of walkDir(this.projectDir)) {
      let content: string;
      try {
        if (fs.statSync(filePath).size > 500_000) { skipped++; continue; }
        content = fs.readFileSync(filePath, 'utf8');
      } catch { skipped++; continue; }

      const relPath = path.relative(this.projectDir, filePath);
      for (let i = 0; i < chunkText(content).length; i++) {
        const chunk = chunkText(content)[i]!;
        let vectorJson: string | null = null;
        if (embFn) {
          try { vectorJson = JSON.stringify(await embFn(chunk.slice(0, 512))); } catch { /* no embedding */ }
        } else {
          vectorJson = JSON.stringify(tfidfVector(chunk));
        }
        this._store.upsertChunk(relPath, i, chunk, vectorJson);
      }
      indexed++;
    }

    if (verbose) process.stdout.write(`[UTOE RAG] Done: ${indexed} files indexed, ${skipped} skipped\n`);
    return { indexed, skipped };
  }

  async search(query: string, topK = 5): Promise<RAGSearchResult[]> {
    const chunks = this._store.getChunks();
    if (!chunks.length) return [];

    const embFn = await this._getEmbeddingFn();

    if (embFn) {
      let qVec: number[];
      try { qVec = await embFn(query.slice(0, 512)); } catch { qVec = []; }
      if (qVec.length) {
        return chunks
          .filter((c) => c.vector_json)
          .map((c) => {
            try {
              const vec = JSON.parse(c.vector_json!) as number[];
              const score = qVec.reduce((s, v, i) => s + v * (vec[i] ?? 0), 0);
              return { filePath: c.file_path, content: c.content.slice(0, 300), score };
            } catch { return { filePath: c.file_path, content: '', score: 0 }; }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);
      }
    }

    const qVec = tfidfVector(query);
    return chunks
      .filter((c) => c.vector_json)
      .map((c) => {
        try {
          const vec = JSON.parse(c.vector_json!) as Record<string, number>;
          return { filePath: c.file_path, content: c.content.slice(0, 300), score: cosineSim(qVec, vec) };
        } catch { return { filePath: c.file_path, content: '', score: 0 }; }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async getContextForQuery(query: string, maxTokens = 800): Promise<string> {
    const results = await this.search(query, 8);
    if (!results.length) return '';
    const parts: string[] = [];
    let budget = maxTokens;
    for (const r of results) {
      const snippet = `[${r.filePath}]: ${r.content}`;
      const tokens = Math.ceil(snippet.length / 4);
      if (tokens > budget) break;
      parts.push(snippet);
      budget -= tokens;
    }
    return parts.length ? `[Project Context]:\n${parts.join('\n---\n')}` : '';
  }

  stats(): RAGStats { return this._store.stats(); }
  clear(): void { this._store.clear(); }
}

let _defaultRag: ProjectRAG | null = null;

export function getProjectRAG(projectDir = process.cwd()): ProjectRAG {
  if (!_defaultRag || _defaultRag.projectDir !== projectDir) {
    _defaultRag = new ProjectRAG(projectDir);
  }
  return _defaultRag;
}
