/**
 * Route plan helpers and lightweight runtime assertions.
 * Intentionally dependency-free.
 */
export const PROVIDERS = [
    'openai', 'anthropic', 'groq', 'gemini', 'ollama',
    'deepseek', 'mistral', 'cohere', 'together', 'perplexity',
    'fireworks', 'openrouter', 'anyscale', 'lepton', 'octoai',
    'cloudflare', 'azure', 'bedrock', 'vertex', 'moonshot', 'qwen', 'yi',
];
export const COMPRESSION_LEVELS = ['none', 'lossless', 'safe_structured', 'summary'];
export const ROUTE_PLAN_CONSTANTS = {
    providers: PROVIDERS,
    compressionLevels: COMPRESSION_LEVELS,
};
// ─── Assertion helpers ────────────────────────────────────────────────────────
function assertString(value, field) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Invalid ${field}: expected non-empty string`);
    }
}
function assertNumber(value, field) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Invalid ${field}: expected number`);
    }
}
function assertBoolean(value, field) {
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid ${field}: expected boolean`);
    }
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// ─── Public assertion ─────────────────────────────────────────────────────────
export function assertRoutePlan(plan) {
    if (!isObject(plan))
        throw new Error('Invalid route plan: expected object');
    assertString(plan['request_id'], 'route_plan.request_id');
    assertString(plan['trace_id'], 'route_plan.trace_id');
    assertString(plan['router_policy_version'], 'route_plan.router_policy_version');
    if (!isObject(plan['selected']))
        throw new Error('Invalid route_plan.selected');
    const sel = plan['selected'];
    assertString(sel['provider'], 'route_plan.selected.provider');
    assertString(sel['model'], 'route_plan.selected.model');
    assertString(sel['compression_level'], 'route_plan.selected.compression_level');
    assertNumber(sel['memory_budget_tokens'], 'route_plan.selected.memory_budget_tokens');
    assertNumber(sel['context_budget_tokens'], 'route_plan.selected.context_budget_tokens');
    assertNumber(sel['max_output_tokens'], 'route_plan.selected.max_output_tokens');
    if (!Array.isArray(plan['candidates_ranked'])) {
        throw new Error('Invalid route_plan.candidates_ranked: expected array');
    }
    for (const [idx, c] of plan['candidates_ranked'].entries()) {
        if (!isObject(c))
            throw new Error(`Invalid route_plan.candidates_ranked[${idx}]`);
        assertString(c['provider'], `route_plan.candidates_ranked[${idx}].provider`);
        assertString(c['model'], `route_plan.candidates_ranked[${idx}].model`);
        assertNumber(c['score'], `route_plan.candidates_ranked[${idx}].score`);
        assertNumber(c['predicted_latency_ms'], `route_plan.candidates_ranked[${idx}].predicted_latency_ms`);
        assertNumber(c['predicted_cost_per_1k_usd'], `route_plan.candidates_ranked[${idx}].predicted_cost_per_1k_usd`);
        assertNumber(c['predicted_quality_risk'], `route_plan.candidates_ranked[${idx}].predicted_quality_risk`);
    }
    if (!Array.isArray(plan['fallback_chain'])) {
        throw new Error('Invalid route_plan.fallback_chain: expected array');
    }
    for (const [idx, f] of plan['fallback_chain'].entries()) {
        if (!isObject(f))
            throw new Error(`Invalid route_plan.fallback_chain[${idx}]`);
        assertString(f['provider'], `route_plan.fallback_chain[${idx}].provider`);
        assertString(f['model'], `route_plan.fallback_chain[${idx}].model`);
    }
    assertNumber(plan['confidence'], 'route_plan.confidence');
    const conf = plan['confidence'];
    if (conf < 0 || conf > 1) {
        throw new Error(`Invalid route_plan.confidence: expected 0..1, got ${conf}`);
    }
    assertBoolean(plan['conservative_override'], 'route_plan.conservative_override');
}
//# sourceMappingURL=route-plan.js.map