/**
 * UTOE Installer — production-oriented project bootstrap.
 * Run: npx utoe init [--production]
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UTOE_DIR = path.join(__dirname, '..');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function ok(msg) { log(`${GREEN}✓${RESET}`, msg); }
function info(msg) { log(`${CYAN}→${RESET}`, msg); }
function warn(msg) { log(`${YELLOW}!${RESET}`, msg); }

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backup = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backup);
  return backup;
}

function hasNode18Plus() {
  const [major] = process.versions.node.split('.').map((x) => parseInt(x, 10));
  return major >= 18;
}

// Resolve the utoe binary path relative to the target project's node_modules.
// Using `npx utoe` is the most portable form — works regardless of global vs local install.
function getUtoeCliCmd(targetDir, subcommand) {
  // Check if utoe is available as a local binary in the target project
  const localBin = path.join(targetDir, 'node_modules', '.bin', 'utoe');
  const localBinWin = path.join(targetDir, 'node_modules', '.bin', 'utoe.cmd');
  const hasLocalBin = fs.existsSync(localBin) || fs.existsSync(localBinWin);
  if (hasLocalBin) {
    // Prefer the resolved absolute path so the script is OS-portable and
    // does not rely on PATH being set correctly inside hook environments.
    const pkgBin = path.join(targetDir, 'node_modules', 'utoe-plugin', 'bin', 'utoe.js');
    if (fs.existsSync(pkgBin)) {
      return `node "${pkgBin}" ${subcommand}`;
    }
  }
  // Fall back to npx (works for global installs and CI)
  return `npx utoe ${subcommand}`;
}

// ─── Project file bootstrapper ────────────────────────────────────────────────

const CLAUDE_MD_TEMPLATE = `# Project Context

## Overview
<!-- 1-2 sentences: what this project does -->

## Stack
<!-- e.g. Node 20, TypeScript, Hono, LanceDB -->

## Key Conventions
- Follow existing patterns before adding new ones
- All heavy content lives in .utoe/logs/ — not here

## UTOE Notes
- Support files: .utoe/logs/{tech_debt,bug_list,architecture_decisions,security_checklist,temp_decisions,progress}.md
- Skills: .utoe/skills/*.md (loaded on-demand via semantic filter)
- Memory: .utoe_memory.json (auto-managed, PII-redacted)

## Active Decisions
<!-- Short list of current design choices (max 5 bullets) -->

## Out of Scope
<!-- What NOT to implement or change -->
`.trim();

const SUPPORT_FILES = [
  {
    path: '.utoe/logs/tech_debt.md',
    content: `# Tech Debt

> Auto-populated by UTOE post-prompt hooks when Claude mentions TODO / FIXME / tech debt.
> Add entries manually using the format below.

## Format
\`\`\`
## YYYY-MM-DD HH:MM
**Area:** <module or file>
**Issue:** <what the problem is>
**Impact:** low | medium | high
**Effort:** <estimated fix effort>
\`\`\`

---
`,
  },
  {
    path: '.utoe/logs/bug_list.md',
    content: `# Bug List

> Auto-populated by UTOE when Claude mentions bug / fix / error / regression.
> Resolved bugs should be marked ✓ and kept for reference.

## Format
\`\`\`
## YYYY-MM-DD HH:MM
**Status:** open | in-progress | resolved ✓
**Severity:** critical | high | medium | low
**Description:** <what happens>
**Steps:** <how to reproduce>
**Fix:** <what was done or planned>
\`\`\`

---
`,
  },
  {
    path: '.utoe/logs/architecture_decisions.md',
    content: `# Architecture Decisions

> Auto-populated by UTOE when Claude mentions architecture / design decision / ADR.
> Follows lightweight ADR (Architecture Decision Record) format.

## Format
\`\`\`
## ADR-NNN — YYYY-MM-DD
**Decision:** <what was decided>
**Status:** proposed | accepted | deprecated | superseded
**Context:** <why this decision was needed>
**Consequences:** <trade-offs and implications>
\`\`\`

---
`,
  },
  {
    path: '.utoe/logs/security_checklist.md',
    content: `# Security Checklist

> Auto-populated by UTOE when Claude mentions security / vulnerability / auth / XSS / injection.
> Review this file before every release.

## Checklist Template
- [ ] Input validation on all user-controlled data
- [ ] No secrets committed to git (.env.utoe is gitignored ✓)
- [ ] Authentication tokens not logged
- [ ] SQL / NoSQL injection prevention verified
- [ ] XSS prevention: output escaping in place
- [ ] Dependencies audited: \`npm audit\`
- [ ] Rate limiting on public endpoints
- [ ] CORS policy reviewed

## Security Notes
> UTOE appends notes here automatically when Claude identifies security concerns.

---
`,
  },
  {
    path: '.utoe/logs/temp_decisions.md',
    content: `# Temporary Decisions

> Auto-populated by UTOE when Claude mentions temporary / workaround / interim solution.
> Every entry here should have a revisit date — these are NOT permanent.

## Format
\`\`\`
## YYYY-MM-DD HH:MM
**Decision:** <what was done temporarily>
**Reason:** <why a proper fix wasn't done now>
**Revisit by:** YYYY-MM-DD
**Ticket / issue:** <link if available>
\`\`\`

---
`,
  },
  {
    path: '.utoe/logs/progress.md',
    content: `# Progress Log

> Auto-populated by UTOE when Claude mentions completed / implemented / finished / done.
> Provides a running log of what has been built — useful for handoffs and reviews.

## Format
\`\`\`
## YYYY-MM-DD HH:MM
**Completed:** <what was done>
**Files changed:** <list>
**Next:** <what comes next>
\`\`\`

---
`,
  },
  {
    path: '.utoe/logs/errors.md',
    content: `# Error Log

> Populated when errors occur during UTOE processing or when Claude surfaces runtime errors.
> Use this to spot recurring failure patterns.

## Format
\`\`\`
## YYYY-MM-DD HH:MM
**Error:** <error message>
**Context:** <what was being done>
**Resolution:** <how it was fixed or who to ask>
\`\`\`

---
`,
  },
  { path: '.utoe/skills/.gitkeep', content: '' },
  {
    path: '.utoe/schema.json',
    content: JSON.stringify({
      version: '1.0.0',
      generated: new Date().toISOString(),
      description: 'UTOE project schema — auto-updated when utoe train-personal is run',
      files: [],
      entryPoints: [],
      mainLanguage: 'unknown',
      testFramework: 'unknown',
    }, null, 2),
  },
];

function bootstrapProjectFiles(projectRoot = process.cwd()) {
  const created = [];
  const skipped = [];

  // claude.md — never overwrite or truncate existing user content.
  // If missing: create minimal template.
  // If exists but large (>60 lines): back up, then append a one-line pointer
  //   to .utoe/logs/ rather than destroying the user's content.
  const claudeMdPath = path.join(projectRoot, 'claude.md');
  if (!fs.existsSync(claudeMdPath)) {
    try { fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE); created.push('claude.md'); } catch { /* ignore */ }
  } else {
    try {
      const existing = fs.readFileSync(claudeMdPath, 'utf8');
      const lines = existing.split('\n');
      const pointer = '<!-- UTOE: extended context auto-managed in .utoe/logs/ -->';
      if (lines.length > 60 && !existing.includes(pointer)) {
        // Back up first — never destroy user content without a safety copy
        backupIfExists(claudeMdPath);
        fs.appendFileSync(claudeMdPath, '\n' + pointer + '\n');
        created.push('claude.md (pointer appended, original preserved)');
      } else {
        skipped.push('claude.md');
      }
    } catch { skipped.push('claude.md'); }
  }

  for (const { path: relPath, content } of SUPPORT_FILES) {
    const absPath = path.join(projectRoot, relPath);
    const dir = path.dirname(absPath);
    ensureDir(dir);
    if (!fs.existsSync(absPath)) {
      try { fs.writeFileSync(absPath, content); created.push(relPath); } catch { /* ignore */ }
    } else {
      skipped.push(relPath);
    }
  }

  return { created, skipped };
}

function upsertGitignore(targetDir, entries) {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missing = entries.filter((line) => !existing.includes(line));
  if (!missing.length) return false;
  const block = `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}# UTOE\n${missing.join('\n')}\n`;
  fs.writeFileSync(gitignorePath, existing + block);
  return true;
}

function createEnvTemplate(targetDir) {
  const envPath = path.join(targetDir, '.env.utoe');
  if (fs.existsSync(envPath)) return false;
  fs.writeFileSync(envPath, [
    '# UTOE production environment',
    '',
    '# ── Core providers (add at least one) ──────────────────────────────────────',
    'OPENAI_API_KEY=',
    'ANTHROPIC_API_KEY=',
    'GROQ_API_KEY=',
    'GEMINI_API_KEY=',
    '',
    '# ── Additional providers (optional) ────────────────────────────────────────',
    'DEEPSEEK_API_KEY=',
    'MISTRAL_API_KEY=',
    'TOGETHER_API_KEY=',
    'OPENROUTER_API_KEY=',
    'FIREWORKS_API_KEY=',
    'PERPLEXITY_API_KEY=',
    'COHERE_API_KEY=',
    'MOONSHOT_API_KEY=',
    'QWEN_API_KEY=',
    'YI_API_KEY=',
    '',
    '# ── AWS Bedrock (Claude / Titan on AWS) ─────────────────────────────────────',
    'AWS_ACCESS_KEY_ID=',
    'AWS_SECRET_ACCESS_KEY=',
    'AWS_REGION=us-east-1',
    '',
    '# ── Google Vertex AI ────────────────────────────────────────────────────────',
    'VERTEX_API_KEY=',
    '# VERTEX_PROJECT=my-gcp-project',
    '# VERTEX_REGION=us-central1',
    '',
    '# ── Azure OpenAI ────────────────────────────────────────────────────────────',
    'AZURE_OPENAI_API_KEY=',
    'AZURE_OPENAI_ENDPOINT=',
    '',
    '# ── Cloudflare AI ───────────────────────────────────────────────────────────',
    'CLOUDFLARE_API_KEY=',
    'CLOUDFLARE_ACCOUNT_ID=',
    '',
    '# ── Ollama (local, always available) ────────────────────────────────────────',
    'OLLAMA_URL=http://localhost:11434',
    '',
    '# ── Runtime settings ────────────────────────────────────────────────────────',
    'UTOE_PORT=8787',
    'UTOE_MAX_TOKENS=16000',
    'UTOE_HISTORY_WINDOW=6',
    'UTOE_OUTPUT_LIMIT=1024',
    'UTOE_MODE=bridge',
    '',
    '# ── Security: proxy bearer token (leave blank for localhost-only setups) ────',
    '# UTOE_PROXY_TOKEN=change-me-in-production',
    '',
    '# ── Rate limiting (requests per minute per IP, default 120) ─────────────────',
    '# UTOE_RATE_LIMIT=120',
    '',
    '# ── Optional telemetry output file ──────────────────────────────────────────',
    '# UTOE_TELEMETRY_FILE=.utoe_telemetry.jsonl',
  ].join('\n') + '\n');
  return true;
}

function ensureClaudeHook(targetDir) {
  const claudeDir = path.join(targetDir, '.claude');
  ensureDir(claudeDir);
  ensureDir(path.join(claudeDir, 'hooks'));

  const settingsPath = path.join(claudeDir, 'settings.json');
  backupIfExists(settingsPath);

  const settings = readJsonSafe(settingsPath, {});
  settings.hooks = settings.hooks || {};
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];

  const hookCmd = getUtoeCliCmd(targetDir, 'hook');
  const exists = settings.hooks.UserPromptSubmit
    .flatMap((h) => h.hooks || [])
    .some((h) => String(h.command || '').includes('utoe') && String(h.command || '').includes('hook'));

  if (!exists) {
    settings.hooks.UserPromptSubmit.push({
      matcher: '',
      hooks: [{ type: 'command', command: hookCmd }],
    });
    writeJson(settingsPath, settings);
    return true;
  }

  return false;
}

function ensurePackageScript(targetDir) {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { changed: false, exists: false };

  backupIfExists(pkgPath);
  const pkg = readJsonSafe(pkgPath, null);
  if (!pkg) return { changed: false, exists: true };

  pkg.scripts = pkg.scripts || {};
  let changed = false;

  if (!pkg.scripts.utoe) {
    pkg.scripts.utoe = getUtoeCliCmd(targetDir, 'start');
    changed = true;
  }

  if (!pkg.scripts['utoe:verify']) {
    pkg.scripts['utoe:verify'] = getUtoeCliCmd(targetDir, 'verify');
    changed = true;
  }

  if (changed) writeJson(pkgPath, pkg);
  return { changed, exists: true };
}

function writeInstallReport(targetDir, report) {
  const stateDir = path.join(targetDir, '.utoe');
  ensureDir(stateDir);
  writeJson(path.join(stateDir, 'install-report.json'), report);
}

export function verifyInstallation(targetDir = process.cwd()) {
  const checks = [];

  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = readJsonSafe(pkgPath, null);
  checks.push({
    id: 'package_script',
    ok: Boolean(pkg?.scripts?.utoe),
    detail: pkg?.scripts?.utoe || 'missing script: utoe',
  });

  const settingsPath = path.join(targetDir, '.claude', 'settings.json');
  const settings = readJsonSafe(settingsPath, {});
  const hasHook = (settings?.hooks?.UserPromptSubmit || [])
    .flatMap((h) => h.hooks || [])
    .some((h) => {
      const cmd = String(h.command || '');
      // Match both quoted ("utoe.js" hook) and unquoted (utoe.js hook) paths
      return cmd.includes('utoe.js') && cmd.includes('hook');
    });
  checks.push({
    id: 'claude_hook',
    ok: hasHook,
    detail: hasHook ? 'hook configured' : 'hook missing',
  });

  const envPath = path.join(targetDir, '.env.utoe');
  checks.push({
    id: 'env_template',
    ok: fs.existsSync(envPath),
    detail: fs.existsSync(envPath) ? '.env.utoe present' : '.env.utoe missing',
  });

  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  checks.push({
    id: 'execution_mode',
    ok: envContent.includes('UTOE_MODE=bridge') || envContent.includes('UTOE_MODE=proxy'),
    detail: envContent.includes('UTOE_MODE=bridge')
      ? 'UTOE_MODE=bridge'
      : envContent.includes('UTOE_MODE=proxy')
        ? 'UTOE_MODE=proxy'
        : 'UTOE_MODE missing in .env.utoe',
  });

  const policyPath = path.join(UTOE_DIR, 'policy', 'default.policy.json');
  checks.push({
    id: 'policy_file',
    ok: fs.existsSync(policyPath),
    detail: fs.existsSync(policyPath) ? 'policy present' : 'policy missing',
  });

  const guardPath = path.join(UTOE_DIR, 'lib', 'token-guard.js');
  checks.push({
    id: 'token_guard',
    ok: fs.existsSync(guardPath),
    detail: fs.existsSync(guardPath) ? 'token guard present' : 'token guard missing',
  });

  const telemetryPath = path.join(UTOE_DIR, 'lib', 'telemetry.js');
  checks.push({
    id: 'telemetry_store',
    ok: fs.existsSync(telemetryPath),
    detail: fs.existsSync(telemetryPath) ? 'telemetry store present' : 'telemetry store missing',
  });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    checked_at: new Date().toISOString(),
  };
}

// ─── Auto-start daemon (detached, non-blocking) ───────────────────────────────

/**
 * Start the UTOE proxy as a background daemon.
 * Detached + stdio:ignore so it survives after the parent process exits.
 * Never throws — failure is logged and silently swallowed so npm install
 * always succeeds.
 *
 * @returns {boolean} true if the daemon was launched (or was already running)
 */
export async function autoStartDaemon(port = 8787) {
  try {
    // Check if already running via a quick sync TCP probe (no curl dependency)
    const net = await import('node:net').catch(() => null);
    if (net) {
      const isUp = await new Promise((resolve) => {
        const sock = new net.default.Socket();
        sock.setTimeout(800);
        sock.connect(port, '127.0.0.1', () => { sock.destroy(); resolve(true); });
        sock.on('error', () => resolve(false));
        sock.on('timeout', () => { sock.destroy(); resolve(false); });
      });
      if (isUp) return true; // already running
    }
  } catch { /* probe failed — try to start anyway */ }

  try {
    const utoeBin = path.join(UTOE_DIR, 'bin', 'utoe.js');
    if (!fs.existsSync(utoeBin)) return false;

    const child = spawn(process.execPath, [utoeBin, 'start'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, UTOE_PORT: String(port) },
    });
    child.unref(); // let npm install finish without waiting

    // Save PID so the hook watchdog can monitor this process
    try {
      const stateDir = path.join(os.homedir(), '.utoe');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, 'proxy.pid'), String(child.pid));
    } catch { /* ignore */ }

    return true;
  } catch {
    return false;
  }
}

// ─── Shell profile patcher ────────────────────────────────────────────────────

/**
 * Append `export ANTHROPIC_BASE_URL=http://localhost:<port>` to the user's
 * shell profile (~/.zshrc, ~/.bashrc, or ~/.profile) if not already present.
 *
 * Rules:
 *  - Only writes if the line is not already there (idempotent)
 *  - Adds a comment block so the user knows what added it and can remove it
 *  - Never overwrites existing ANTHROPIC_BASE_URL values set by the user
 *  - Skips silently if the profile file cannot be written
 *
 * @returns {{ file: string|null, added: boolean }}
 */
export function patchShellProfile(port = 8787) {
  const home = os.homedir();
  const shell = process.env.SHELL ?? '';

  // Priority order: detect active shell first, then fall back
  const candidates = [];
  if (/zsh/.test(shell))  candidates.push(path.join(home, '.zshrc'));
  if (/bash/.test(shell)) candidates.push(path.join(home, '.bashrc'), path.join(home, '.bash_profile'));
  // Always include these as fallbacks
  candidates.push(
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
  );

  // Deduplicate
  const seen = new Set();
  const profiles = candidates.filter(p => { if (seen.has(p)) return false; seen.add(p); return true; });

  const marker    = 'ANTHROPIC_BASE_URL';
  const exportLine = `export ANTHROPIC_BASE_URL=http://localhost:${port}`;
  const block = [
    '',
    '# ── UTOE: route Claude CLI through token-optimizer proxy ────────────────────',
    `# Added automatically by utoe-plugin. Remove this block to disable.`,
    exportLine,
    `export OPENAI_BASE_URL=http://localhost:${port}/v1`,
    '# ─────────────────────────────────────────────────────────────────────────────',
    '',
  ].join('\n');

  for (const profile of profiles) {
    // Only modify files that exist (don't create new shell profiles)
    if (!fs.existsSync(profile)) continue;
    try {
      const content = fs.readFileSync(profile, 'utf8');
      // Already has an ANTHROPIC_BASE_URL line — don't touch it
      if (content.includes(marker)) return { file: profile, added: false };
      fs.appendFileSync(profile, block);
      return { file: profile, added: true };
    } catch {
      continue; // try next profile
    }
  }

  return { file: null, added: false };
}

export async function install(targetDir = process.cwd(), options = {}) {
  const production = options.production !== false;

  console.log(`\n${BOLD}${CYAN}UTOE Production Installer${RESET}\n`);
  info(`Installing into: ${targetDir}`);

  if (!hasNode18Plus()) {
    throw new Error(`Node.js >= 18 required. Current: ${process.versions.node}`);
  }

  const installResult = {
    production,
    targetDir,
    platform: `${os.platform()}-${os.arch()}`,
    node: process.versions.node,
    started_at: new Date().toISOString(),
    changed: {},
  };

  const pkg = ensurePackageScript(targetDir);
  installResult.changed.package_json = pkg.changed;
  if (pkg.exists) {
    if (pkg.changed) ok('Updated package.json scripts (utoe, utoe:verify)');
    else warn('package.json scripts already configured');
  } else {
    warn('No package.json found; skipped script injection');
  }

  const hookChanged = ensureClaudeHook(targetDir);
  installResult.changed.claude_hook = hookChanged;
  if (hookChanged) ok('Registered Claude hook (.claude/settings.json)');
  else warn('Claude hook already configured');

  const envCreated = createEnvTemplate(targetDir);
  installResult.changed.env_template = envCreated;
  const envPath = path.join(targetDir, '.env.utoe');
  let envModePatched = false;

  if (envCreated) {
    ok('Created .env.utoe template');
  } else {
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent && !envContent.includes('UTOE_MODE=')) {
      const suffix = envContent.endsWith('\n') ? '' : '\n';
      fs.writeFileSync(envPath, envContent + suffix + 'UTOE_MODE=bridge\n');
      envModePatched = true;
      ok('Patched .env.utoe with default UTOE_MODE=bridge');
    } else {
      warn('.env.utoe already exists');
    }
  }
  installResult.changed.env_mode_patched = envModePatched;

  const ignoreChanged = upsertGitignore(targetDir, [
    '.env.utoe',
    '.utoe_memory.json',
    '.utoe_telemetry.jsonl',
    '.claude/utoe_savings.log',
    '.utoe/install-report.json',
  ]);
  installResult.changed.gitignore = ignoreChanged;
  if (ignoreChanged) ok('Updated .gitignore with UTOE artifacts');

  // Bootstrap claude.md (<60 lines) + all support files
  const bootstrap = bootstrapProjectFiles(targetDir);
  installResult.changed.bootstrap = bootstrap;
  if (bootstrap.created.length > 0) {
    ok(`Created project files: ${bootstrap.created.join(', ')}`);
  } else {
    warn('Project files already exist (skipped)');
  }

  const verify = verifyInstallation(targetDir);
  installResult.verify = verify;
  installResult.completed_at = new Date().toISOString();

  writeInstallReport(targetDir, installResult);

  if (verify.ok) {
    ok('Installation verification passed');
  } else {
    warn('Installation completed with verification warnings (run: npx utoe verify)');
  }

  // ── Auto-start the proxy daemon ─────────────────────────────────────────────
  const port = 8787;
  const daemonStarted = await autoStartDaemon(port);
  if (daemonStarted) {
    ok(`Proxy daemon started on http://localhost:${port}`);
  } else {
    warn(`Could not auto-start proxy (run manually: npx utoe start)`);
  }

  // ── Patch shell profile with ANTHROPIC_BASE_URL ─────────────────────────────
  const shellPatch = patchShellProfile(port);
  if (shellPatch.added) {
    ok(`Patched ${shellPatch.file} — ANTHROPIC_BASE_URL set to http://localhost:${port}`);
  } else if (shellPatch.file && !shellPatch.added) {
    warn(`${shellPatch.file} already has ANTHROPIC_BASE_URL — skipped`);
  } else {
    warn(`Shell profile not found — set manually: export ANTHROPIC_BASE_URL=http://localhost:${port}`);
  }

  writeInstallReport(targetDir, installResult);

  console.log(`\n${BOLD}${GREEN}╔═══════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${GREEN}║  ✓ UTOE fully installed — zero more steps needed      ║${RESET}`);
  console.log(`${BOLD}${GREEN}╚═══════════════════════════════════════════════════════╝${RESET}`);
  console.log(``);
  console.log(`  ${BOLD}What was set up automatically:${RESET}`);
  console.log(`    ${GREEN}✓${RESET}  claude.md + .utoe/logs/ support files`);
  console.log(`    ${GREEN}✓${RESET}  Claude hook (.claude/settings.json) — compresses every prompt`);
  console.log(`    ${GREEN}✓${RESET}  .env.utoe with UTOE_PORT=8787`);
  console.log(`    ${daemonStarted ? `${GREEN}✓` : `${YELLOW}!`}${RESET}  Proxy daemon on http://localhost:${port}`);
  console.log(`    ${shellPatch.added ? `${GREEN}✓` : `${YELLOW}!`}${RESET}  ANTHROPIC_BASE_URL in shell profile${shellPatch.added ? ` (${path.basename(shellPatch.file ?? '')})` : ' — set manually'}`);
  console.log(``);
  console.log(`  ${BOLD}To activate in this terminal session:${RESET}`);
  console.log(`    ${CYAN}source ~/.zshrc${RESET}   ${YELLOW}# or ~/.bashrc — then use 'claude' as normal${RESET}`);
  console.log(``);
  console.log(`  ${BOLD}Dashboard:${RESET}  ${CYAN}http://localhost:${port}/${RESET}`);
  console.log(`  ${BOLD}API key:${RESET}    fill ${YELLOW}.env.utoe${RESET} if not already set`);
  console.log(``);
}
