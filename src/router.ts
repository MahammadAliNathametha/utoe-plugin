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

import type {
  ProviderName, ModelTier, ModelCandidate, FallbackEntry,
  RoutePlan, HardwareProfile, UTOEConfig, TaskType
} from './types.js';
import * as os from 'node:os';
import type { EffortLevel } from './command-engine.js';
import { telemetryStore } from './telemetry.js';

// ─── Effort level → tier override ────────────────────────────────────────────

const EFFORT_TO_TIER: Record<EffortLevel, ModelTier> = {
  low: 'cheap',
  medium: 'medium',
  high: 'large',
};

// ─── 20+ Provider catalog ─────────────────────────────────────────────────────

export const PROVIDER_MODELS: Record<string, Record<string, string>> = {
  // 1. Ollama (free, local)
  ollama: { cheap: 'llama3.2', medium: 'llama3.1', large: 'llama3.1:70b', code: 'codellama', fast: 'llama3.2' },
  // 2. Groq (ultra-fast, cheap API)
  groq: { cheap: 'llama-3.1-8b-instant', medium: 'llama-3.3-70b-versatile', large: 'llama-3.3-70b-versatile', code: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant' },
  // 3. DeepSeek (excellent cost/quality)
  deepseek: { cheap: 'deepseek-chat', medium: 'deepseek-chat', large: 'deepseek-reasoner', code: 'deepseek-coder', fast: 'deepseek-chat' },
  // 4. Google Gemini
  gemini: { cheap: 'gemini-1.5-flash', medium: 'gemini-1.5-pro', large: 'gemini-1.5-pro', code: 'gemini-1.5-pro', fast: 'gemini-1.5-flash' },
  // 5. Anthropic
  anthropic: { cheap: 'claude-haiku-4-5-20251001', medium: 'claude-sonnet-4-6', large: 'claude-opus-4-6', code: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5-20251001' },
  // 6. OpenAI
  openai: { cheap: 'gpt-4o-mini', medium: 'gpt-4o', large: 'gpt-4o', code: 'gpt-4o', fast: 'gpt-4o-mini' },
  // 7. Mistral
  mistral: { cheap: 'mistral-small-latest', medium: 'mistral-medium-latest', large: 'mistral-large-latest', code: 'codestral-latest', fast: 'mistral-small-latest' },
  // 8. Cohere
  cohere: { cheap: 'command-light', medium: 'command-r', large: 'command-r-plus', code: 'command-r', fast: 'command-light' },
  // 9. Together AI
  together: { cheap: 'meta-llama/Llama-3-8b-chat-hf', medium: 'meta-llama/Llama-3-70b-chat-hf', large: 'meta-llama/Llama-3-70b-chat-hf', code: 'codellama/CodeLlama-34b-Instruct-hf', fast: 'meta-llama/Llama-3-8b-chat-hf' },
  // 10. Perplexity
  perplexity: { cheap: 'sonar-small-chat', medium: 'sonar-medium-chat', large: 'sonar-large-chat', code: 'sonar-medium-chat', fast: 'sonar-small-chat' },
  // 11. Fireworks AI (fast inference)
  fireworks: { cheap: 'accounts/fireworks/models/llama-v3-8b-instruct', medium: 'accounts/fireworks/models/llama-v3-70b-instruct', large: 'accounts/fireworks/models/llama-v3-70b-instruct', code: 'accounts/fireworks/models/starcoder-7b-w8a16', fast: 'accounts/fireworks/models/llama-v3-8b-instruct' },
  // 12. OpenRouter (multi-model gateway)
  openrouter: { cheap: 'openai/gpt-4o-mini', medium: 'anthropic/claude-3.5-sonnet', large: 'anthropic/claude-3-opus', code: 'openai/gpt-4o', fast: 'openai/gpt-4o-mini' },
  // 13. Anyscale
  anyscale: { cheap: 'meta-llama/Llama-2-7b-chat-hf', medium: 'meta-llama/Llama-2-70b-chat-hf', large: 'meta-llama/Llama-2-70b-chat-hf', code: 'codellama/CodeLlama-34b-Instruct-hf', fast: 'meta-llama/Llama-2-7b-chat-hf' },
  // 14. Lepton AI
  lepton: { cheap: 'llama3-8b', medium: 'llama3-70b', large: 'llama3-70b', code: 'llama3-70b', fast: 'llama3-8b' },
  // 15. OctoAI
  octoai: { cheap: 'meta-llama-3-8b-instruct', medium: 'meta-llama-3-70b-instruct', large: 'meta-llama-3-70b-instruct', code: 'codellama-34b-instruct', fast: 'meta-llama-3-8b-instruct' },
  // 16. Cloudflare Workers AI
  cloudflare: { cheap: '@cf/meta/llama-3-8b-instruct', medium: '@cf/meta/llama-3-70b-instruct', large: '@cf/meta/llama-3-70b-instruct', code: '@cf/defog/sqlcoder-7b-2', fast: '@cf/meta/llama-3-8b-instruct' },
  // 17. Azure OpenAI
  azure: { cheap: 'gpt-35-turbo', medium: 'gpt-4', large: 'gpt-4-turbo', code: 'gpt-4', fast: 'gpt-35-turbo' },
  // 18. AWS Bedrock
  bedrock: { cheap: 'amazon.titan-text-express-v1', medium: 'anthropic.claude-3-sonnet-20240229-v1:0', large: 'anthropic.claude-3-opus-20240229-v1:0', code: 'anthropic.claude-3-sonnet-20240229-v1:0', fast: 'amazon.titan-text-express-v1' },
  // 19. Google Vertex AI
  vertex: { cheap: 'gemini-1.5-flash-001', medium: 'gemini-1.5-pro-001', large: 'gemini-1.5-pro-001', code: 'code-bison', fast: 'gemini-1.5-flash-001' },
  // 20. Moonshot AI (Kimi)
  moonshot: { cheap: 'moonshot-v1-8k', medium: 'moonshot-v1-32k', large: 'moonshot-v1-128k', code: 'moonshot-v1-32k', fast: 'moonshot-v1-8k' },
  // 21. Qwen (Alibaba)
  qwen: { cheap: 'qwen-turbo', medium: 'qwen-plus', large: 'qwen-max', code: 'qwen-coder-turbo', fast: 'qwen-turbo' },
  // 22. Yi (01.AI)
  yi: { cheap: 'yi-lightning', medium: 'yi-large', large: 'yi-large-turbo', code: 'yi-large', fast: 'yi-lightning' },
};

// ─── Cost per 1K tokens (USD) ─────────────────────────────────────────────────

export const MODEL_PRICE_PER_1K: Record<string, number> = {
  // Free
  'llama3.2': 0, 'llama3.1': 0, 'llama3.1:70b': 0, 'codellama': 0,
  // Groq
  'llama-3.1-8b-instant': 0.00005, 'llama-3.3-70b-versatile': 0.00059,
  // DeepSeek (incredibly cheap)
  'deepseek-chat': 0.00014, 'deepseek-coder': 0.00014, 'deepseek-reasoner': 0.00055,
  // Gemini
  'gemini-1.5-flash': 0.000075, 'gemini-1.5-pro': 0.00125,
  // Anthropic
  'claude-haiku-4-5-20251001': 0.00025, 'claude-sonnet-4-6': 0.003, 'claude-opus-4-6': 0.015,
  // OpenAI
  'gpt-4o-mini': 0.00015, 'gpt-4o': 0.005,
  // Mistral
  'mistral-small-latest': 0.001, 'mistral-medium-latest': 0.003, 'mistral-large-latest': 0.008, 'codestral-latest': 0.001,
  // Cohere
  'command-light': 0.0003, 'command-r': 0.0005, 'command-r-plus': 0.003,
  // Together
  'meta-llama/Llama-3-8b-chat-hf': 0.0002, 'meta-llama/Llama-3-70b-chat-hf': 0.0009,
  'codellama/CodeLlama-34b-Instruct-hf': 0.0008,
  // Perplexity
  'sonar-small-chat': 0.0002, 'sonar-medium-chat': 0.0006, 'sonar-large-chat': 0.001,
  // Fireworks
  'accounts/fireworks/models/llama-v3-8b-instruct': 0.0002,
  'accounts/fireworks/models/llama-v3-70b-instruct': 0.0009,
  // Moonshot
  'moonshot-v1-8k': 0.0012, 'moonshot-v1-32k': 0.0024, 'moonshot-v1-128k': 0.006,
  // Qwen
  'qwen-turbo': 0.0003, 'qwen-plus': 0.001, 'qwen-max': 0.004, 'qwen-coder-turbo': 0.0005,
  // Yi
  'yi-lightning': 0.0001, 'yi-large': 0.0030, 'yi-large-turbo': 0.0012,
};

// ─── Provider priority (lower = prefer first) ─────────────────────────────────

const PROVIDER_PRIORITY: Record<string, number> = {
  ollama: 1, groq: 2, deepseek: 3, gemini: 4, fireworks: 5,
  anthropic: 6, openai: 7, mistral: 8, together: 9, lepton: 10,
  perplexity: 11, anyscale: 12, octoai: 13, cohere: 14, moonshot: 15,
  qwen: 16, yi: 17, openrouter: 18, cloudflare: 19, azure: 20, bedrock: 21, vertex: 22,
};

const PROVIDER_QUALITY: Record<string, number> = {
  openai: 0.95, anthropic: 0.97, groq: 0.85, gemini: 0.91,
  deepseek: 0.88, mistral: 0.87, cohere: 0.83, together: 0.80,
  perplexity: 0.82, fireworks: 0.82, anyscale: 0.78, lepton: 0.79,
  octoai: 0.79, cloudflare: 0.75, azure: 0.94, bedrock: 0.90,
  vertex: 0.90, moonshot: 0.84, qwen: 0.83, yi: 0.81,
  openrouter: 0.88, ollama: 0.75,
};

const PROVIDER_RELIABILITY: Record<string, number> = {
  openai: 0.99, anthropic: 0.99, groq: 0.97, gemini: 0.97, deepseek: 0.94,
  mistral: 0.97, cohere: 0.96, together: 0.94, perplexity: 0.95, fireworks: 0.95,
  anyscale: 0.93, lepton: 0.92, octoai: 0.92, cloudflare: 0.95, azure: 0.99,
  bedrock: 0.99, vertex: 0.98, moonshot: 0.90, qwen: 0.91, yi: 0.89,
  openrouter: 0.95, ollama: 0.85,
};

// Cost bonus for free/ultra-cheap providers (UTOE's core value proposition)
const COST_BONUS: Record<string, number> = {
  ollama: 0.6, groq: 0.4, deepseek: 0.35, gemini: 0.25, fireworks: 0.22,
  together: 0.20, lepton: 0.18, anyscale: 0.17, perplexity: 0.15,
  octoai: 0.15, cloudflare: 0.18, moonshot: 0.12, qwen: 0.12, yi: 0.15,
  mistral: 0.12, cohere: 0.1, openrouter: 0.1, anthropic: 0.05,
  openai: 0.05, azure: 0.05, bedrock: 0.05, vertex: 0.08,
};

// ─── Task tier mapping ────────────────────────────────────────────────────────

const TASK_TIERS: Partial<Record<TaskType, ModelTier>> = {
  summarize: 'cheap', translate: 'cheap', classify: 'cheap', clean: 'cheap',
  explain: 'medium', refactor: 'medium', review: 'medium', document: 'medium',
  debug: 'medium', test: 'medium', optimize: 'medium', generate: 'medium',
  analyze: 'large', architect: 'large', reason: 'large',
};

const CODE_TASKS = new Set<TaskType>(['debug', 'refactor', 'generate', 'review', 'test', 'optimize', 'document']);

// ─── Hardware detection ───────────────────────────────────────────────────────

let _hwCache: HardwareProfile | null = null;

export function detectHardware(): HardwareProfile {
  if (_hwCache) return _hwCache;
  const totalMemGB = os.totalmem() / (1024 ** 3);
  const cpuCount = os.cpus().length;
  const hasGpu = !!(
    process.env['CUDA_VISIBLE_DEVICES'] || process.env['ROCR_VISIBLE_DEVICES'] ||
    process.env['UTOE_GPU'] || process.env['METAL_DEVICE_WRAPPER_TYPE']
  );
  let ollamaCapacity: HardwareProfile['ollamaCapacity'] = 'none';
  if (hasGpu && totalMemGB >= 16) ollamaCapacity = 'large';
  else if (hasGpu && totalMemGB >= 8) ollamaCapacity = 'medium';
  else if (totalMemGB >= 16) ollamaCapacity = 'medium';
  else if (totalMemGB >= 8) ollamaCapacity = 'small';
  else ollamaCapacity = 'tiny';
  _hwCache = { totalMemGB, cpuCount, hasGpu, ollamaCapacity };
  return _hwCache;
}

function getOllamaModelForCapacity(cap: HardwareProfile['ollamaCapacity']): string {
  switch (cap) {
    case 'large': return 'llama3.1:70b';
    case 'medium': return 'llama3.1';
    case 'small': return 'llama3.2';
    default: return 'llama3.2:1b';
  }
}

// ─── Provider availability ────────────────────────────────────────────────────

export function getAvailableProviders(config: UTOEConfig): Record<string, boolean> {
  return {
    ollama: true,
    groq: !!config.GROQ_API_KEY,
    deepseek: !!config.DEEPSEEK_API_KEY,
    gemini: !!config.GEMINI_API_KEY,
    anthropic: !!config.ANTHROPIC_API_KEY,
    openai: !!config.OPENAI_API_KEY,
    mistral: !!config.MISTRAL_API_KEY,
    cohere: !!config.COHERE_API_KEY,
    together: !!config.TOGETHER_API_KEY,
    perplexity: !!config.PERPLEXITY_API_KEY,
    fireworks: !!config.FIREWORKS_API_KEY,
    openrouter: !!config.OPENROUTER_API_KEY,
    anyscale: !!config.ANYSCALE_API_KEY,
    cloudflare: !!config.CLOUDFLARE_AI_TOKEN,
    azure: !!config.AZURE_OPENAI_API_KEY,
    moonshot: !!config.MOONSHOT_API_KEY,
    qwen: !!config.QWEN_API_KEY,
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreCandidate(
  provider: string,
  model: string,
  weights: Record<string, number>,
  adaptiveStats?: Record<string, { successRate: number; avgLatency: number; count: number }>
): number {
  const cost = MODEL_PRICE_PER_1K[model] ?? 0.002;
  const costNorm = Math.min(1, cost / 0.015);
  const savings = 1 - costNorm;
  const qualityRisk = 1 - (PROVIDER_QUALITY[provider] ?? 0.8);
  const failureRisk = 1 - (PROVIDER_RELIABILITY[provider] ?? 0.9);
  const latencyPenalty = provider === 'ollama' ? 0.25 : 0.1;
  const priorityBonus = (22 - (PROVIDER_PRIORITY[provider] ?? 10)) * 0.03;
  const costBonus = COST_BONUS[provider] ?? 0;

  let adaptiveBonus = 0;
  if (adaptiveStats) {
    const key = `${provider}:${model}`;
    const stats = adaptiveStats[key];
    if (stats && stats.count >= 3) {
      // Reward success, penalize failure
      adaptiveBonus += (stats.successRate - 0.9) * 0.5;
      // Mild latency bonus/penalty
      if (stats.avgLatency < 500) adaptiveBonus += 0.05;
      if (stats.avgLatency > 3000) adaptiveBonus -= 0.1;
    }
  }

  return (
    (weights['savings'] ?? 1) * savings -
    (weights['quality_penalty'] ?? 2) * qualityRisk -
    (weights['latency_penalty'] ?? 1) * latencyPenalty -
    (weights['failure_penalty'] ?? 3) * failureRisk +
    priorityBonus + costBonus + adaptiveBonus
  );
}

// ─── ModelRouter class ────────────────────────────────────────────────────────

export class ModelRouter {
  plan(task: string, inputTokens: number, config: UTOEConfig = {}, opts: Record<string, any> = {}): RoutePlan {
    const policy = opts['policy'] as any;
    const available = getAvailableProviders(config);
    const hw = detectHardware();
    const weights = policy?.routing?.objective_weights ?? { savings: 1, quality_penalty: 2, latency_penalty: 1, failure_penalty: 3 };

    if (config.forceModel) {
      return this._buildForcedPlan(task, inputTokens, config, policy, opts);
    }

    // Effort level overrides task-based tier
    const effortLevel = (opts['effort'] ?? config['effort'] ?? 'medium') as EffortLevel;
    const effortTier = EFFORT_TO_TIER[effortLevel];

    const baseTier = effortTier ?? ((TASK_TIERS[task as TaskType] ?? 'medium') as ModelTier);
    const tier: ModelTier = effortLevel === 'high'
      ? 'large'
      : effortLevel === 'low'
        ? 'cheap'
        : (inputTokens > 10000 ? 'large' : inputTokens < 300 ? 'cheap' : baseTier);
    const isCode = CODE_TASKS.has(task as TaskType);

    const candidates: ModelCandidate[] = [];

    const adaptiveStats = telemetryStore.getRollups();
    for (const [provider, isAvail] of Object.entries(available)) {
      if (!isAvail) continue;
      const models = PROVIDER_MODELS[provider];
      if (!models) continue;

      let model: string;
      if (provider === 'ollama') {
        model = isCode && hw.ollamaCapacity !== 'tiny' ? (models['code'] ?? models['medium']!) : getOllamaModelForCapacity(hw.ollamaCapacity);
        if (tier === 'large' && hw.ollamaCapacity === 'large') model = models['large'] ?? model;
      } else {
        model = isCode && models['code'] ? models['code']! : (models[tier] ?? models['medium'] ?? models['cheap']!);
      }

      const score = scoreCandidate(provider, model, weights, adaptiveStats);
      candidates.push({
        provider: provider as ProviderName, model, tier, score,
        predicted_latency_ms: provider === 'ollama' ? 2000 : provider === 'groq' ? 300 : 800,
        predicted_cost_per_1k_usd: MODEL_PRICE_PER_1K[model] ?? 0.002,
        predicted_quality_risk: 1 - (PROVIDER_QUALITY[provider] ?? 0.8),
        context_limit: 8192,
      });
    }

    if (!candidates.length) {
      candidates.push({
        provider: 'ollama', model: getOllamaModelForCapacity(hw.ollamaCapacity), tier: 'cheap',
        score: 0, predicted_latency_ms: 2000, predicted_cost_per_1k_usd: 0,
        predicted_quality_risk: 0.3, context_limit: 8192,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;
    const second = candidates[1] ?? best;
    const confidence = Math.min(1, 0.5 + Math.abs(best.score - second.score));
    const threshold = policy?.routing?.confidence_threshold ?? 0.7;
    const conservativeOverride = confidence < threshold;
    const fallbackChain = this._buildFallbackChain(task, policy, available);
    const selected = conservativeOverride && fallbackChain[0]
      ? { ...best, provider: fallbackChain[0].provider, model: fallbackChain[0].model }
      : best;

    return {
      request_id: opts['request_id'] ?? 'req_local',
      trace_id: opts['trace_id'] ?? 'trace_local',
      router_policy_version: policy?.policy_version ?? 'v1.0.0',
      selected: {
        provider: selected.provider, model: selected.model, tier: selected.tier,
        compression_level: this._compressionLevel(task, policy),
        memory_budget_tokens: policy?.task_profiles?.[task]?.memory_budget_tokens ?? 800,
        context_budget_tokens: Math.max(512, Math.floor(inputTokens * 0.8)),
        max_output_tokens: Math.min(config.outputTokenLimit ?? 1024, policy?.hard_limits?.max_output_tokens ?? 4096),
      },
      candidates_ranked: candidates,
      fallback_chain: fallbackChain,
      confidence, conservative_override: conservativeOverride, hardware: hw,
    };
  }

  select(task: string, inputTokens: number, config: UTOEConfig = {}) {
    const plan = this.plan(task, inputTokens, config, {});
    return { provider: plan.selected.provider, model: plan.selected.model, tier: plan.selected.tier, fallbackChain: plan.fallback_chain, routePlan: plan };
  }

  listProviders(config: UTOEConfig = {}) {
    return Object.entries(getAvailableProviders(config))
      .filter(([, v]) => v)
      .map(([p]) => ({ provider: p, priority: PROVIDER_PRIORITY[p] ?? 99, quality: PROVIDER_QUALITY[p] ?? 0.8 }))
      .sort((a, b) => a.priority - b.priority);
  }

  getHardwareProfile(): HardwareProfile { return detectHardware(); }

  private _buildFallbackChain(task: string, policy: any, available: Record<string, boolean>): FallbackEntry[] {
    const chains = policy?.routing?.fallback_chains ?? {};
    const raw: FallbackEntry[] = chains[task] ?? chains['default'] ?? [
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'ollama', model: 'llama3.1' },
    ];
    return raw.filter((e: FallbackEntry) => available[e.provider]);
  }

  private _buildForcedPlan(task: string, inputTokens: number, config: UTOEConfig, policy: any, opts: any): RoutePlan {
    const available = getAvailableProviders(config);
    const provider = (config.forceProvider ?? this._detectProvider(config)) as ProviderName;
    const model = config.forceModel!;
    const chain = this._buildFallbackChain(task, policy, available);
    return {
      request_id: opts.request_id ?? 'req_local', trace_id: opts.trace_id ?? 'trace_local',
      router_policy_version: policy?.policy_version ?? 'v1.0.0',
      selected: {
        provider, model, tier: 'user_specified',
        compression_level: this._compressionLevel(task, policy),
        memory_budget_tokens: 800,
        context_budget_tokens: Math.max(512, Math.floor(inputTokens * 0.8)),
        max_output_tokens: Math.min(config.outputTokenLimit ?? 1024, 4096),
      },
      candidates_ranked: [{ provider, model, tier: 'user_specified', score: 1, predicted_latency_ms: 800, predicted_cost_per_1k_usd: MODEL_PRICE_PER_1K[model] ?? 0.002, predicted_quality_risk: 0.1 }],
      fallback_chain: chain, confidence: 1, conservative_override: false, hardware: detectHardware(),
    };
  }

  private _compressionLevel(task: string, policy: any): string {
    if (['debug', 'refactor', 'generate'].includes(task)) return 'lossless';
    return policy?.task_profiles?.[task]?.max_lossy_level ?? 'lossless';
  }

  private _detectProvider(config: UTOEConfig): string {
    if (config.GROQ_API_KEY) return 'groq';
    if (config.DEEPSEEK_API_KEY) return 'deepseek';
    if (config.ANTHROPIC_API_KEY) return 'anthropic';
    if (config.GEMINI_API_KEY) return 'gemini';
    if (config.OPENAI_API_KEY) return 'openai';
    return 'ollama';
  }
}

export const router = new ModelRouter();
