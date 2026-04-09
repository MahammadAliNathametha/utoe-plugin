/**
 * UTOE Model Router — TypeScript implementation
 *
 * Hardware-aware + task-aware intelligent routing across 20+ providers.
 * Priority: Ollama (free, local) → Groq (fast, cheap) → DeepSeek → Gemini Flash
 *           → Anthropic → OpenAI → (all others as configured)
 *
 * @example
 * ```typescript
 * import { ModelRouter } from './router.js';
 * const r = new ModelRouter();
 * const plan = r.plan('debug', 2000, { GROQ_API_KEY: '...' });
 * console.log(plan.selected.provider, plan.selected.model);
 * ```
 */
import type { ModelTier, FallbackEntry, RoutePlan, HardwareProfile, UTOEConfig } from './types.js';
export declare const PROVIDER_MODELS: Record<string, Record<string, string>>;
export declare const MODEL_PRICE_PER_1K: Record<string, number>;
export declare function detectHardware(): HardwareProfile;
export declare function getAvailableProviders(config: UTOEConfig): Record<string, boolean>;
export declare class ModelRouter {
    plan(task: string, inputTokens: number, config?: UTOEConfig, opts?: Record<string, any>): RoutePlan;
    select(task: string, inputTokens: number, config?: UTOEConfig): {
        provider: string;
        model: string;
        tier: ModelTier;
        fallbackChain: FallbackEntry[];
        routePlan: RoutePlan;
    };
    listProviders(config?: UTOEConfig): {
        provider: string;
        priority: number;
        quality: number;
    }[];
    getHardwareProfile(): HardwareProfile;
    private _buildFallbackChain;
    private _buildForcedPlan;
    private _compressionLevel;
    private _detectProvider;
}
export declare const router: ModelRouter;
//# sourceMappingURL=router.d.ts.map