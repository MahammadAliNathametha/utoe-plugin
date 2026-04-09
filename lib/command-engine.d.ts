/**
 * UTOE Command Engine — Full implementation
 *
 * Handles all slash commands, runtime flag injection, effort levels,
 * ESC ESC (double-press), --append-system-prompt, pre/post hooks.
 *
 * Commands:
 *   /clear          — Wipe short-term context + reset session
 *   /compact        — Compress conversation history in-place
 *   /btw <note>     — Inject a side-note without creating a new user turn
 *   /planning       — Switch to planning mode (disable execution flags)
 *   /rewind [n]     — Roll back n turns (default 1)
 *   /effort <l|m|h> — Set effort level: low | medium | high
 *   /init           — Bootstrap claude.md + support files
 *   /flags          — Show active runtime flags
 *   /forget [query] — Remove facts from long-term memory
 *   /skills         — List loaded skills from local storage
 *   /status         — Show session stats (tokens, savings, effort, flags)
 *   /append-system  — Temporarily append text to system prompt
 *
 * ESC ESC (double press within 500ms) — same as /compact
 */
import type { ChatMessage, CompressOptions } from './types.js';
export type EffortLevel = 'low' | 'medium' | 'high';
export interface RuntimeFlags {
    disable_mcp: boolean;
    disable_auto_memory: boolean;
    disable_background_tasks: boolean;
    disable_thinking: boolean;
    effort: EffortLevel;
    max_output_tokens: number | null;
    append_system_prompt: string | null;
    planning_mode: boolean;
}
export interface CommandResult {
    handled: boolean;
    command?: string;
    message?: string;
    modifiedInput?: string;
    clearContext?: boolean;
    compactHistory?: boolean;
    rewindTurns?: number;
    sideNote?: string;
    flagsUpdated?: Partial<RuntimeFlags>;
    newSystemAppend?: string;
    response?: string;
}
export interface SessionState {
    history: ChatMessage[];
    flags: RuntimeFlags;
    effortLevel: EffortLevel;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalSaved: number;
    turnCount: number;
    sideNotes: string[];
    systemAppends: string[];
    lastEscTime?: number;
    /** Tracks last topic for topic-shift detection in the pipeline. */
    lastTopic?: string | null;
    /** Optional session ID for multi-session proxy deployments. */
    sessionId?: string;
}
export declare const EFFORT_PROFILES: Record<EffortLevel, {
    max_output_tokens: number;
    disable_thinking: boolean;
    compression: CompressOptions;
    model_tier: 'cheap' | 'medium' | 'large';
    label: string;
}>;
export declare function createDefaultSession(): SessionState;
/**
 * Build a system prompt fragment from active runtime flags.
 * Injected transparently before each request.
 */
export declare function buildFlagInjection(flags: RuntimeFlags): string;
/**
 * Inject flags + side-notes + system appends into a messages array.
 * Returns a new messages array with the injected system content.
 */
export declare function injectFlagsIntoMessages(messages: ChatMessage[], session: SessionState, appendSystemPrompt?: string): ChatMessage[];
/**
 * Compact the conversation history in-place.
 * Keeps first 2 turns (context anchor) + last 4 turns (recency).
 * Middle turns are compressed and summarized.
 */
export declare function compactHistory(history: ChatMessage[]): {
    history: ChatMessage[];
    savedTokens: number;
};
export declare function parseCommand(input: string): {
    command: string;
    args: string;
} | null;
export declare function handleEscPress(session: SessionState): CommandResult | null;
export interface CommandEngineOptions {
    projectRoot?: string;
    memoryForget?: (query: string) => number;
}
export declare class CommandEngine {
    private readonly _projectRoot;
    private readonly _memoryForget?;
    constructor(opts?: CommandEngineOptions);
    /**
     * Process a user input string. Returns a CommandResult.
     * If handled=true, the caller should NOT forward to the LLM (unless modifiedInput is set).
     */
    process(input: string, session: SessionState): CommandResult;
    /**
     * Check for ESC ESC double-press. Call this on every ESC keypress.
     */
    onEscPress(session: SessionState): CommandResult | null;
    /**
     * Prepare messages for LLM — inject flags, side notes, system appends.
     * Call this before every LLM request.
     */
    prepareMessages(messages: ChatMessage[], session: SessionState, appendSystem?: string): ChatMessage[];
    /**
     * After an LLM response — update session stats, store in history, clear side notes.
     */
    onResponseReceived(userInput: string, assistantResponse: string, inputTokens: number, outputTokens: number, savedTokens: number, session: SessionState): void;
    private runDiagnostics;
    private _handleHelp;
}
export declare const commandEngine: CommandEngine;
//# sourceMappingURL=command-engine.d.ts.map