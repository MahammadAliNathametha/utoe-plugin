/**
 * UTOE LLM Executor — multi-provider execution with automatic fallback.
 *
 * Reads API keys from process.env (populated from .env.utoe by the CLI).
 * Supports OpenAI-compatible endpoints, Anthropic's native API, and Google Gemini.
 *
 * Fallback behaviour:
 *  - Tries the selected provider first.
 *  - On any error (HTTP 4xx/5xx, timeout, network failure) moves to the next
 *    entry in fallbackChain.
 *  - If all providers fail, returns a graceful error message rather than throwing.
 */
// ─── Provider base URLs ───────────────────────────────────────────────────────
const PROVIDER_BASE_URLS = {
    openai: 'https://api.openai.com',
    groq: 'https://api.groq.com/openai',
    deepseek: 'https://api.deepseek.com',
    mistral: 'https://api.mistral.ai',
    perplexity: 'https://api.perplexity.ai',
    together: 'https://api.together.xyz',
    fireworks: 'https://api.fireworks.ai/inference',
    openrouter: 'https://openrouter.ai/api',
    anyscale: 'https://api.endpoints.anyscale.com/v1',
    lepton: 'https://llama3-8b.lepton.run/api/v1',
    octoai: 'https://text.octoai.run',
    cohere: 'https://api.cohere.com',
    moonshot: 'https://api.moonshot.cn/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
    yi: 'https://api.lingyiwanwu.com/v1',
    cloudflare: 'https://api.cloudflare.com/client/v4',
};
// ─── Env key lookup ───────────────────────────────────────────────────────────
const ENV_KEY_MAP = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    cohere: 'COHERE_API_KEY',
    together: 'TOGETHER_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    fireworks: 'FIREWORKS_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    anyscale: 'ANYSCALE_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    qwen: 'QWEN_API_KEY',
    yi: 'YI_API_KEY',
    cloudflare: 'CLOUDFLARE_API_KEY',
    azure: 'AZURE_OPENAI_API_KEY',
    bedrock: 'AWS_ACCESS_KEY_ID',
    vertex: 'VERTEX_API_KEY',
};
function getApiKey(provider) {
    const envKey = ENV_KEY_MAP[provider];
    return envKey ? (process.env[envKey] ?? '') : '';
}
// ─── Provider call implementations ───────────────────────────────────────────
async function callOpenAICompatible(baseUrl, apiKey, messages, model) {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify({ model, messages, max_tokens: 1024 }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}
async function callAnthropic(messages, model) {
    const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            ...(systemMsg && { system: systemMsg.content }),
            messages: chatMessages,
        }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
}
async function callGemini(messages, model) {
    const apiKey = process.env['GEMINI_API_KEY'] ?? '';
    const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
async function callProvider(provider, model, messages) {
    if (provider === 'anthropic')
        return callAnthropic(messages, model);
    if (provider === 'gemini')
        return callGemini(messages, model);
    const ollamaBase = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
    if (provider === 'ollama')
        return callOpenAICompatible(ollamaBase, '', messages, model);
    const baseUrl = PROVIDER_BASE_URLS[provider];
    if (!baseUrl)
        throw new Error(`Unknown provider: ${provider}`);
    return callOpenAICompatible(baseUrl, getApiKey(provider), messages, model);
}
// ─── LLMExecutor class ────────────────────────────────────────────────────────
class LLMExecutor {
    async execute(messages, opts) {
        const attempts = [];
        const chain = [
            { provider: opts.provider, model: opts.model },
            ...opts.fallbackChain,
        ];
        for (const entry of chain) {
            attempts.push({ provider: entry.provider, model: entry.model });
            try {
                const text = await callProvider(entry.provider, entry.model, messages);
                return {
                    text,
                    provider: entry.provider,
                    model: entry.model,
                    attempts,
                    fallbackUsed: attempts.length > 1,
                };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[UTOE executor] ${entry.provider}/${entry.model} failed: ${msg}`);
            }
        }
        return {
            text: '[UTOE: all providers unavailable — check API keys or Ollama status]',
            provider: opts.provider,
            model: opts.model,
            attempts,
            fallbackUsed: false,
        };
    }
}
export const executor = new LLMExecutor();
//# sourceMappingURL=executor.js.map