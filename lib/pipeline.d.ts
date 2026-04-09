/**
 * UTOE 10-Stage Pipeline
 *
 * Stages:
 *  1. Input Cleaner      — strip filler, normalize whitespace
 *  2. Intent Detector    — classify task type
 *  3. Topic Shift        — detect conversation topic change
 *  4. Model Router       — plan provider/model + budget tokens
 *  5. Memory Recall      — inject relevant facts (budgeted)
 *  6. Prompt Builder     — combine input + memory context
 *  7. Flag Injection     — inject runtime flags via CommandEngine
 *  8. Token Guard        — trim messages to context window budget
 *  9. LLM Executor       — call provider with fallback chain
 * 10. Telemetry + Learn  — update session state and memory
 */
import { type SessionState } from './command-engine.js';
import type { ChatMessage, PipelineResult, UTOEConfig } from './types.js';
/**
 * Result of running stages 1-8 only (no LLM call).
 * Used by the transparent proxy: UTOE optimizes the messages, caller forwards them.
 */
export interface OptimizedMessages {
    messages: ChatMessage[];
    savedTokens: number;
    savedPct: number;
    originalTokens: number;
    task: string;
    topic: string;
}
/**
 * Run stages 1–8 of the pipeline (optimize only, no LLM execution).
 * The caller is responsible for forwarding the resulting messages to the LLM.
 * Used by the transparent Anthropic proxy so Claude Code's own auth token is preserved.
 */
export declare function optimizeMessages(input: string | ChatMessage[], config?: UTOEConfig, session?: SessionState): Promise<OptimizedMessages>;
/**
 * Run the full UTOE pipeline for a chat request.
 * Accepts either a plain string or a ChatMessage[] array.
 */
export declare function runPipeline(input: string | ChatMessage[], config?: UTOEConfig, session?: SessionState): Promise<PipelineResult>;
/**
 * Suggest a better version of a prompt.
 * Returns a structured SuggestionResult with JSON rewrite, task detection, and scoring.
 */
export declare function suggestBetterPrompt(prompt: string): import("./types.js").SuggestionResult;
//# sourceMappingURL=pipeline.d.ts.map