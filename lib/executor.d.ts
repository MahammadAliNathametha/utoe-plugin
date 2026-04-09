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
import type { ChatMessage, ExecutionResult, FallbackEntry, ProviderName } from './types.js';
declare class LLMExecutor {
    execute(messages: ChatMessage[], opts: {
        provider: ProviderName;
        model: string;
        fallbackChain: FallbackEntry[];
    }): Promise<ExecutionResult>;
}
export declare const executor: LLMExecutor;
export {};
//# sourceMappingURL=executor.d.ts.map