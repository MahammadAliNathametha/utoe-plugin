/**
 * Policy config validation and default policy loader.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..'); // src/schemas → project root
export const DEFAULT_POLICY_PATH = path.join(ROOT, 'policy', 'default.policy.json');
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
export function assertPolicyConfig(policy) {
    if (!isObject(policy))
        throw new Error('Invalid policy: expected object');
    assertString(policy['policy_version'], 'policy.policy_version');
    if (!isObject(policy['hard_limits']))
        throw new Error('Invalid policy.hard_limits');
    const hl = policy['hard_limits'];
    assertNumber(hl['max_input_tokens'], 'policy.hard_limits.max_input_tokens');
    assertNumber(hl['max_output_tokens'], 'policy.hard_limits.max_output_tokens');
    assertNumber(hl['max_total_estimated_cost_usd'], 'policy.hard_limits.max_total_estimated_cost_usd');
    assertBoolean(hl['block_on_overflow'], 'policy.hard_limits.block_on_overflow');
    assertNumber(hl['max_retry_attempts'], 'policy.hard_limits.max_retry_attempts');
    if (!isObject(policy['quality']))
        throw new Error('Invalid policy.quality');
    const q = policy['quality'];
    assertNumber(q['rewrite_min_confidence'], 'policy.quality.rewrite_min_confidence');
    assertNumber(q['correction_proxy_threshold'], 'policy.quality.correction_proxy_threshold');
    assertBoolean(q['degrade_compression_on_regression'], 'policy.quality.degrade_compression_on_regression');
    if (!isObject(policy['task_profiles']))
        throw new Error('Invalid policy.task_profiles');
    const tp = policy['task_profiles'];
    for (const key of ['code', 'debug', 'summary', 'analysis']) {
        if (!isObject(tp[key]))
            throw new Error(`Invalid policy.task_profiles.${key}`);
        const profile = tp[key];
        assertString(profile['max_lossy_level'], `policy.task_profiles.${key}.max_lossy_level`);
        assertNumber(profile['memory_budget_tokens'], `policy.task_profiles.${key}.memory_budget_tokens`);
    }
    if (!isObject(policy['routing']))
        throw new Error('Invalid policy.routing');
    const r = policy['routing'];
    if (!isObject(r['objective_weights']))
        throw new Error('Invalid policy.routing.objective_weights');
    const w = r['objective_weights'];
    assertNumber(w['savings'], 'policy.routing.objective_weights.savings');
    assertNumber(w['quality_penalty'], 'policy.routing.objective_weights.quality_penalty');
    assertNumber(w['latency_penalty'], 'policy.routing.objective_weights.latency_penalty');
    assertNumber(w['failure_penalty'], 'policy.routing.objective_weights.failure_penalty');
    assertNumber(r['confidence_threshold'], 'policy.routing.confidence_threshold');
    if (!isObject(r['fallback_chains']))
        throw new Error('Invalid policy.routing.fallback_chains');
    if (!isObject(policy['memory']))
        throw new Error('Invalid policy.memory');
    const m = policy['memory'];
    assertBoolean(m['persistent_enabled'], 'policy.memory.persistent_enabled');
    assertNumber(m['persistent_ttl_days'], 'policy.memory.persistent_ttl_days');
    assertBoolean(m['redact_secrets'], 'policy.memory.redact_secrets');
    assertString(m['pii_redaction'], 'policy.memory.pii_redaction');
}
export function loadDefaultPolicy(policyPath = DEFAULT_POLICY_PATH) {
    const raw = fs.readFileSync(policyPath, 'utf8');
    const parsed = JSON.parse(raw);
    assertPolicyConfig(parsed);
    return parsed;
}
//# sourceMappingURL=policy-config.js.map