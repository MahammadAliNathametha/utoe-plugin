/**
 * UTOE Live Dashboard
 *
 * Renders the live token-savings dashboard.
 * Stats are fetched every 2 seconds via JavaScript — no page reload.
 */
import type { UTOEConfig } from './types.js';
export interface GlobalStats {
    totalRequests: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalSaved: number;
    totalCostSavedUsd: number;
    startedAt: number;
    byProvider: Record<string, number>;
    byTask: Record<string, number>;
    cacheHits?: number;
}
export declare function createGlobalStats(): GlobalStats;
export declare function trackRequest(stats: GlobalStats, result: {
    inputTokens?: number;
    outputTokens?: number;
    savedTokens?: number;
    provider?: string;
    task?: string;
    telemetry?: {
        estimatedCostUsd?: number;
    };
    savingsPct?: number;
}): void;
export declare function buildDashboardHTML(config: Partial<UTOEConfig> & {
    port?: number;
}, stats?: GlobalStats): string;
//# sourceMappingURL=dashboard.d.ts.map