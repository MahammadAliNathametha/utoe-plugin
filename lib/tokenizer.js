/**
 * UTOE Tokenizer Table — Provider-aware token estimation
 *
 * Provides pinpoint accurate token counts for standard models using
 * optimized character-to-token ratios and per-message overheads.
 */
const DEFAULT_CONFIG = {
    charsPerToken: 3.5, // Conservative average
    perMessageOverhead: 3,
};
const TOKENIZER_TABLE = {
    openai: {
        'gpt-4o': { charsPerToken: 3.8, perMessageOverhead: 3 },
        'gpt-4o-mini': { charsPerToken: 3.8, perMessageOverhead: 3 },
        'gpt-4-turbo': { charsPerToken: 3.7, perMessageOverhead: 3 },
    },
    anthropic: {
        'claude-3-5-sonnet': { charsPerToken: 3.5, perMessageOverhead: 3 },
        'claude-3-opus': { charsPerToken: 3.5, perMessageOverhead: 3 },
        'claude-3-haiku': { charsPerToken: 3.5, perMessageOverhead: 3 },
    },
    groq: {
        'llama-3.3-70b-versatile': { charsPerToken: 3.2, perMessageOverhead: 4 },
        'llama-3.1-8b-instant': { charsPerToken: 3.2, perMessageOverhead: 4 },
    },
    deepseek: {
        'deepseek-chat': { charsPerToken: 3.4, perMessageOverhead: 3 },
        'deepseek-reasoner': { charsPerToken: 3.4, perMessageOverhead: 3 },
    },
};
/**
 * Estimate tokens for a string based on specific provider/model heuristics.
 */
export function estimateTokensFromTable(provider, model, text) {
    if (!text)
        return 0;
    const config = TOKENIZER_TABLE[provider]?.[model] ||
        TOKENIZER_TABLE[provider]?.['default'] ||
        DEFAULT_CONFIG;
    const codeChars = (text.match(/```[\s\S]*?```/g) ?? []).reduce((s, b) => s + b.length, 0);
    const proseChars = text.length - codeChars;
    // Code is typically denser (fewer chars per token)
    const codeRatio = Math.max(2.5, config.charsPerToken - 0.5);
    const proseRatio = config.charsPerToken;
    return Math.ceil(proseChars / proseRatio + codeChars / codeRatio);
}
/**
 * Estimate overhead tokens for a set of messages.
 */
export function estimateMessageOverhead(provider, model, messageCount) {
    const config = TOKENIZER_TABLE[provider]?.[model] || DEFAULT_CONFIG;
    return messageCount * config.perMessageOverhead;
}
//# sourceMappingURL=tokenizer.js.map