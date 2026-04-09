/**
 * Route plan helpers and lightweight runtime assertions.
 * Intentionally dependency-free.
 */
export declare const PROVIDERS: readonly ["openai", "anthropic", "groq", "gemini", "ollama", "deepseek", "mistral", "cohere", "together", "perplexity", "fireworks", "openrouter", "anyscale", "lepton", "octoai", "cloudflare", "azure", "bedrock", "vertex", "moonshot", "qwen", "yi"];
export declare const COMPRESSION_LEVELS: readonly ["none", "lossless", "safe_structured", "summary"];
export declare const ROUTE_PLAN_CONSTANTS: {
    readonly providers: readonly ["openai", "anthropic", "groq", "gemini", "ollama", "deepseek", "mistral", "cohere", "together", "perplexity", "fireworks", "openrouter", "anyscale", "lepton", "octoai", "cloudflare", "azure", "bedrock", "vertex", "moonshot", "qwen", "yi"];
    readonly compressionLevels: readonly ["none", "lossless", "safe_structured", "summary"];
};
export declare function assertRoutePlan(plan: unknown): void;
//# sourceMappingURL=route-plan.d.ts.map