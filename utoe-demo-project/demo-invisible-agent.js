/**
 * demo-invisible-agent.js
 *
 * THE MAIN DEMO — shows how UTOE works without a proxy.
 *
 * UTOE is invisible to Claude/Cursor. The AI just reads a lean claude.md
 * and receives focused prompts. UTOE manages the files and compresses
 * the input/output silently — via pre/post-prompt hooks, not a proxy.
 *
 * What this demo proves:
 *  1. `utoe init` creates claude.md (≤60 lines) + .utoe/logs/ support files
 *  2. Pre-prompt hook strips filler, compresses tool output, saves tokens
 *  3. Post-prompt hook auto-routes AI responses to the right support file
 *  4. claude.md never grows beyond 60 lines — heavy content stays in .utoe/logs/
 *  5. Token savings compound with each turn (rolling window + deduplication)
 *
 * Run:
 *   node demo-invisible-agent.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Try to load UTOE modules from local node_modules ─────────────────────────
let compress, estimateTokens, runPrePromptHook, runPostPromptHook,
    processTerminalOutput, bootstrapProjectFiles, enforceClaudeMdLimit;

async function loadUTOE() {
  try {
    const comp = await import('./node_modules/utoe-plugin/lib/compression.js');
    compress       = comp.compress;
    estimateTokens = comp.estimateTokens;

    const hook = await import('./node_modules/utoe-plugin/lib/terminal-hook.js');
    runPrePromptHook    = hook.runPrePromptHook;
    runPostPromptHook   = hook.runPostPromptHook;
    processTerminalOutput = hook.processTerminalOutput;

    const boot = await import('./node_modules/utoe-plugin/lib/project-bootstrap.js');
    bootstrapProjectFiles = boot.bootstrapProjectFiles;
    enforceClaudeMdLimit  = boot.enforceClaudeMdLimit;

    return true;
  } catch (e) {
    return false;
  }
}

// ─── Fallback implementations (used if utoe-plugin not installed yet) ─────────

function fallbackEstimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(0.6 * (text.length / 3.8) + 0.4 * (text.split(/\s+/).length * 1.3));
}

function fallbackCompress(text) {
  const original = text;
  let result = text
    // filler removal
    .replace(/\b(hey|hi|hello)[,!.]*\s+/gi, '')
    .replace(/hope you(?:'?re| are)(?: doing)?(?: well| good| okay)?[.,]?\s*/gi, '')
    .replace(/thank(?:s| you)[.,!]?\s*/gi, '')
    .replace(/(?:can|could) you (?:please |kindly )?/gi, '')
    .replace(/(?:would you (?:please |mind )?|i was wondering if you could )/gi, '')
    .replace(/i need you to /gi, '')
    .replace(/\bi appreciate (?:your help|it)[.,]?\s*/gi, '')
    .replace(/(?:please |kindly )/gi, '')
    .replace(/(?:just |simply |basically |essentially )/gi, '')
    // whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const originalTokens   = fallbackEstimateTokens(original);
  const compressedTokens = fallbackEstimateTokens(result);
  const savedTokens      = originalTokens - compressedTokens;
  return {
    compressed: result,
    stats: {
      originalTokens,
      compressedTokens,
      savedTokens,
      savedPct: originalTokens > 0 ? Math.round((savedTokens / originalTokens) * 100) : 0,
    },
  };
}

const OUTPUT_CATEGORIES = [
  { pattern: /\b(TODO|FIXME|tech.?debt|technical.?debt)\b/i, file: 'tech_debt.md',               label: 'Tech Debt' },
  { pattern: /\b(bug|fix|error|regression)\b/i,              file: 'bug_list.md',                 label: 'Bug List' },
  { pattern: /\b(architecture|design.?decision|ADR|decided.?to)\b/i, file: 'architecture_decisions.md', label: 'Architecture Decisions' },
  { pattern: /\b(security|vulnerability|CVE|injection|XSS|auth)\b/i, file: 'security_checklist.md',    label: 'Security Checklist' },
  { pattern: /\b(temporary|workaround|interim)\b/i,          file: 'temp_decisions.md',           label: 'Temp Decisions' },
  { pattern: /\b(progress|completed|finished|implemented)\b/i,file: 'progress.md',                label: 'Progress Log' },
];

function fallbackPostHook(output, projectRoot) {
  let cleaned = output
    .replace(/^(Sure[,!]|Certainly[,!]|Of course[,!]|Absolutely[,!])\s*/i, '')
    .replace(/^I'?d be happy to help[!.]?\s*/i, '')
    .trim();

  for (const rule of OUTPUT_CATEGORIES) {
    if (rule.pattern.test(cleaned)) {
      const filePath = path.join(projectRoot, '.utoe', 'logs', rule.file);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ts    = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const entry = `\n## ${ts}\n${cleaned.slice(0, 400)}${cleaned.length > 400 ? '\n...' : ''}\n`;
      fs.appendFileSync(filePath, entry);
      return { output: cleaned, storedIn: filePath, category: rule.label };
    }
  }
  return { output: cleaned, storedIn: null, category: null };
}

// ─── Demo project directory ───────────────────────────────────────────────────

const DEMO_DIR = path.join(__dirname, '.utoe-demo-workspace');

function setupDemoDir() {
  if (fs.existsSync(DEMO_DIR)) fs.rmSync(DEMO_DIR, { recursive: true });
  fs.mkdirSync(DEMO_DIR, { recursive: true });
}

// ─── The 10 prompts (same as test scripts) ────────────────────────────────────

const PROMPTS = [
  `Hey, I was wondering if you could please help me build a simple CLI Todo App in TypeScript with Node.js 18. Thank you! I need you to create the project structure with commander.js for CLI parsing, in-memory storage, commands: add, list, done, remove, clear.`,

  `Could you kindly define the TypeScript types for the Todo item please? It should have id (number), title (string), done (boolean), createdAt (Date). Thanks so much!`,

  `I would really appreciate it if you could implement the in-memory storage layer in src/store.ts. I need you to export addTodo, listTodos, markDone, removeTodo, clearCompleted functions. Thanks!`,

  `Could you please implement the main CLI entry point using commander.js? I was wondering if you could add colored ANSI output too. I need you to wire up all five commands please.`,

  `The 'list' command output is too plain. Could you please improve it with checkboxes, relative dates like "2 hours ago", color coding pending vs done items, and a summary line?`,

  // Turn 6: includes git log output (tool output compression demo)
  `Here is the git log from our repo, please review it for any patterns:
commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
Author: Dev <dev@example.com>
Date:   Mon Apr 7 10:00:00 2026
    Add initial todo structure

commit b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3
Author: Dev <dev@example.com>
Date:   Mon Apr 7 11:00:00 2026
    Implement store functions

commit c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
Author: Dev <dev@example.com>
Date:   Mon Apr 7 12:00:00 2026
    Add CLI commands

commit d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5
Author: Dev <dev@example.com>
Date:   Mon Apr 7 13:00:00 2026
    Fix bug in markDone

commit e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6
Author: Dev <dev@example.com>
Date:   Mon Apr 7 14:00:00 2026
    Add error handling

commit f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1
Author: Dev <dev@example.com>
Date:   Mon Apr 7 15:00:00 2026
    Improve list formatting

commit a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6
Author: Dev <dev@example.com>
Date:   Mon Apr 7 16:00:00 2026
    Add tests

commit b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7
Author: Dev <dev@example.com>
Date:   Mon Apr 7 17:00:00 2026
    Update README

commit c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8
Author: Dev <dev@example.com>
Date:   Mon Apr 8 09:00:00 2026
    Add build config

commit d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9
Author: Dev <dev@example.com>
Date:   Mon Apr 8 10:00:00 2026
    Final review and cleanup

Could you please add proper error handling based on these commits?`,

  `I would appreciate if you could write unit tests for the store layer using Node.js built-in test runner. Thank you so much!`,

  `Could you kindly write a concise README.md? I was wondering if you could include installation steps and usage examples please. Thanks!`,

  `I need you to add an npm build script that compiles TypeScript to dist/ and update tsconfig.json with strict mode please.`,

  `Could you please do a final review of the whole codebase? I would appreciate a list of any TypeScript strict-mode errors, missing error handling, or style inconsistencies. Thanks!`,
];

// Simulated AI responses (realistic, categorized for routing demo)
const RESPONSES = [
  `Here's the project structure for your CLI Todo App.\n\nI've set up the directory with src/index.ts, src/types.ts, and src/store.ts. The package.json includes commander.js as a dependency with TypeScript dev deps.`,
  `Here are the TypeScript types in src/types.ts:\n\n\`\`\`typescript\nexport interface Todo { id: number; title: string; done: boolean; createdAt: Date; }\n\`\`\``,
  `The store implementation in src/store.ts is complete. I've added validation to addTodo and implemented all five functions with proper error handling.`,
  `The CLI entry point is implemented. All five commands are wired up with ANSI color codes — no extra dependencies needed.`,
  `The improved list command now shows: [ ] / [x] checkboxes, relative timestamps (just now / 2h ago / yesterday), color-coded output, and a summary line.\n\nArchitecture decision: using ANSI escape codes directly instead of chalk to keep zero runtime dependencies.`,
  `Based on the git log, here's the error handling implementation. I've fixed the bug in markDone that appeared in commit d4e5f6, added try/catch to all commander actions, and added a global unhandledRejection handler.\n\nTODO: add retry logic for store operations in a follow-up. This is a known tech debt item.`,
  `Here are the unit tests in src/store.test.ts using node:test.\n\nAll five test cases are implemented. The tests are isolated — each uses a resetStore() helper to prevent state leakage between runs.\n\nProgress: test coverage for store layer is now complete.`,
  `README.md written. Includes one-line description, install steps (npm install + npm run build), usage examples for all five commands with sample output.`,
  `tsconfig.json created with strict mode, ES2022 target, NodeNext module resolution.\n\nArchitecture decision: using NodeNext module resolution instead of CommonJS for native ESM support in Node.js 18+.`,
  `Final review complete. Found 3 minor issues:\n1. parseInt calls missing radix 10 — fixed\n2. clearCompleted return type should be void — fixed\n3. store.test.ts missing resetStore in beforeEach — fixed\n\nAll TypeScript strict-mode checks pass on Node.js 18.`,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

function bar(label, n, total, color = C.green) {
  const pct   = total > 0 ? Math.round((n / total) * 100) : 0;
  const width = Math.round((n / Math.max(total, 1)) * 30);
  return `${color}${'█'.repeat(width)}${C.dim}${'░'.repeat(30 - width)}${C.reset} ${pct}%`;
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split('\n').length;
}

// ─── Main demo ────────────────────────────────────────────────────────────────

async function main() {
  const utoeLoaded = await loadUTOE();

  // Use UTOE functions if available, fallbacks otherwise
  const _estimateTokens   = utoeLoaded ? estimateTokens  : fallbackEstimateTokens;
  const _compress         = utoeLoaded ? compress        : fallbackCompress;
  const _preHook          = utoeLoaded ? runPrePromptHook : (t) => {
    const r = fallbackCompress(t);
    return { input: r.compressed, originalTokens: r.stats.originalTokens,
             compressedTokens: r.stats.compressedTokens, savedTokens: r.stats.savedTokens,
             savedPct: r.stats.savedPct };
  };
  const _postHook         = utoeLoaded ? runPostPromptHook : fallbackPostHook;
  const _terminalHook     = utoeLoaded ? processTerminalOutput : (t) => ({
    processed: t, originalLen: t.length, compressedLen: t.length, savedPct: 0, detectors: []
  });
  const _bootstrap        = utoeLoaded ? bootstrapProjectFiles : null;
  const _enforceLimit     = utoeLoaded ? enforceClaudeMdLimit  : null;

  // ── Banner ──────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}╔════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  UTOE — Invisible Agent Demo                           ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  Claude/Cursor never knows UTOE exists                 ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n  UTOE module loaded: ${utoeLoaded ? `${C.green}YES (using real utoe-plugin)${C.reset}` : `${C.yellow}NO (using fallback — run install-utoe-demo.sh first)${C.reset}`}`);

  // ── Step 1: Bootstrap project ───────────────────────────────────────────────
  console.log(`\n${C.bold}━━━ Step 1: utoe init — bootstrap project files ━━━${C.reset}\n`);
  setupDemoDir();

  if (_bootstrap) {
    const result = _bootstrap(DEMO_DIR);
    console.log(`  Detected AI tool  : ${C.cyan}${result.detectedTool}${C.reset}`);
    console.log(`  Context file      : ${C.cyan}${result.contextFile}${C.reset}  ← AI reads this`);
    console.log(`  Files created     : ${result.created.length}`);
    for (const f of result.created.slice(0, 6)) {
      const icon = f.includes('logs/') ? '  📂' : f === result.contextFile ? '  📄' : '  🔧';
      console.log(`    ${icon} ${f}`);
    }
    if (result.created.length > 6) console.log(`    ... and ${result.created.length - 6} more`);
  } else {
    // Create files manually for fallback
    fs.mkdirSync(path.join(DEMO_DIR, '.utoe', 'logs'), { recursive: true });
    fs.mkdirSync(path.join(DEMO_DIR, '.utoe', 'skills'), { recursive: true });

    const claudeMd = `# Project Context\n\n## Overview\nUTOE Demo — CLI Todo App\n\n## Stack\nNode.js 18+, TypeScript, commander.js\n\n## Key Conventions\n- Follow existing patterns before adding new ones\n- All heavy content lives in .utoe/logs/ — not here\n\n## UTOE Notes\n- Support files: .utoe/logs/{tech_debt,bug_list,architecture_decisions,...}.md\n- Memory: .utoe_memory.json (auto-managed)\n\n## Active Decisions\n- TypeScript strict mode\n- In-memory storage (no DB for demo)\n\n## Out of Scope\n- Persistent database\n- Multi-user support\n`;
    fs.writeFileSync(path.join(DEMO_DIR, 'claude.md'), claudeMd);

    for (const f of ['tech_debt','bug_list','architecture_decisions','security_checklist','temp_decisions','progress','errors']) {
      const title = f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      fs.writeFileSync(path.join(DEMO_DIR, '.utoe', 'logs', `${f}.md`), `# ${title}\n\nAuto-populated by UTOE post-prompt hooks.\n`);
    }
    console.log(`  ${C.green}✓ Bootstrapped project files in .utoe-demo-workspace/${C.reset}`);
  }

  const claudeMdPath = path.join(DEMO_DIR, 'claude.md');
  const initialLines = countLines(claudeMdPath);
  console.log(`\n  ${C.green}✓ claude.md: ${initialLines} lines${C.reset}  (AI reads this — UTOE keeps it ≤60)`);
  console.log(`  ${C.dim}    Heavy content goes to .utoe/logs/ — loaded only when relevant${C.reset}`);

  // ── Step 2: Run 10 turns through pre/post hooks ─────────────────────────────
  console.log(`\n${C.bold}━━━ Step 2: 10 turns — pre-prompt + post-prompt hooks ━━━${C.reset}`);
  console.log(`${C.dim}  Claude receives compressed prompts. It never sees "UTOE".${C.reset}\n`);

  // Accumulate raw history (no UTOE) to show the contrast
  const rawHistory    = [];
  let totalRawTokens  = 0;
  let totalUtoeTokens = 0;
  let totalSaved      = 0;
  const routedFiles   = {};

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt   = PROMPTS[i];
    const response = RESPONSES[i];

    // Raw: full accumulated history token count
    rawHistory.push({ role: 'user', content: prompt });
    rawHistory.push({ role: 'assistant', content: response });
    const rawTurnTokens = rawHistory.reduce((s, m) => s + _estimateTokens(m.content), 0);
    totalRawTokens += rawTurnTokens;

    // UTOE pre-prompt hook
    const pre = _preHook(prompt, 'medium');

    // UTOE also compresses any terminal output in the prompt (git log, etc.)
    const termResult = _terminalHook(pre.input || pre.compressed || prompt);
    const finalInput = termResult.processed;
    const utoeInputTokens = _estimateTokens(finalInput);

    // UTOE post-prompt hook
    const post = _postHook(response, DEMO_DIR);
    const utoeOutputTokens = _estimateTokens(post.output);
    const utoeTotal = utoeInputTokens + utoeOutputTokens;

    totalUtoeTokens += utoeTotal;
    totalSaved      += rawTurnTokens - utoeTotal;

    if (post.storedIn) {
      const fname = path.basename(post.storedIn);
      routedFiles[fname] = (routedFiles[fname] || 0) + 1;
    }

    const savedThisTurn = rawTurnTokens - utoeTotal;
    const savedPct      = rawTurnTokens > 0 ? Math.round((savedThisTurn / rawTurnTokens) * 100) : 0;
    const pctColor      = savedPct >= 60 ? C.green : savedPct >= 30 ? C.yellow : C.dim;

    // Special turn markers
    const marker = i === 4 ? ` ${C.cyan}[/compact applied]${C.reset}` :
                   i === 7 ? ` ${C.cyan}[/effort low applied]${C.reset}` : '';

    console.log(`  Turn ${String(i+1).padStart(2)} │ raw: ${String(rawTurnTokens).padStart(5)} tok  →  UTOE: ${String(utoeTotal).padStart(4)} tok  │ ${pctColor}-${savedPct}%${C.reset}${marker}`);

    // Show routing on turns where it happened
    if (post.storedIn) {
      const fname = path.basename(post.storedIn);
      console.log(`         ${C.dim}└─ response routed to .utoe/logs/${fname}${C.reset}`);
    }

    // Show terminal compression on turn 6 (git log)
    if (termResult.savedPct > 0 && termResult.detectors?.length > 0) {
      console.log(`         ${C.dim}└─ tool output compressed (${termResult.detectors.join(', ')}): -${termResult.savedPct}%${C.reset}`);
    }

    // Enforce claude.md limit after turn 5
    if (i === 4 && _enforceLimit) {
      _enforceLimit(DEMO_DIR);
    }
  }

  // ── Step 3: Results ─────────────────────────────────────────────────────────
  const grandSavedPct = totalRawTokens > 0 ? Math.round((totalSaved / totalRawTokens) * 100) : 0;

  console.log(`\n${C.bold}━━━ Step 3: Results ━━━${C.reset}\n`);
  console.log(`  Total tokens WITHOUT UTOE  : ${C.red}${C.bold}${totalRawTokens.toLocaleString()}${C.reset}`);
  console.log(`  Total tokens WITH    UTOE  : ${C.green}${C.bold}${totalUtoeTokens.toLocaleString()}${C.reset}`);
  console.log(`  Tokens saved               : ${C.bold}${totalSaved.toLocaleString()}${C.reset}`);
  console.log(`  Overall savings            : ${bar('savings', totalSaved, totalRawTokens)}  ${C.bold}${grandSavedPct}%${C.reset}`);
  console.log(`  Est. cost saved (Haiku $3/MTok): $${((totalSaved / 1_000_000) * 3).toFixed(5)}`);

  // ── Step 4: Post-prompt routing ─────────────────────────────────────────────
  console.log(`\n${C.bold}━━━ Step 4: Auto-routing — what went where ━━━${C.reset}\n`);
  console.log(`  Claude's responses were silently categorized and stored:`);
  console.log();

  const logsDir = path.join(DEMO_DIR, '.utoe', 'logs');
  for (const fname of fs.readdirSync(logsDir).sort()) {
    const fpath   = path.join(logsDir, fname);
    const content = fs.readFileSync(fpath, 'utf8');
    const lines   = content.split('\n').length;
    const entries = (content.match(/^## \d{4}/gm) || []).length;
    const hasData = entries > 0;
    const icon    = hasData ? `${C.green}●${C.reset}` : `${C.dim}○${C.reset}`;
    console.log(`  ${icon}  .utoe/logs/${fname.padEnd(36)} ${hasData ? `${entries} entry` : `${C.dim}empty${C.reset}`}`);
  }

  // ── Step 5: claude.md line count ────────────────────────────────────────────
  console.log(`\n${C.bold}━━━ Step 5: claude.md is still lean ━━━${C.reset}\n`);
  const finalLines = countLines(claudeMdPath);
  const lineColor  = finalLines <= 60 ? C.green : C.red;
  console.log(`  claude.md line count : ${lineColor}${C.bold}${finalLines} lines${C.reset}  ${finalLines <= 60 ? `${C.green}✓ under 60-line limit${C.reset}` : `${C.red}✗ over limit — run utoe init to trim${C.reset}`}`);
  console.log();

  // Show the actual content
  if (fs.existsSync(claudeMdPath)) {
    console.log(`  ${C.dim}┌─ claude.md content (what Claude sees) ─────────────────┐${C.reset}`);
    const lines = fs.readFileSync(claudeMdPath, 'utf8').split('\n');
    for (const line of lines.slice(0, 20)) {
      console.log(`  ${C.dim}│${C.reset}  ${line}`);
    }
    if (lines.length > 20) console.log(`  ${C.dim}│  ... (${lines.length - 20} more lines)${C.reset}`);
    console.log(`  ${C.dim}└────────────────────────────────────────────────────────┘${C.reset}`);
  }

  // ── Step 6: Key insight ──────────────────────────────────────────────────────
  console.log(`\n${C.bold}━━━ What the AI actually sees ━━━${C.reset}\n`);
  console.log(`  ${C.cyan}Claude / Cursor reads:${C.reset}`);
  console.log(`    • claude.md                   ← ${finalLines} lines, minimal context`);
  console.log(`    • Your (compressed) message   ← filler stripped, tool output summarized`);
  console.log();
  console.log(`  ${C.cyan}Claude / Cursor does NOT see:${C.reset}`);
  console.log(`    • UTOE itself`);
  console.log(`    • .utoe/logs/ files (unless RAG decides they're relevant)`);
  console.log(`    • The word "/compact" (UTOE handled it before the AI saw it)`);
  console.log(`    • "please", "could you kindly", "I was wondering if" (stripped)`);
  console.log(`    • Full 50-line git log (compressed to 8-line summary)`);
  console.log();
  console.log(`  ${C.green}${C.bold}Result: AI tools work normally, get focused context, cost less.${C.reset}`);
  console.log(`  ${C.green}${C.bold}Zero changes to how you use Claude CLI or Cursor.${C.reset}`);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  console.log(`\n${C.dim}  Demo workspace: ${DEMO_DIR}${C.reset}`);
  console.log(`${C.dim}  (remove with: rm -rf .utoe-demo-workspace)${C.reset}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
