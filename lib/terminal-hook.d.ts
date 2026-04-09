/**
 * UTOE Terminal Hook — TypeScript
 *
 * Two responsibilities:
 *  1. Intercept slash commands (/clear, /compact, /btw, /planning, /rewind, /effort, etc.)
 *     before they reach the AI, and route them to the CommandEngine.
 *  2. Detect and compress common terminal command outputs (git log, diff, npm, docker, etc.)
 *
 * Also handles:
 *  - Pre-prompt hooks: compress input before sending
 *  - Post-prompt hooks: clean/store AI output in correct support file
 *  - ESC ESC (double press within 500ms) → /compact
 *  - --append-system-prompt <text> flag
 *
 * @example
 * ```typescript
 * import { TerminalHookManager } from './terminal-hook.js';
 * const hook = new TerminalHookManager();
 * const result = hook.intercept('/compact', session);
 * // result.handled === true, result.response === '[UTOE /compact] ...'
 * ```
 */
import type { TerminalHookResult } from './types.js';
import { CommandEngine, type SessionState, type CommandResult } from './command-engine.js';
export interface PrePromptHookResult {
    input: string;
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savedPct: number;
    appendedSystem?: string;
}
/**
 * Run before every LLM request.
 * Compresses the input, extracts --append-system-prompt flag,
 * and applies effort-level compression settings.
 */
export declare function runPrePromptHook(input: string, effortLevel?: 'low' | 'medium' | 'high', appendSystemPrompt?: string): PrePromptHookResult;
export interface PostPromptHookResult {
    output: string;
    storedIn?: string;
    category?: string;
}
/**
 * Run after every LLM response.
 * Cleans output and routes it to the correct support file if it matches a category.
 */
export declare function runPostPromptHook(output: string, projectRoot?: string): PostPromptHookResult;
export type HookFn = (input: string, session: SessionState) => string | Promise<string>;
export declare class TerminalHookManager {
    private readonly _engine;
    private readonly _projectRoot;
    private _preHooks;
    private _postHooks;
    constructor(projectRoot?: string);
    /** Register a pre-prompt hook (runs before sending to LLM). */
    addPreHook(fn: HookFn): void;
    /** Register a post-prompt hook (runs after receiving LLM response). */
    addPostHook(fn: HookFn): void;
    /**
     * Intercept a user input.
     * Returns CommandResult if it was a slash command, null otherwise.
     */
    intercept(input: string, session: SessionState): CommandResult | null;
    /**
     * Run all pre-prompt hooks on the input. Returns transformed input.
     */
    runPreHooks(input: string, session: SessionState): Promise<string>;
    /**
     * Run all post-prompt hooks on the output. Returns transformed output.
     */
    runPostHooks(output: string, session: SessionState): Promise<string>;
    /**
     * Signal an ESC keypress. Returns CommandResult if ESC ESC double-press detected.
     */
    onEscPress(session: SessionState): CommandResult | null;
    getEngine(): CommandEngine;
}
interface Detector {
    name: string;
    detect: (text: string) => boolean;
    compress: (text: string) => string;
}
export declare const DETECTORS: Detector[];
export declare function processTerminalOutput(text: string): TerminalHookResult;
export declare const terminalHook: {
    processTerminalOutput: typeof processTerminalOutput;
    DETECTORS: Detector[];
};
export {};
//# sourceMappingURL=terminal-hook.d.ts.map