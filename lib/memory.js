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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokensFromTable } from './tokenizer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = path.join(__dirname, '..', '.utoe_memory.json');
const MAX_LONG_TERM = 500;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// ─── PII redaction ────────────────────────────────────────────────────────────
const PII_PATTERNS = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]'],
    [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],
    [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
    [/\b(?:sk-|sk-ant-|AIza)[A-Za-z0-9_-]{20,}\b/g, '[API_KEY]'],
    [/\bghp_[A-Za-z0-9]{36}\b/g, '[GITHUB_TOKEN]'],
    [/\bbearer\s+[A-Za-z0-9._-]{20,}/gi, 'bearer [TOKEN]'],
];
function redactPII(text) {
    for (const [pattern, replacement] of PII_PATTERNS) {
        text = text.replace(pattern, replacement);
    }
    return text;
}
// ─── Fact patterns ────────────────────────────────────────────────────────────
const FACT_PATTERNS = [
    /my (?:name|project|company|stack|language|framework|team) is ([^.!?\n]{3,60})/i,
    /i(?:'m| am) (?:using|working on|building|developing) ([^.!?\n]{3,60})/i,
    /the (?:project|app|system|service|api) (?:is called|is named|is) ([^.!?\n]{3,50})/i,
    /i prefer ([^.!?\n]{3,60})/i,
    /always (?:use|prefer|apply|return) ([^.!?\n]{3,60})/i,
    /the (?:bug|issue|problem|error) is ([^.!?\n]{3,100})/i,
    /(?:we use|we're using|project uses) ([^.!?\n]{3,60})/i,
    /database is ([^.!?\n]{3,40})/i,
];
function extractFacts(text) {
    const clean = redactPII(text);
    return FACT_PATTERNS
        .map((p) => clean.match(p)?.[0]?.trim().slice(0, 120))
        .filter((f) => !!f)
        .slice(0, 5);
}
// ─── Similarity ───────────────────────────────────────────────────────────────
function tokenize(text) {
    return (text || '').toLowerCase().match(/\b\w{3,}\b/g) ?? [];
}
function jaccardSim(a, b) {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}
// ─── Short-term memory ────────────────────────────────────────────────────────
class ShortTermMemory {
    _buffer = [];
    _maxSize;
    constructor(maxSize = 20) { this._maxSize = maxSize; }
    add(user, assistant) {
        this._buffer.push({ user, assistant, ts: Date.now() });
        if (this._buffer.length > this._maxSize)
            this._buffer.shift();
    }
    recall(query, topK = 3) {
        return this._buffer
            .map((e) => ({ ...e, score: jaccardSim(query, `${e.user} ${e.assistant}`) }))
            .filter((e) => e.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((e) => `[Recent]: ${e.user.slice(0, 60)} → ${e.assistant.slice(0, 80)}`);
    }
    clear() { this._buffer = []; }
    size() { return this._buffer.length; }
}
// ─── Long-term memory ─────────────────────────────────────────────────────────
class LongTermMemory {
    _store;
    _filePath;
    constructor(filePath = MEMORY_FILE) {
        this._filePath = filePath;
        this._store = this._load();
    }
    recall(query, topK = 5) {
        this._expire();
        return this._store
            .map((e) => ({ fact: e.fact, score: jaccardSim(query, e.fact) }))
            .filter((e) => e.score > 0.08)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((e) => e.fact);
    }
    update(userMsg, assistantMsg) {
        const facts = extractFacts(`${userMsg} ${assistantMsg}`);
        for (const fact of facts) {
            if (!this._isDuplicate(fact)) {
                this._store.push({ fact, ts: Date.now(), source: 'conversation' });
            }
        }
        if (this._store.length > MAX_LONG_TERM)
            this._store = this._store.slice(-MAX_LONG_TERM);
        this._save();
    }
    addFact(fact, source = 'manual') {
        const clean = redactPII(fact).trim().slice(0, 200);
        if (!clean || this._isDuplicate(clean))
            return false;
        this._store.push({ fact: clean, ts: Date.now(), source });
        this._save();
        return true;
    }
    forget(query = '') {
        const before = this._store.length;
        if (!query) {
            this._store = [];
            this._save();
            return before;
        }
        const words = new Set(tokenize(query));
        this._store = this._store.filter((e) => {
            const hasKw = [...words].some((w) => w.length > 3 && e.fact.toLowerCase().includes(w));
            return !hasKw && jaccardSim(query, e.fact) < 0.3;
        });
        this._save();
        return before - this._store.length;
    }
    stats() {
        return { entries: this._store.length, filePath: this._filePath };
    }
    _isDuplicate(fact) {
        return this._store.some((e) => jaccardSim(fact, e.fact) > 0.82);
    }
    _expire() {
        const cutoff = Date.now() - TTL_MS;
        this._store = this._store.filter((e) => e.ts > cutoff);
    }
    _load() {
        try {
            if (fs.existsSync(this._filePath)) {
                return JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
            }
        }
        catch { /* ignore */ }
        return [];
    }
    _save() {
        try {
            fs.writeFileSync(this._filePath, JSON.stringify(this._store, null, 2));
        }
        catch { /* ignore */ }
    }
}
// ─── Unified facade ───────────────────────────────────────────────────────────
export class MemoryEngine {
    _short = new ShortTermMemory(20);
    _long = new LongTermMemory();
    _rag = null;
    async recall(query, topK = 6, opts = {}) {
        const { budget = Infinity, provider = 'openai', model = 'gpt-4o' } = opts;
        const short = this._short.recall(query, 2);
        let currentTokens = 0;
        const results = [];
        // Prioritize short-term
        for (const msg of short) {
            const t = estimateTokensFromTable(provider, model, msg);
            if (currentTokens + t > budget)
                break;
            results.push(msg);
            currentTokens += t;
        }
        // Then long-term
        const long = this._long.recall(query, topK - results.length);
        for (const fact of long) {
            const t = estimateTokensFromTable(provider, model, fact);
            if (currentTokens + t > budget)
                break;
            results.push(fact);
            currentTokens += t;
        }
        // Then RAG
        if (this._rag && results.length < topK) {
            try {
                const hits = await this._rag.search(query, 3);
                for (const h of hits) {
                    const content = `[File ${h.filePath}]: ${h.content.slice(0, 120)}`;
                    const t = estimateTokensFromTable(provider, model, content);
                    if (currentTokens + t > budget)
                        break;
                    results.push(content);
                    currentTokens += t;
                    if (results.length >= topK)
                        break;
                }
            }
            catch { /* ignore */ }
        }
        return results;
    }
    recallSync(query, topK = 4, opts = {}) {
        const { budget = Infinity, provider = 'openai', model = 'gpt-4o' } = opts;
        const short = this._short.recall(query, 2);
        const results = [];
        let currentTokens = 0;
        for (const msg of short) {
            const t = estimateTokensFromTable(provider, model, msg);
            if (currentTokens + t > budget)
                break;
            results.push(msg);
            currentTokens += t;
        }
        const long = this._long.recall(query, topK - results.length);
        for (const fact of long) {
            const t = estimateTokensFromTable(provider, model, fact);
            if (currentTokens + t > budget)
                break;
            results.push(fact);
            currentTokens += t;
        }
        return results;
    }
    update(userMsg, assistantMsg) {
        this._short.add(userMsg, assistantMsg);
        this._long.update(userMsg, assistantMsg);
    }
    forget(query = '') { return this._long.forget(query); }
    addFact(fact, source) { return this._long.addFact(fact, source); }
    enableRAG(rag) { this._rag = rag; }
    clearShortTerm() { this._short.clear(); }
    clearAll() { this._short.clear(); this._long.forget(''); }
    stats() {
        return {
            shortTerm: this._short.size(),
            longTerm: this._long.stats().entries,
            longTermFile: this._long.stats().filePath,
            ragEnabled: !!this._rag,
        };
    }
}
export const memory = new MemoryEngine();
// Project bootstrapping utilities are in project-bootstrap.ts (SRP)
export { bootstrapProjectFiles, enforceClaudeMdLimit, loadRelevantSupportFiles, } from './project-bootstrap.js';
//# sourceMappingURL=memory.js.map