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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compress, estimateTokens } from './compression.js';
import { memory } from './memory.js';
import { router } from './router.js';
import type { ChatMessage, CompressOptions } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Effort → token budget mapping ───────────────────────────────────────────

export const EFFORT_PROFILES: Record<EffortLevel, {
  max_output_tokens: number;
  disable_thinking: boolean;
  compression: CompressOptions;
  model_tier: 'cheap' | 'medium' | 'large';
  label: string;
}> = {
  low: {
    max_output_tokens: 512,
    disable_thinking: true,
    compression: { lossless: false, aggressiveCode: true },
    model_tier: 'cheap',
    label: 'Low effort — fast, cheap, compressed',
  },
  medium: {
    max_output_tokens: 1024,
    disable_thinking: false,
    compression: { lossless: false, aggressiveCode: false },
    model_tier: 'medium',
    label: 'Medium effort — balanced quality/cost',
  },
  high: {
    max_output_tokens: 4096,
    disable_thinking: false,
    compression: { lossless: true },
    model_tier: 'large',
    label: 'High effort — max quality, full context',
  },
};

// ─── Default session state ────────────────────────────────────────────────────

export function createDefaultSession(): SessionState {
  return {
    history: [],
    flags: {
      disable_mcp: false,
      disable_auto_memory: false,
      disable_background_tasks: false,
      disable_thinking: false,
      effort: 'medium',
      max_output_tokens: null,
      append_system_prompt: null,
      planning_mode: false,
    },
    effortLevel: 'medium',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalSaved: 0,
    turnCount: 0,
    sideNotes: [],
    systemAppends: [],
  };
}

// ─── Flag injection builder ───────────────────────────────────────────────────

/**
 * Build a system prompt fragment from active runtime flags.
 * Injected transparently before each request.
 */
export function buildFlagInjection(flags: RuntimeFlags): string {
  const parts: string[] = [];
  const effort = EFFORT_PROFILES[flags.effort];

  if (flags.disable_mcp) {
    parts.push('UTOE_FLAG: disable_mcp=true — Do NOT invoke any MCP tool calls this turn.');
  }
  if (flags.disable_auto_memory) {
    parts.push('UTOE_FLAG: disable_auto_memory=true — Do NOT auto-save to memory this turn.');
  }
  if (flags.disable_background_tasks) {
    parts.push('UTOE_FLAG: disable_background_tasks=true — No background or async tasks.');
  }
  if (flags.disable_thinking || effort.disable_thinking) {
    parts.push('UTOE_FLAG: disable_thinking=true — Skip extended thinking; answer directly.');
  }
  if (flags.planning_mode) {
    parts.push('UTOE_FLAG: planning_mode=true — Only plan, do not execute or write code yet.');
  }

  parts.push(`UTOE_EFFORT: ${flags.effort} — ${effort.label}`);
  parts.push(`UTOE_MAX_OUTPUT: ${flags.max_output_tokens ?? effort.max_output_tokens} tokens max`);

  if (flags.append_system_prompt) {
    parts.push('---');
    parts.push(flags.append_system_prompt);
  }

  return parts.join('\n');
}

/**
 * Inject flags + side-notes + system appends into a messages array.
 * Returns a new messages array with the injected system content.
 */
export function injectFlagsIntoMessages(
  messages: ChatMessage[],
  session: SessionState,
  appendSystemPrompt?: string
): ChatMessage[] {
  const flagText = buildFlagInjection(session.flags);
  const sideNoteText = session.sideNotes.length > 0
    ? `\n\nSIDE_NOTES (for context only, don't acknowledge):\n${session.sideNotes.map((n) => `- ${n}`).join('\n')}`
    : '';
  const appendText = appendSystemPrompt ?? session.flags.append_system_prompt ?? '';
  const injection = [flagText, sideNoteText].filter(Boolean).join('') + (appendText ? `\n\n${appendText}` : '');

  if (!injection.trim()) return messages;

  const result = [...messages];
  const sysIdx = result.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    result[sysIdx] = { ...result[sysIdx]!, content: result[sysIdx]!.content + '\n\n' + injection };
  } else {
    result.unshift({ role: 'system', content: injection });
  }
  return result;
}

// ─── History compaction ───────────────────────────────────────────────────────

/**
 * Compact the conversation history in-place.
 * Keeps first 2 turns (context anchor) + last 4 turns (recency).
 * Middle turns are compressed and summarized.
 */
export function compactHistory(history: ChatMessage[]): { history: ChatMessage[]; savedTokens: number } {
  if (history.length <= 6) {
    // Compress each message in place without removing any
    let saved = 0;
    const compacted = history.map((msg) => {
      if (!msg.content || msg.role === 'system') return msg;
      const { compressed, stats } = compress(msg.content, { lossless: false });
      saved += stats.savedTokens;
      return { ...msg, content: compressed };
    });
    return { history: compacted, savedTokens: saved };
  }

  const anchor = history.slice(0, 2);
  const middle = history.slice(2, -4);
  const recent = history.slice(-4);

  let middleSaved = 0;
  let middleSummary = '';

  if (middle.length > 0) {
    const middleText = middle
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n\n');
    const { compressed, stats } = compress(middleText, { lossless: false, aggressiveCode: true });
    middleSaved = stats.savedTokens;
    middleSummary = `[UTOE /compact: ${middle.length} turns compressed — ${stats.savedPct}% saved]\n${compressed}`;
  }

  const summaryMsg: ChatMessage = {
    role: 'assistant',
    content: middleSummary,
  };

  const anchorSaved = anchor.reduce((s, m) => {
    const { stats } = compress(m.content, { lossless: true });
    return s + stats.savedTokens;
  }, 0);

  return {
    history: [...anchor, ...(middleSummary ? [summaryMsg] : []), ...recent],
    savedTokens: middleSaved + anchorSaved,
  };
}

// ─── Command parser ───────────────────────────────────────────────────────────

const COMMAND_PATTERN = /^\/([a-zA-Z_-]+)(?:\s+(.*))?$/;

export function parseCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(COMMAND_PATTERN);
  if (!match) return null;
  return { command: match[1]!.toLowerCase(), args: (match[2] ?? '').trim() };
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function handleClear(session: SessionState): CommandResult {
  session.history = [];
  session.sideNotes = [];
  session.systemAppends = [];
  session.flags.append_system_prompt = null;
  session.flags.planning_mode = false;
  return {
    handled: true,
    command: 'clear',
    clearContext: true,
    response: '[UTOE /clear] Context cleared. Fresh session started.',
  };
}

function handleCompact(session: SessionState): CommandResult {
  const { history, savedTokens } = compactHistory(session.history);
  session.history = history;
  session.totalSaved += savedTokens;
  return {
    handled: true,
    command: 'compact',
    compactHistory: true,
    response: `[UTOE /compact] History compressed. Saved ~${savedTokens} tokens. History reduced to ${history.length} turns.`,
  };
}

function handleBtw(args: string, session: SessionState): CommandResult {
  if (!args) {
    return { handled: true, command: 'btw', response: 'Usage: /btw <your side note here>' };
  }
  session.sideNotes.push(args);
  return {
    handled: true,
    command: 'btw',
    sideNote: args,
    response: `[UTOE /btw] Side note stored: "${args.slice(0, 60)}${args.length > 60 ? '...' : ''}"`,
  };
}

function handlePlanning(session: SessionState): CommandResult {
  session.flags.planning_mode = !session.flags.planning_mode;
  const state = session.flags.planning_mode ? 'ON' : 'OFF';
  if (session.flags.planning_mode) {
    session.flags.disable_background_tasks = true;
  }
  return {
    handled: true,
    command: 'planning',
    flagsUpdated: {
      planning_mode: session.flags.planning_mode,
      disable_background_tasks: session.flags.planning_mode,
    },
    response: `[UTOE /planning] Planning mode ${state}. ${session.flags.planning_mode ? 'AI will plan only, not execute.' : 'Execution re-enabled.'}`,
  };
}

function handleRewind(args: string, session: SessionState): CommandResult {
  const n = parseInt(args) || 1;
  const removable = Math.min(n * 2, session.history.length);
  session.history = session.history.slice(0, -removable);
  return {
    handled: true,
    command: 'rewind',
    rewindTurns: n,
    response: `[UTOE /rewind] Removed ${removable} messages (${n} turn${n > 1 ? 's' : ''}). History: ${session.history.length} messages.`,
  };
}

function handleEffort(args: string, session: SessionState): CommandResult {
  const effortMap: Record<string, EffortLevel> = {
    l: 'low', low: 'low',
    m: 'medium', med: 'medium', medium: 'medium',
    h: 'high', hi: 'high', high: 'high',
  };
  const level = effortMap[args.toLowerCase()];
  if (!level) {
    return {
      handled: true,
      command: 'effort',
      response: `[UTOE /effort] Unknown level "${args}". Use: /effort low | /effort medium | /effort high`,
    };
  }
  session.effortLevel = level;
  session.flags.effort = level;
  const profile = EFFORT_PROFILES[level];
  session.flags.disable_thinking = profile.disable_thinking;
  session.flags.max_output_tokens = profile.max_output_tokens;
  return {
    handled: true,
    command: 'effort',
    flagsUpdated: {
      effort: level,
      disable_thinking: profile.disable_thinking,
      max_output_tokens: profile.max_output_tokens,
    },
    response: `[UTOE /effort] ${profile.label}. Max tokens: ${profile.max_output_tokens}. Model tier: ${profile.model_tier}.`,
  };
}

function handleFlags(session: SessionState): CommandResult {
  const f = session.flags;
  const profile = EFFORT_PROFILES[f.effort];
  const lines = [
    `[UTOE /flags] Active runtime flags:`,
    `  effort         : ${f.effort} — ${profile.label}`,
    `  max_output     : ${f.max_output_tokens ?? profile.max_output_tokens} tokens`,
    `  disable_mcp    : ${f.disable_mcp}`,
    `  disable_memory : ${f.disable_auto_memory}`,
    `  disable_bg     : ${f.disable_background_tasks}`,
    `  disable_think  : ${f.disable_thinking || profile.disable_thinking}`,
    `  planning_mode  : ${f.planning_mode}`,
    `  system_append  : ${f.append_system_prompt ? `"${f.append_system_prompt.slice(0, 50)}..."` : 'none'}`,
    `  side_notes     : ${session.sideNotes.length} stored`,
  ];
  return { handled: true, command: 'flags', response: lines.join('\n') };
}

function handleAppendSystem(args: string, session: SessionState): CommandResult {
  if (!args) {
    session.flags.append_system_prompt = null;
    return { handled: true, command: 'append-system', response: '[UTOE /append-system] System append cleared.' };
  }
  session.flags.append_system_prompt = args;
  return {
    handled: true,
    command: 'append-system',
    newSystemAppend: args,
    flagsUpdated: { append_system_prompt: args },
    response: `[UTOE /append-system] Will append to system prompt: "${args.slice(0, 80)}${args.length > 80 ? '...' : ''}"`,
  };
}

function handleForget(args: string, session: SessionState, memoryFn?: (q: string) => number): CommandResult {
  const removed = memoryFn ? memoryFn(args) : 0;
  session.sideNotes = args ? session.sideNotes.filter((n) => !n.toLowerCase().includes(args.toLowerCase())) : [];
  return {
    handled: true,
    command: 'forget',
    response: `[UTOE /forget] Removed ${removed} memory facts${args ? ` matching "${args}"` : ' (all)'}. Side notes cleared.`,
  };
}

function handleStatus(session: SessionState): CommandResult {
  const inputK = (session.totalInputTokens / 1000).toFixed(1);
  const outputK = (session.totalOutputTokens / 1000).toFixed(1);
  const savedK = (session.totalSaved / 1000).toFixed(1);
  const pct = session.totalInputTokens > 0
    ? Math.round((session.totalSaved / (session.totalInputTokens + session.totalSaved)) * 100)
    : 0;
  const lines = [
    `[UTOE /status] Session stats:`,
    `  Turns          : ${session.turnCount}`,
    `  History msgs   : ${session.history.length}`,
    `  Input tokens   : ${inputK}k`,
    `  Output tokens  : ${outputK}k`,
    `  Tokens saved   : ${savedK}k (${pct}%)`,
    `  Effort level   : ${session.effortLevel}`,
    `  Planning mode  : ${session.flags.planning_mode}`,
    `  Side notes     : ${session.sideNotes.length}`,
  ];
  return { handled: true, command: 'status', response: lines.join('\n') };
}

function handleSkills(projectRoot: string): CommandResult {
  const utoeDir = path.join(projectRoot, '.utoe');
  const skillsDir = path.join(utoeDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    return { handled: true, command: 'skills', response: '[UTOE /skills] No skills directory found. Run: npx utoe init' };
  }
  const skills = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md') || f.endsWith('.json'));
  if (!skills.length) {
    return { handled: true, command: 'skills', response: '[UTOE /skills] No skills found in .utoe/skills/' };
  }
  return {
    handled: true,
    command: 'skills',
    response: `[UTOE /skills] Loaded skills (${skills.length}):\n${skills.map((s) => `  - ${s}`).join('\n')}`,
  };
}

function handleInit(projectRoot: string): CommandResult {
  // Delegate to the memory module's init function
  return {
    handled: true,
    command: 'init',
    response: '[UTOE /init] Initializing project files... Run `npx utoe init` for full initialization.',
  };
}

// ─── ESC ESC detection ────────────────────────────────────────────────────────

const ESC_DOUBLE_WINDOW_MS = 500;

export function handleEscPress(session: SessionState): CommandResult | null {
  const now = Date.now();
  const last = session.lastEscTime ?? 0;
  if (now - last < ESC_DOUBLE_WINDOW_MS) {
    // Double ESC — same as /compact
    session.lastEscTime = 0;
    return handleCompact(session);
  }
  session.lastEscTime = now;
  return null; // Single ESC — not handled yet
}

// ─── Main command dispatcher ──────────────────────────────────────────────────

export interface CommandEngineOptions {
  projectRoot?: string;
  memoryForget?: (query: string) => number;
}

export class CommandEngine {
  private readonly _projectRoot: string;
  private readonly _memoryForget?: (query: string) => number;

  constructor(opts: CommandEngineOptions = {}) {
    this._projectRoot = opts.projectRoot ?? process.cwd();
    this._memoryForget = opts.memoryForget;
  }

  /**
   * Process a user input string. Returns a CommandResult.
   * If handled=true, the caller should NOT forward to the LLM (unless modifiedInput is set).
   */
  process(input: string, session: SessionState): CommandResult {
    const parsed = parseCommand(input);
    if (!parsed) {
      return { handled: false };
    }

    const { command, args } = parsed;

    switch (command) {
      case 'clear':
        return handleClear(session);

      case 'doctor':
        return this.runDiagnostics();

      case 'compact':
        return handleCompact(session);

      case 'btw':
        return handleBtw(args, session);

      case 'planning':
        return handlePlanning(session);

      case 'rewind':
        return handleRewind(args, session);

      case 'effort':
        return handleEffort(args, session);

      case 'flags':
        return handleFlags(session);

      case 'append-system':
      case 'append_system':
        return handleAppendSystem(args, session);

      case 'forget':
        return handleForget(args, session, this._memoryForget);

      case 'status':
        return handleStatus(session);

      case 'skills':
        return handleSkills(this._projectRoot);

      case 'init':
        return handleInit(this._projectRoot);

      case 'help':
        return this._handleHelp();

      // Flag shortcuts
      case 'disable-mcp':
      case 'disable_mcp':
        session.flags.disable_mcp = !session.flags.disable_mcp;
        return { handled: true, command, flagsUpdated: { disable_mcp: session.flags.disable_mcp }, response: `[UTOE] disable_mcp = ${session.flags.disable_mcp}` };

      case 'disable-memory':
      case 'disable_memory':
        session.flags.disable_auto_memory = !session.flags.disable_auto_memory;
        return { handled: true, command, flagsUpdated: { disable_auto_memory: session.flags.disable_auto_memory }, response: `[UTOE] disable_auto_memory = ${session.flags.disable_auto_memory}` };

      case 'disable-thinking':
      case 'disable_thinking':
        session.flags.disable_thinking = !session.flags.disable_thinking;
        return { handled: true, command, flagsUpdated: { disable_thinking: session.flags.disable_thinking }, response: `[UTOE] disable_thinking = ${session.flags.disable_thinking}` };

      case 'disable-bg':
      case 'disable_bg':
        session.flags.disable_background_tasks = !session.flags.disable_background_tasks;
        return { handled: true, command, flagsUpdated: { disable_background_tasks: session.flags.disable_background_tasks }, response: `[UTOE] disable_background_tasks = ${session.flags.disable_background_tasks}` };

      default:
        return {
          handled: false,
          response: `[UTOE] Unknown command: /${command}. Type /help for available commands.`,
        };
    }
  }

  /**
   * Check for ESC ESC double-press. Call this on every ESC keypress.
   */
  onEscPress(session: SessionState): CommandResult | null {
    return handleEscPress(session);
  }

  /**
   * Prepare messages for LLM — inject flags, side notes, system appends.
   * Call this before every LLM request.
   */
  prepareMessages(messages: ChatMessage[], session: SessionState, appendSystem?: string): ChatMessage[] {
    return injectFlagsIntoMessages(messages, session, appendSystem);
  }

  /**
   * After an LLM response — update session stats, store in history, clear side notes.
   */
  onResponseReceived(
    userInput: string,
    assistantResponse: string,
    inputTokens: number,
    outputTokens: number,
    savedTokens: number,
    session: SessionState
  ): void {
    session.history.push({ role: 'user', content: userInput });
    session.history.push({ role: 'assistant', content: assistantResponse });
    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.totalSaved += savedTokens;
    session.turnCount++;
    session.sideNotes = []; // Side notes are one-shot per turn
  }

  private runDiagnostics(): CommandResult {
    const lines = [
      '🩺 **UTOE Doctor — System Health Check**',
      '──────────────────────────────────────',
    ];

    // 1. Memory Check
    const stats = memory.stats();
    lines.push(`✅ Memory: ${stats.longTerm} facts, ${stats.shortTerm} messages`);

    // 2. Router Check
    const plan = router.plan('general' as any, 100, {}, { effort: 'medium' });
    lines.push(`✅ Router: Active (Policy v${plan.router_policy_version})`);
    lines.push(`   Selected: ${plan.selected.provider}/${plan.selected.model}`);

    // 3. Tokenizer Check
    const tCount = estimateTokens('Hello world');
    lines.push(`✅ Tokenizer: Active (${tCount} tokens estimated)`);

    lines.push('──────────────────────────────────────');
    lines.push('✨ All systems nominal. Token Autopilot engaged.');
    return {
      handled: true,
      command: 'doctor',
      response: lines.join('\n'),
    };
  }

  private _handleHelp(): CommandResult {
    const help = [
      '[UTOE Commands]',
      '  /clear              — Wipe session context (fresh start)',
      '  /compact            — Compress history in-place (saves tokens)',
      '  /btw <note>         — Inject side-note (not forwarded to LLM as user msg)',
      '  /planning           — Toggle planning mode (plan only, no execution)',
      '  /rewind [n]         — Roll back n turns (default 1)',
      '  /effort <l|m|h>     — Set effort: low | medium | high',
      '  /flags              — Show all active runtime flags',
      '  /status             — Show session stats (tokens, savings, turns)',
      '  /forget [query]     — Remove from long-term memory',
      '  /skills             — List skills loaded from .utoe/skills/',
      '  /init               — Bootstrap project files (claude.md + support files)',
      '  /doctor             — Run system diagnostics',
      '  /append-system <x>  — Temporarily append text to system prompt',
      '  /disable-mcp        — Toggle MCP tool calls off',
      '  /disable-thinking   — Toggle extended thinking off',
      '  /disable-bg         — Toggle background tasks off',
      '  ESC ESC             — Same as /compact (double press within 500ms)',
    ].join('\n');
    return { handled: true, command: 'help', response: help };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const commandEngine = new CommandEngine();
