/**
 * UTOE Telemetry Store — TypeScript Implementation
 * Maintains a rolling window of recent events for adaptive routing.
 */
export interface TelemetryEvent {
    requestId: string;
    sessionId: string;
    provider: string;
    model: string;
    success: boolean;
    latencyMs: number;
    error?: string;
    ts: number;
}
export declare class TelemetryStore {
    private _filePath;
    constructor(filePath?: string);
    append(event: TelemetryEvent): void;
    readRecent(limit?: number): TelemetryEvent[];
    /**
     * Aggregate recent performance stats for adaptive routing.
     */
    getRollups(): Record<string, {
        successRate: number;
        avgLatency: number;
        count: number;
    }>;
}
export declare const telemetryStore: TelemetryStore;
//# sourceMappingURL=telemetry.d.ts.map