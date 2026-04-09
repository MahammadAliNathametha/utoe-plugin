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

// ─── Similarity ───────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return (text ?? '').toLowerCase().match(/\b[a-z0-9_$]{2,}\b/g) ?? [];
}

function jaccardSim(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function cacheKey(text: string): string {
  // Fast deterministic key from normalized text (not a hash — used for display/logging only)
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

// ─── SQLite backend (optional) ────────────────────────────────────────────────

interface SqliteDb {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
}

function tryOpenSqlite(path: string): SqliteDb | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (path: string) => SqliteDb;
    const db = new Database(path);
    db.prepare(`
      CREATE TABLE IF NOT EXISTS semantic_cache (
        key TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        ts INTEGER NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    return db;
  } catch {
    return null;
  }
}

// ─── SemanticCache class ──────────────────────────────────────────────────────

class SemanticCache {
  private readonly _threshold: number;
  private readonly _maxEntries: number;
  private _store: CacheEntry[] = [];
  private _hits = 0;
  private _misses = 0;
  private _db: SqliteDb | null = null;
  private _dbReady = false;

  constructor(opts: { threshold?: number; maxEntries?: number; dbPath?: string } = {}) {
    this._threshold = opts.threshold ?? 0.88;
    this._maxEntries = opts.maxEntries ?? 500;
    this._initDb(opts.dbPath);
  }

  private _initDb(dbPath?: string): void {
    if (!dbPath) return;
    this._db = tryOpenSqlite(dbPath);
    if (this._db) {
      // Load existing entries into memory
      const rows = this._db.prepare('SELECT * FROM semantic_cache ORDER BY ts DESC LIMIT ?').all(this._maxEntries) as CacheEntry[];
      this._store = rows.map(r => ({
        key: r.key,
        prompt: r.prompt,
        response: r.response,
        model: r.model,
        provider: r.provider,
        ts: Number(r.ts),
        hitCount: Number((r as any).hit_count ?? 0),
      }));
      this._dbReady = true;
    }
  }

  async get(prompt: string): Promise<CacheEntry | null> {
    const trimmed = prompt.trim();
    if (!trimmed) return null;

    for (const entry of this._store) {
      if (jaccardSim(trimmed, entry.prompt) >= this._threshold) {
        entry.hitCount++;
        entry.ts = Date.now();
        this._hits++;
        if (this._db && this._dbReady) {
          try {
            this._db.prepare('UPDATE semantic_cache SET hit_count = ?, ts = ? WHERE key = ?')
              .run(entry.hitCount, entry.ts, entry.key);
          } catch { /* ignore */ }
        }
        return entry;
      }
    }

    this._misses++;
    return null;
  }

  async set(
    prompt: string,
    response: string,
    model: string,
    provider: ProviderName
  ): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || !response) return;

    const key = cacheKey(trimmed);
    const entry: CacheEntry = { key, prompt: trimmed, response, model, provider, ts: Date.now(), hitCount: 0 };

    // Deduplicate by key
    this._store = this._store.filter(e => e.key !== key);
    this._store.unshift(entry);

    // LRU eviction
    if (this._store.length > this._maxEntries) {
      this._store = this._store.slice(0, this._maxEntries);
    }

    if (this._db && this._dbReady) {
      try {
        this._db.prepare(`
          INSERT OR REPLACE INTO semantic_cache (key, prompt, response, model, provider, ts, hit_count)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `).run(key, trimmed, response, model, provider, entry.ts);
      } catch { /* ignore */ }
    }
  }

  clear(): void {
    this._store = [];
    this._hits = 0;
    this._misses = 0;
    if (this._db && this._dbReady) {
      try { this._db.prepare('DELETE FROM semantic_cache').run(); } catch { /* ignore */ }
    }
  }

  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      entries: this._store.length,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }
}

export const semanticCache = new SemanticCache();
