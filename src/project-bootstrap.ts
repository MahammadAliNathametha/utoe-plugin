/**
 * UTOE Project Bootstrap — creates and manages project support files.
 *
 * Responsibilities:
 *  - Detect which AI tool is in use (Claude Code, Cursor, Copilot, Windsurf, etc.)
 *  - Create the correct context file for that tool (claude.md, .cursorrules, etc.)
 *  - Create .utoe/logs/ support files (tech_debt, bug_list, etc.)
 *  - Enforce the 60-line limit on the context file
 *  - Load relevant support files via keyword scoring (RAG-lite fallback)
 *
 * This module is intentionally separated from the memory engine (memory.ts)
 * so that file-system concerns don't pollute the in-memory store logic.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UTOE_DIR  = path.join(__dirname, '..');

// ─── IDE / AI tool detection ──────────────────────────────────────────────────

/**
 * Detect which AI coding tool is active based on environment variables,
 * existing config files, and process ancestors.
 */
export function detectAITool(projectRoot: string = process.cwd()): {
  tool: 'claude' | 'cursor' | 'copilot' | 'windsurf' | 'aider' | 'continue' | 'generic';
  contextFile: string;
  label: string;
} {
  // Environment variable override
  const envTool = (process.env['UTOE_AI_TOOL'] ?? '').toLowerCase();
  if (envTool === 'cursor')    return { tool: 'cursor',   contextFile: '.cursorrules',    label: 'Cursor' };
  if (envTool === 'copilot')   return { tool: 'copilot',  contextFile: '.github/copilot-instructions.md', label: 'GitHub Copilot' };
  if (envTool === 'windsurf')  return { tool: 'windsurf', contextFile: '.windsurfrules',  label: 'Windsurf' };
  if (envTool === 'aider')     return { tool: 'aider',    contextFile: 'CONVENTIONS.md',  label: 'Aider' };
  if (envTool === 'continue')  return { tool: 'continue', contextFile: '.continue/config.json', label: 'Continue' };
  if (envTool === 'claude')    return { tool: 'claude',   contextFile: 'claude.md',       label: 'Claude Code' };

  // Auto-detect by existing config files in project root
  if (fs.existsSync(path.join(projectRoot, '.cursorrules')))
    return { tool: 'cursor',   contextFile: '.cursorrules',    label: 'Cursor' };
  if (fs.existsSync(path.join(projectRoot, '.windsurfrules')))
    return { tool: 'windsurf', contextFile: '.windsurfrules',  label: 'Windsurf' };
  if (fs.existsSync(path.join(projectRoot, '.github', 'copilot-instructions.md')))
    return { tool: 'copilot',  contextFile: '.github/copilot-instructions.md', label: 'GitHub Copilot' };
  if (fs.existsSync(path.join(projectRoot, '.continue')))
    return { tool: 'continue', contextFile: '.continue/config.json', label: 'Continue' };
  if (fs.existsSync(path.join(projectRoot, 'claude.md')))
    return { tool: 'claude',   contextFile: 'claude.md',       label: 'Claude Code' };

  // Detect by process name / parent process
  const proc = process.env['TERM_PROGRAM'] ?? process.env['_'] ?? '';
  if (/cursor/i.test(proc))   return { tool: 'cursor',  contextFile: '.cursorrules',   label: 'Cursor' };
  if (/claude/i.test(proc))   return { tool: 'claude',  contextFile: 'claude.md',      label: 'Claude Code' };
  if (/windsurf/i.test(proc)) return { tool: 'windsurf',contextFile: '.windsurfrules', label: 'Windsurf' };

  // Default: claude.md (most widely adopted convention)
  return { tool: 'claude', contextFile: 'claude.md', label: 'Claude Code' };
}

// ─── Templates ────────────────────────────────────────────────────────────────

const CONTEXT_TEMPLATE = `# Project Context

## Overview
<!-- 1-2 sentences: what this project does -->

## Stack
<!-- e.g. Node 20, TypeScript, Hono, LanceDB -->

## Key Conventions
- Follow existing patterns before adding new ones
- All heavy content lives in .utoe/logs/ — not here

## UTOE Notes
- Auto-generated support files: .utoe/logs/{tech_debt,bug_list,architecture_decisions,security_checklist,temp_decisions,progress}.md
- Skills: .utoe/skills/*.md
- Memory: .utoe_memory.json (auto-managed)

## Active Decisions
<!-- Short list of current design choices (max 5 bullets) -->

## Out of Scope
<!-- What NOT to implement or change -->
`;

const SUPPORT_FILES: Array<{ path: string; content: string }> = [
  {
    path: '.utoe/logs/tech_debt.md',
    content: `# Tech Debt\n\n> Auto-populated by UTOE when Claude mentions TODO / FIXME / tech debt.\n\n## Format\n\`\`\`\n## YYYY-MM-DD HH:MM\n**Area:** <module or file>\n**Issue:** <what the problem is>\n**Impact:** low | medium | high\n**Effort:** <estimated fix effort>\n\`\`\`\n\n---\n`,
  },
  {
    path: '.utoe/logs/bug_list.md',
    content: `# Bug List\n\n> Auto-populated by UTOE when Claude mentions bug / fix / error / regression.\n\n## Format\n\`\`\`\n## YYYY-MM-DD HH:MM\n**Status:** open | in-progress | resolved ✓\n**Severity:** critical | high | medium | low\n**Description:** <what happens>\n**Steps:** <how to reproduce>\n**Fix:** <what was done or planned>\n\`\`\`\n\n---\n`,
  },
  {
    path: '.utoe/logs/architecture_decisions.md',
    content: `# Architecture Decisions\n\n> Auto-populated by UTOE when Claude mentions architecture / design decision / ADR.\n\n## Format\n\`\`\`\n## ADR-NNN — YYYY-MM-DD\n**Decision:** <what was decided>\n**Status:** proposed | accepted | deprecated | superseded\n**Context:** <why this decision was needed>\n**Consequences:** <trade-offs and implications>\n\`\`\`\n\n---\n`,
  },
  {
    path: '.utoe/logs/security_checklist.md',
    content: `# Security Checklist\n\n> Auto-populated by UTOE when Claude mentions security / vulnerability / auth / XSS / injection.\n\n## Checklist\n- [ ] Input validation on all user-controlled data\n- [ ] No secrets committed to git (.env.utoe is gitignored ✓)\n- [ ] Authentication tokens not logged\n- [ ] SQL/NoSQL injection prevention verified\n- [ ] XSS prevention: output escaping in place\n- [ ] Dependencies audited: \`npm audit\`\n- [ ] Rate limiting on public endpoints\n- [ ] CORS policy reviewed\n\n## Security Notes\n\n---\n`,
  },
  {
    path: '.utoe/logs/temp_decisions.md',
    content: `# Temporary Decisions\n\n> Auto-populated by UTOE when Claude mentions temporary / workaround / interim solution.\n> Every entry here should have a revisit date.\n\n## Format\n\`\`\`\n## YYYY-MM-DD HH:MM\n**Decision:** <what was done temporarily>\n**Reason:** <why a proper fix wasn't done now>\n**Revisit by:** YYYY-MM-DD\n**Ticket:** <link if available>\n\`\`\`\n\n---\n`,
  },
  {
    path: '.utoe/logs/progress.md',
    content: `# Progress Log\n\n> Auto-populated by UTOE when Claude mentions completed / implemented / finished / done.\n\n## Format\n\`\`\`\n## YYYY-MM-DD HH:MM\n**Completed:** <what was done>\n**Files changed:** <list>\n**Next:** <what comes next>\n\`\`\`\n\n---\n`,
  },
  {
    path: '.utoe/logs/errors.md',
    content: `# Error Log\n\n> Populated when errors occur during UTOE processing or when Claude surfaces runtime errors.\n\n## Format\n\`\`\`\n## YYYY-MM-DD HH:MM\n**Error:** <error message>\n**Context:** <what was being done>\n**Resolution:** <how it was fixed>\n\`\`\`\n\n---\n`,
  },
  { path: '.utoe/skills/.gitkeep',                 content: '' },
  {
    path: '.utoe/schema.json',
    content: JSON.stringify({ version: '1.0.0', generated: new Date().toISOString(), files: [] }, null, 2),
  },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Bootstrap a project: create the appropriate AI context file and all UTOE support files.
 * Auto-detects the active AI tool (Claude Code → claude.md, Cursor → .cursorrules, etc.).
 * Idempotent — skips files that already exist.
 */
export function bootstrapProjectFiles(projectRoot: string = process.cwd()): {
  created: string[];
  skipped: string[];
  detectedTool: string;
  contextFile: string;
} {
  const created: string[] = [];
  const skipped: string[] = [];

  const { contextFile, label } = detectAITool(projectRoot);
  const contextFilePath = path.join(projectRoot, contextFile);
  const contextFileDir = path.dirname(contextFilePath);

  if (!fs.existsSync(contextFilePath)) {
    try {
      if (!fs.existsSync(contextFileDir)) fs.mkdirSync(contextFileDir, { recursive: true });
      fs.writeFileSync(contextFilePath, CONTEXT_TEMPLATE.trim());
      created.push(contextFile);
    } catch { /* ignore */ }
  } else {
    skipped.push(contextFile);
  }

  for (const { path: relPath, content } of SUPPORT_FILES) {
    const absPath = path.join(projectRoot, relPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    if (!fs.existsSync(absPath)) {
      try { fs.writeFileSync(absPath, content); created.push(relPath); } catch { /* ignore */ }
    } else {
      skipped.push(relPath);
    }
  }

  return { created, skipped, detectedTool: label, contextFile };
}

/**
 * Enforce the 60-line limit on the AI context file (claude.md, .cursorrules, etc.).
 * Trims excess lines and appends a pointer to .utoe/logs/ if needed.
 */
export function enforceClaudeMdLimit(projectRoot: string = process.cwd()): void {
  const { contextFile } = detectAITool(projectRoot);
  const contextFilePath = path.join(projectRoot, contextFile);
  if (!fs.existsSync(contextFilePath)) return;
  try {
    const lines = fs.readFileSync(contextFilePath, 'utf8').split('\n');
    if (lines.length <= 60) return;
    const trimmed = lines.slice(0, 57);
    trimmed.push('');
    trimmed.push('> See .utoe/logs/ for full details (auto-managed by UTOE)');
    fs.writeFileSync(contextFilePath, trimmed.join('\n'));
  } catch { /* ignore */ }
}

/**
 * Load only relevant files from .utoe/logs/ based on keyword overlap with a query.
 * Used as a RAG-lite fallback when LanceDB is not available.
 */
export function loadRelevantSupportFiles(
  query: string,
  projectRoot: string = process.cwd(),
  topK = 3
): Array<{ file: string; content: string; score: number }> {
  const logsDir = path.join(projectRoot, '.utoe', 'logs');
  if (!fs.existsSync(logsDir)) return [];

  const queryWords = new Set((query.toLowerCase().match(/\b\w{3,}\b/g) ?? []));
  const results: Array<{ file: string; content: string; score: number }> = [];

  for (const fname of fs.readdirSync(logsDir)) {
    if (!fname.endsWith('.md')) continue;
    const fpath = path.join(logsDir, fname);
    try {
      const content = fs.readFileSync(fpath, 'utf8');
      if (content.trim().split('\n').length < 3) continue;
      const words = new Set((content.toLowerCase().match(/\b\w{3,}\b/g) ?? []));
      const intersection = [...queryWords].filter(w => words.has(w)).length;
      const score = intersection / Math.max(queryWords.size, 1);
      if (score > 0.05) results.push({ file: fname, content: content.slice(0, 800), score });
    } catch { /* ignore */ }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ─── Auto-start daemon ────────────────────────────────────────────────────────

/**
 * Start the UTOE proxy as a detached background daemon.
 * Uses a TCP probe to skip startup if already running.
 * Never throws — failure is swallowed so npm install always succeeds.
 */
export async function autoStartDaemon(port = 8787): Promise<boolean> {
  // TCP probe: is the port already in use?
  try {
    const net = await import('node:net');
    const isUp = await new Promise<boolean>((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(800);
      sock.connect(port, '127.0.0.1', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    if (isUp) return true;
  } catch { /* probe failed */ }

  // Spawn detached daemon
  try {
    const utoeBin = path.join(UTOE_DIR, 'bin', 'utoe.js');
    if (!fs.existsSync(utoeBin)) return false;

    const child = spawn(process.execPath, [utoeBin, 'start'], {
      detached: true,
      stdio:    'ignore',
      env:      { ...process.env, UTOE_PORT: String(port) },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ─── Shell profile patcher ────────────────────────────────────────────────────

/**
 * Append ANTHROPIC_BASE_URL + OPENAI_BASE_URL to the user's shell profile
 * (~/.zshrc, ~/.bashrc, or ~/.profile) if the line is not already present.
 * Idempotent and non-destructive — never overwrites existing values.
 */
export function patchShellProfile(port = 8787): { file: string | null; added: boolean } {
  const home  = os.homedir();
  const shell = process.env['SHELL'] ?? '';

  const candidates: string[] = [];
  if (/zsh/.test(shell))  candidates.push(path.join(home, '.zshrc'));
  if (/bash/.test(shell)) candidates.push(path.join(home, '.bashrc'), path.join(home, '.bash_profile'));
  candidates.push(
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
  );

  // Deduplicate
  const seen  = new Set<string>();
  const profiles = candidates.filter(p => { if (seen.has(p)) return false; seen.add(p); return true; });

  const marker = 'ANTHROPIC_BASE_URL';
  const block  = [
    '',
    '# ── UTOE: route Claude CLI through token-optimizer proxy ────────────────────',
    '# Added automatically by utoe-plugin. Remove this block to disable.',
    `export ANTHROPIC_BASE_URL=http://localhost:${port}`,
    `export OPENAI_BASE_URL=http://localhost:${port}/v1`,
    '# ─────────────────────────────────────────────────────────────────────────────',
    '',
  ].join('\n');

  for (const profile of profiles) {
    if (!fs.existsSync(profile)) continue;
    try {
      const content = fs.readFileSync(profile, 'utf8');
      if (content.includes(marker)) return { file: profile, added: false };
      fs.appendFileSync(profile, block);
      return { file: profile, added: true };
    } catch {
      continue;
    }
  }

  return { file: null, added: false };
}
