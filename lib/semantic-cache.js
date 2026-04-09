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
// ─── Similarity ───────────────────────────────────────────────────────────────
function tokenize(text) {
    return (text ?? '').toLowerCase().match(/\b[a-z0-9_$]{2,}\b/g) ?? [];
}
function jaccardSim(a, b) {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    if (setA.size === 0 && setB.size === 0)
        return 1;
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}
function cacheKey(text) {
    // Fast deterministic key from normalized text (not a hash — used for display/logging only)
    return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}
function tryOpenSqlite(path) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
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
    }
    catch {
        return null;
    }
}
// ─── SemanticCache class ──────────────────────────────────────────────────────
class SemanticCache {
    _threshold;
    _maxEntries;
    _store = [];
    _hits = 0;
    _misses = 0;
    _db = null;
    _dbReady = false;
    constructor(opts = {}) {
        this._threshold = opts.threshold ?? 0.88;
        this._maxEntries = opts.maxEntries ?? 500;
        this._initDb(opts.dbPath);
    }
    _initDb(dbPath) {
        if (!dbPath)
            return;
        this._db = tryOpenSqlite(dbPath);
        if (this._db) {
            // Load existing entries into memory
            const rows = this._db.prepare('SELECT * FROM semantic_cache ORDER BY ts DESC LIMIT ?').all(this._maxEntries);
            this._store = rows.map(r => ({
                key: r.key,
                prompt: r.prompt,
                response: r.response,
                model: r.model,
                provider: r.provider,
                ts: Number(r.ts),
                hitCount: Number(r.hit_count ?? 0),
            }));
            this._dbReady = true;
        }
    }
    async get(prompt) {
        const trimmed = prompt.trim();
        if (!trimmed)
            return null;
        for (const entry of this._store) {
            if (jaccardSim(trimmed, entry.prompt) >= this._threshold) {
                entry.hitCount++;
                entry.ts = Date.now();
                this._hits++;
                if (this._db && this._dbReady) {
                    try {
                        this._db.prepare('UPDATE semantic_cache SET hit_count = ?, ts = ? WHERE key = ?')
                            .run(entry.hitCount, entry.ts, entry.key);
                    }
                    catch { /* ignore */ }
                }
                return entry;
            }
        }
        this._misses++;
        return null;
    }
    async set(prompt, response, model, provider) {
        const trimmed = prompt.trim();
        if (!trimmed || !response)
            return;
        const key = cacheKey(trimmed);
        const entry = { key, prompt: trimmed, response, model, provider, ts: Date.now(), hitCount: 0 };
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
            }
            catch { /* ignore */ }
        }
    }
    clear() {
        this._store = [];
        this._hits = 0;
        this._misses = 0;
        if (this._db && this._dbReady) {
            try {
                this._db.prepare('DELETE FROM semantic_cache').run();
            }
            catch { /* ignore */ }
        }
    }
    stats() {
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
//# sourceMappingURL=semantic-cache.js.map