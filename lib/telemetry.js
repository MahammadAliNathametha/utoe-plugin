/**
 * UTOE Telemetry Store — TypeScript Implementation
 * Maintains a rolling window of recent events for adaptive routing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
const DEFAULT_PATH = path.join(process.cwd(), '.utoe_telemetry.jsonl');
export class TelemetryStore {
    _filePath;
    constructor(filePath = DEFAULT_PATH) {
        this._filePath = filePath;
    }
    append(event) {
        const dir = path.dirname(this._filePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(this._filePath, JSON.stringify(event) + '\n', 'utf8');
    }
    readRecent(limit = 100) {
        if (!fs.existsSync(this._filePath))
            return [];
        try {
            const content = fs.readFileSync(this._filePath, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            return lines
                .slice(-limit)
                .map(l => {
                try {
                    return JSON.parse(l);
                }
                catch {
                    return null;
                }
            })
                .filter((e) => !!e);
        }
        catch {
            return [];
        }
    }
    /**
     * Aggregate recent performance stats for adaptive routing.
     */
    getRollups() {
        const events = this.readRecent(200);
        const stats = {};
        for (const e of events) {
            const key = `${e.provider}:${e.model}`;
            if (!stats[key])
                stats[key] = { successes: 0, total: 0, latency: 0 };
            stats[key].total++;
            if (e.success)
                stats[key].successes++;
            stats[key].latency += e.latencyMs;
        }
        const result = {};
        for (const [key, s] of Object.entries(stats)) {
            result[key] = {
                successRate: s.successes / s.total,
                avgLatency: s.latency / s.total,
                count: s.total,
            };
        }
        return result;
    }
}
export const telemetryStore = new TelemetryStore();
//# sourceMappingURL=telemetry.js.map