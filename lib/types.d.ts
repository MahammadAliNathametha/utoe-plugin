/**
 * UTOE — Universal Token Optimization Engine
 * Core TypeScript type definitions
 */
export type ProviderName = 'ollama' | 'groq' | 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'cohere' | 'together' | 'perplexity' | 'deepseek' | 'fireworks' | 'replicate' | 'openrouter' | 'anyscale' | 'lepton' | 'octoai' | 'cloudflare' | 'azure' | 'bedrock' | 'vertex' | 'moonshot' | 'qwen' | 'yi' | string;
export type ModelTier = 'cheap' | 'medium' | 'large' | 'code' | 'fast' | 'user_specified' | 'policy';
export interface ModelCandidate {
    provider: ProviderName;
    model: string;
    tier: ModelTier;
    score: number;
    predicted_latency_ms: number;
    predicted_cost_per_1k_usd: number;
    predicted_quality_risk: number;
    context_limit?: number;
}
export interface FallbackEntry {
    provider: ProviderName;
    model: string;
}
export interface RoutePlanSelected {
    provider: ProviderName;
    model: string;
    tier: ModelTier;
    compression_level: string;
    memory_budget_tokens: number;
    context_budget_tokens: number;
    max_output_tokens: number;
}
export interface HardwareProfile {
    totalMemGB: number;
    cpuCount: number;
    hasGpu: boolean;
    ollamaCapacity: 'large' | 'medium' | 'small' | 'tiny' | 'none';
}
export interface RoutePlan {
    request_id: string;
    trace_id: string;
    router_policy_version: string;
    selected: RoutePlanSelected;
    candidates_ranked: ModelCandidate[];
    fallback_chain: FallbackEntry[];
    confidence: number;
    conservative_override: boolean;
    hardware?: HardwareProfile;
}
export type MessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';
export interface ChatMessage {
    role: MessageRole;
    content: string;
    name?: string;
}
export type TaskType = 'summarize' | 'translate' | 'classify' | 'clean' | 'explain' | 'refactor' | 'review' | 'document' | 'debug' | 'generate' | 'analyze' | 'test' | 'optimize' | 'architect' | 'reason';
export type TopicType = 'code' | 'data' | 'writing' | 'infra' | 'general';
export interface CompressionStats {
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savedPct: number;
    layers: Array<{
        name: string;
        saved: number;
    }>;
    /**
     * True when npm/git/docker tool-output compression ran. In this case a low
     * CCR score (~0.3-0.5) is expected and correct — deprecated-package warnings
     * and audit noise were intentionally stripped. The LLM only needs the install
     * summary and real errors, not a list of transitive dependency deprecations.
     * Pass `lossless: true` to CompressOptions to skip this layer.
     */
    toolOutputCompressed?: boolean;
}
export interface CompressionResult {
    compressed: string;
    stats: CompressionStats;
}
export interface PipelineResult {
    response: string;
    optimizedPrompt: string;
    mode: 'bridge' | 'proxy';
    model: string;
    provider: ProviderName;
    tier: ModelTier;
    task: TaskType;
    topic: TopicType;
    topicShifted: boolean;
    inputTokens: number;
    outputTokens: number;
    savedTokens: number;
    savingsPct: number;
    compressionStats: CompressionStats;
    elapsedMs: number;
    routePlan: RoutePlan;
    policyVersion: string;
    conservativeOverride: boolean;
    routeConfidence: number;
    telemetry: {
        requestId: string;
        sessionId: string;
        traceId: string;
        fallbackUsed: boolean;
        attempts: Array<{
            provider: ProviderName;
            model: string;
        }>;
        estimatedCostUsd: number;
    };
}
export interface CompressOptions {
    lossless?: boolean;
    aggressiveCode?: boolean;
    toolOutputs?: boolean;
}
export interface MemoryStats {
    shortTerm: number;
    longTerm: number;
    longTermFile: string;
    ragEnabled: boolean;
}
export interface MemoryFact {
    fact: string;
    ts: number;
    source: 'conversation' | 'manual' | 'rag';
}
export interface RAGSearchResult {
    filePath: string;
    content: string;
    score: number;
}
export interface RAGIndexResult {
    indexed: number;
    skipped: number;
}
export interface RAGStats {
    chunks: number;
    files?: number;
    backend: 'sqlite' | 'memory';
}
export interface SuggestionResult {
    original: string;
    suggested: string;
    task: TaskType;
    lang: string | null;
    originalTokens: number;
    suggestedTokens: number;
    improvementPct: number;
    tip: string;
    whyBetter: string[];
}
export interface UTOEConfig {
    port?: number;
    mode?: 'bridge' | 'proxy';
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    GROQ_API_KEY?: string;
    GEMINI_API_KEY?: string;
    MISTRAL_API_KEY?: string;
    COHERE_API_KEY?: string;
    TOGETHER_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    FIREWORKS_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    ANYSCALE_API_KEY?: string;
    PERPLEXITY_API_KEY?: string;
    CLOUDFLARE_AI_TOKEN?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_ENDPOINT?: string;
    MOONSHOT_API_KEY?: string;
    QWEN_API_KEY?: string;
    OLLAMA_URL?: string;
    effort?: 'low' | 'medium' | 'high';
    forceProvider?: ProviderName;
    forceModel?: string;
    maxTokens?: number;
    outputTokenLimit?: number;
    historyWindow?: number;
    maxHistoryTokens?: number;
    relevanceThreshold?: number;
    executionMode?: 'bridge' | 'proxy';
    losslessOnly?: boolean;
    UTOE_TELEMETRY_FILE?: string;
    policy?: Record<string, unknown>;
}
export interface ExecutionResult {
    text: string;
    provider: ProviderName;
    model: string;
    attempts: Array<{
        provider: ProviderName;
        model: string;
    }>;
    fallbackUsed: boolean;
    bridgeBypass?: boolean;
}
export interface SelectedRoute {
    provider: ProviderName;
    model: string;
    tier: ModelTier;
    fallbackChain: FallbackEntry[];
    routePlan: RoutePlan;
}
export interface CacheEntry {
    key: string;
    prompt: string;
    response: string;
    model: string;
    provider: ProviderName;
    ts: number;
    hitCount: number;
}
export interface CacheStats {
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
}
export interface TerminalHookResult {
    processed: string;
    originalLen: number;
    compressedLen: number;
    savedPct: number;
    detectors: string[];
}
//# sourceMappingURL=types.d.ts.map