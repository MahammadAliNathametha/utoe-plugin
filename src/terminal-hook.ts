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

import * as path from 'path';
import * as fs from 'fs';
import type { TerminalHookResult } from './types.js';
import { CommandEngine, createDefaultSession, type SessionState, type CommandResult } from './command-engine.js';
import { compress, estimateTokens } from './compression.js';

// ─── Pre-prompt hook ──────────────────────────────────────────────────────────

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
export function runPrePromptHook(
  input: string,
  effortLevel: 'low' | 'medium' | 'high' = 'medium',
  appendSystemPrompt?: string
): PrePromptHookResult {
  const originalTokens = estimateTokens(input);

  // Extract inline --append-system-prompt flag from input
  let extracted = appendSystemPrompt;
  let cleanInput = input;
  const appendMatch = input.match(/--append-system-prompt\s+"([^"]+)"/);
  if (appendMatch) {
    extracted = appendMatch[1]!;
    cleanInput = input.replace(appendMatch[0], '').trim();
  }

  const compressionOpts = {
    lossless: effortLevel === 'high',
    aggressiveCode: effortLevel === 'low',
  };

  const { compressed, stats } = compress(cleanInput, compressionOpts);

  return {
    input: compressed,
    originalTokens,
    compressedTokens: stats.compressedTokens,
    savedTokens: stats.savedTokens,
    savedPct: stats.savedPct,
    appendedSystem: extracted,
  };
}

// ─── Post-prompt hook ─────────────────────────────────────────────────────────

export interface PostPromptHookResult {
  output: string;
  storedIn?: string;
  category?: string;
}

const OUTPUT_FILE_MAP: Array<{
  pattern: RegExp;
  category: string;
  file: string;
}> = [
  { pattern: /\b(TODO|todo|FIXME|tech.?debt|technical.?debt)\b/i, category: 'tech_debt', file: '.utoe/logs/tech_debt.md' },
  { pattern: /\b(bug|fix|error|issue|regression)\b/i, category: 'bugs', file: '.utoe/logs/bug_list.md' },
  { pattern: /\b(architecture|design.?decision|ADR|decided.?to)\b/i, category: 'decisions', file: '.utoe/logs/architecture_decisions.md' },
  { pattern: /\b(security|vulnerability|CVE|injection|XSS|CSRF|auth)\b/i, category: 'security', file: '.utoe/logs/security_checklist.md' },
  { pattern: /\b(temporary|workaround|temp.?decision|interim)\b/i, category: 'temp', file: '.utoe/logs/temp_decisions.md' },
  { pattern: /\b(progress|completed|finished|implemented|done)\b/i, category: 'progress', file: '.utoe/logs/progress.md' },
];

/**
 * Run after every LLM response.
 * Cleans output and routes it to the correct support file if it matches a category.
 */
export function runPostPromptHook(
  output: string,
  projectRoot: string = process.cwd()
): PostPromptHookResult {
  // Clean common AI boilerplate from output
  let cleaned = output
    .replace(/^(Sure[,!]|Certainly[,!]|Of course[,!]|Absolutely[,!])\s*/i, '')
    .replace(/^I'?d be happy to help[!.]?\s*/i, '')
    .trim();

  // Check if output matches a storage category
  for (const rule of OUTPUT_FILE_MAP) {
    if (rule.pattern.test(cleaned)) {
      const filePath = path.join(projectRoot, rule.file);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
      }
      if (fs.existsSync(dir)) {
        const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const entry = `\n## ${ts}\n${cleaned.slice(0, 500)}${cleaned.length > 500 ? '\n...(truncated)' : ''}\n`;
        try {
          fs.appendFileSync(filePath, entry);
          return { output: cleaned, storedIn: filePath, category: rule.category };
        } catch { /* ignore */ }
      }
      break;
    }
  }

  return { output: cleaned };
}

// ─── Hook registry ────────────────────────────────────────────────────────────

export type HookFn = (input: string, session: SessionState) => string | Promise<string>;

export class TerminalHookManager {
  private readonly _engine: CommandEngine;
  private readonly _projectRoot: string;
  private _preHooks: HookFn[] = [];
  private _postHooks: HookFn[] = [];

  constructor(projectRoot: string = process.cwd()) {
    this._projectRoot = projectRoot;
    this._engine = new CommandEngine({
      projectRoot,
    });
  }

  /** Register a pre-prompt hook (runs before sending to LLM). */
  addPreHook(fn: HookFn): void {
    this._preHooks.push(fn);
  }

  /** Register a post-prompt hook (runs after receiving LLM response). */
  addPostHook(fn: HookFn): void {
    this._postHooks.push(fn);
  }

  /**
   * Intercept a user input.
   * Returns CommandResult if it was a slash command, null otherwise.
   */
  intercept(input: string, session: SessionState): CommandResult | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;
    const result = this._engine.process(trimmed, session);
    if (!result.handled && !result.response) return null;
    return result;
  }

  /**
   * Run all pre-prompt hooks on the input. Returns transformed input.
   */
  async runPreHooks(input: string, session: SessionState): Promise<string> {
    let current = input;
    for (const hook of this._preHooks) {
      try { current = await hook(current, session); } catch { /* ignore */ }
    }
    return current;
  }

  /**
   * Run all post-prompt hooks on the output. Returns transformed output.
   */
  async runPostHooks(output: string, session: SessionState): Promise<string> {
    let current = output;
    for (const hook of this._postHooks) {
      try { current = await hook(current, session); } catch { /* ignore */ }
    }
    return current;
  }

  /**
   * Signal an ESC keypress. Returns CommandResult if ESC ESC double-press detected.
   */
  onEscPress(session: SessionState): CommandResult | null {
    return this._engine.onEscPress(session);
  }

  getEngine(): CommandEngine {
    return this._engine;
  }
}

interface Detector {
  name: string;
  detect: (text: string) => boolean;
  compress: (text: string) => string;
}

// ─── Compressor functions ─────────────────────────────────────────────────────

function compressGitLog(text: string): string {
  const lines = text.split('\n');
  const blocks: Array<{ hash: string; lines: string[] }> = [];
  let current: { hash: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (/^commit\s+[0-9a-f]{40}$/.test(line.trim())) {
      if (current) blocks.push(current);
      current = { hash: line.trim().split(' ')[1]!.slice(0, 8), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  if (blocks.length <= 8) return text;

  const recent = blocks.slice(-8);
  const older = blocks.slice(0, -8);
  const subjects = older.map((b) => {
    const msg = b.lines.find((l) => !l.match(/^(Author:|Date:|Merge:|\s*$)/));
    return `${b.hash}: ${(msg ?? '').trim().slice(0, 50)}`;
  });

  const summary = `[UTOE: ${older.length} older commits]\n${subjects.slice(0, 5).join('\n')}${subjects.length > 5 ? `\n...+${subjects.length - 5} more` : ''}`;
  const recentText = recent.map((b) => `commit ${b.hash}\n${b.lines.join('\n')}`).join('\n');
  return `${summary}\n\n${recentText}`;
}

function compressGitDiff(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 60) return text;

  let addedLines = 0, removedLines = 0;
  const files: Array<{ file: string; added: number; removed: number }> = [];
  let cur: { file: string; added: number; removed: number } | null = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (cur) files.push(cur);
      const m = line.match(/b\/(.+)$/);
      cur = { file: m ? m[1]! : 'unknown', added: 0, removed: 0 };
    } else if (cur) {
      if (line.startsWith('+') && !line.startsWith('+++')) { cur.added++; addedLines++; }
      if (line.startsWith('-') && !line.startsWith('---')) { cur.removed++; removedLines++; }
    }
  }
  if (cur) files.push(cur);

  const summary = files.map((f) => `  ${f.file}: +${f.added}/-${f.removed}`).join('\n');
  return `[UTOE compressed diff: ${files.length} files, +${addedLines}/-${removedLines}]\n${summary}\n\n${lines.slice(0, 40).join('\n')}${lines.length > 40 ? `\n[...${lines.length - 40} more lines]` : ''}`;
}

function compressNpmOutput(text: string): string {
  const lines = text.split('\n');
  const keep = lines.filter((l) => {
    const ll = l.toLowerCase();
    return ll.includes('error') || ll.includes('vulnerabilit') ||
           /added \d+/.test(ll) || /audited \d+/.test(ll) || /found \d+/.test(ll) ||
           (ll.includes('warn') && ll.includes('security'));
  });
  const dropped = lines.length - keep.length;
  if (dropped < 5) return text;
  return keep.join('\n') + (dropped > 0 ? `\n[UTOE: omitted ${dropped} npm info lines]` : '');
}

function compressDockerPs(text: string): string {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 5) return text;
  const header = lines[0]!;
  const rows = lines.slice(1).map((row) => {
    const cols = row.split(/\s{2,}/);
    return [cols[0], cols[1], cols[4], cols[6]].filter(Boolean).join('  |  ');
  });
  return `${header}\n${rows.join('\n')}\n[UTOE: normalized docker ps]`;
}

function compressStackTrace(text: string): string {
  const lines = text.split('\n');
  const errorLines: string[] = [];
  const frameLines: string[] = [];
  let inFrames = false;

  for (const line of lines) {
    if (/^\s+at\s+/.test(line) || /^\s+File\s+"/.test(line)) {
      inFrames = true;
      frameLines.push(line);
    } else if (inFrames && line.trim() === '') {
      break;
    } else {
      errorLines.push(line);
      inFrames = false;
    }
  }

  if (frameLines.length <= 8) return text;
  const kept = [
    ...frameLines.slice(0, 3),
    `    [UTOE: ${frameLines.length - 6} frames omitted]`,
    ...frameLines.slice(-3),
  ];
  return [...errorLines, ...kept].join('\n');
}

function compressTestOutput(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 30) return text;
  const keep = lines.filter((l) =>
    /(?:PASS|FAIL|ERROR|✓|✗|×|●)/i.test(l) ||
    /(?:Tests?:|Suites?:|passing|failing|pending)/i.test(l) ||
    /\d+ms|\d+s/.test(l) ||
    l.includes('expect') || l.includes('AssertionError') || l.includes('Error:')
  );
  const dropped = lines.length - keep.length;
  if (dropped < 10) return text;
  return keep.join('\n') + `\n[UTOE: omitted ${dropped} verbose test lines]`;
}

// ─── Detector registry ────────────────────────────────────────────────────────

export const DETECTORS: Detector[] = [
  { name: 'git_log',    detect: (t) => /^commit\s+[0-9a-f]{40}/m.test(t),                           compress: compressGitLog },
  { name: 'git_diff',   detect: (t) => /^(?:diff --git|---|\+\+\+|@@\s+-\d+)/m.test(t),             compress: compressGitDiff },
  { name: 'npm_output', detect: (t) => /(?:npm warn|npm WARN|added \d+ packages|audited \d+)/i.test(t), compress: compressNpmOutput },
  { name: 'docker_ps',  detect: (t) => /CONTAINER ID\s+IMAGE/i.test(t),                             compress: compressDockerPs },
  { name: 'stack_trace',detect: (t) => /(?:Error:|at\s+\w+\s+\(|Traceback|Exception in thread)/m.test(t), compress: compressStackTrace },
  { name: 'test_output',detect: (t) => /(?:PASS|FAIL|✓|✗|passing|failing|\d+ tests?)/i.test(t),    compress: compressTestOutput },
];

// ─── Main export ──────────────────────────────────────────────────────────────

export function processTerminalOutput(text: string): TerminalHookResult {
  const originalLen = text.length;
  let processed = text;
  const applied: string[] = [];

  // Try to compress terminal blocks in code fences first
  processed = processed.replace(/```(?:terminal|bash|sh|console|output)?\n([\s\S]+?)```/gi, (full, content: string) => {
    for (const det of DETECTORS) {
      if (det.detect(content)) {
        const compressed = det.compress(content);
        if (compressed.length < content.length * 0.9) {
          applied.push(det.name);
          return full.replace(content, compressed);
        }
      }
    }
    return full;
  });

  // Try raw text if no fenced blocks matched
  if (processed === text) {
    for (const det of DETECTORS) {
      if (det.detect(processed)) {
        const compressed = det.compress(processed);
        if (compressed.length < processed.length * 0.9) {
          applied.push(det.name);
          processed = compressed;
          break;
        }
      }
    }
  }

  return {
    processed,
    originalLen,
    compressedLen: processed.length,
    savedPct: Math.round(((originalLen - processed.length) / Math.max(originalLen, 1)) * 100),
    detectors: applied,
  };
}

export const terminalHook = { processTerminalOutput, DETECTORS };
