#!/usr/bin/env node
/**
 * UTOE CLI — Universal Token Optimization Engine
 *
 * Commands:
 *   utoe start                  Start the proxy server (default port 8787)
 *   utoe stop                   Stop the running proxy server
 *   utoe init                   Install UTOE into current project
 *   utoe verify                 Verify installation
 *   utoe hook                   Process a Claude Code prompt (called by hook)
 *   utoe ask <msg>              One-shot ask through the pipeline
 *   utoe stats                  Show token savings stats
 *   utoe dashboard              Open live savings dashboard in browser
 *   utoe suggest-prompt <msg>   Get optimized prompt suggestion
 *   utoe compress <text>        Compress text and show savings
 *   utoe train-personal         Index project for RAG + optional LoRA hint
 *   utoe forget [query]         Clear memory
 *   utoe providers              List available providers
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VERSION = '1.3.0';

// ─── Config loader ────────────────────────────────────────────────────────────

function loadConfig(dir = process.cwd()) {
  const envFiles = [
    path.join(dir, '.env.utoe'),
    path.join(dir, '.env'),
    path.join(ROOT, '.env.utoe'),
    path.join(ROOT, '.env'),
  ];
  const config = {};
  for (const f of envFiles) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      } else {
        const ci = val.indexOf(' #');
        if (ci !== -1) val = val.slice(0, ci).trim();
      }
      if (key && val) config[key] = val;
    }
  }
  const keys = [
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY',
    'MISTRAL_API_KEY', 'COHERE_API_KEY', 'TOGETHER_API_KEY',
    'UTOE_PORT', 'UTOE_MAX_TOKENS', 'UTOE_HISTORY_WINDOW', 'UTOE_OUTPUT_LIMIT',
    'OLLAMA_URL', 'UTOE_MODE', 'UTOE_GPU',
  ];
  for (const k of keys) if (process.env[k]) config[k] = process.env[k];
  return config;
}

function normalizeConfig(raw) {
  return {
    OPENAI_API_KEY: raw.OPENAI_API_KEY || '',
    ANTHROPIC_API_KEY: raw.ANTHROPIC_API_KEY || '',
    GROQ_API_KEY: raw.GROQ_API_KEY || '',
    GEMINI_API_KEY: raw.GEMINI_API_KEY || '',
    MISTRAL_API_KEY: raw.MISTRAL_API_KEY || '',
    COHERE_API_KEY: raw.COHERE_API_KEY || '',
    TOGETHER_API_KEY: raw.TOGETHER_API_KEY || '',
    OLLAMA_URL: raw.OLLAMA_URL || 'http://localhost:11434',
    port: parseInt(raw.UTOE_PORT || '8787'),
    maxTokens: parseInt(raw.UTOE_MAX_TOKENS || '16000'),
    historyWindow: parseInt(raw.UTOE_HISTORY_WINDOW || '6'),
    outputTokenLimit: parseInt(raw.UTOE_OUTPUT_LIMIT || '1024'),
    relevanceThreshold: 0.12,
    maxHistoryTokens: 2000,
    UTOE_MODE: String(raw.UTOE_MODE || 'bridge').toLowerCase() === 'proxy' ? 'proxy' : 'bridge',
    UTOE_GPU: raw.UTOE_GPU || process.env.CUDA_VISIBLE_DEVICES || '',
  };
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
};

// ─── Commands ─────────────────────────────────────────────────────────────────

async function checkFirstRunReadiness(config) {
  const hasAnyCloudKey = !!(
    config.OPENAI_API_KEY || config.ANTHROPIC_API_KEY || config.GROQ_API_KEY ||
    config.GEMINI_API_KEY || config.DEEPSEEK_API_KEY || config.MISTRAL_API_KEY ||
    config.TOGETHER_API_KEY || config.OPENROUTER_API_KEY || config.FIREWORKS_API_KEY ||
    config.PERPLEXITY_API_KEY || config.COHERE_API_KEY || config.MOONSHOT_API_KEY ||
    config.QWEN_API_KEY || config.YI_API_KEY ||
    (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY) ||
    (config.VERTEX_API_KEY || config.GOOGLE_API_KEY) ||
    (config.AZURE_OPENAI_API_KEY && config.AZURE_OPENAI_ENDPOINT) ||
    (config.CLOUDFLARE_API_KEY && config.CLOUDFLARE_ACCOUNT_ID)
  );

  // Check Ollama availability
  let ollamaUp = false;
  try {
    const r = await fetch(`${config.OLLAMA_URL || 'http://localhost:11434'}/api/tags`,
      { signal: AbortSignal.timeout(1500) });
    ollamaUp = r.ok;
  } catch { /* not running */ }

  if (!hasAnyCloudKey && !ollamaUp) {
    console.log(`
${C.yellow}⚠  No AI provider configured.${C.reset}

UTOE needs at least one of:

  ${C.bold}Option A — Free local AI (recommended to start):${C.reset}
    1. Install Ollama:  ${C.cyan}https://ollama.ai/download${C.reset}
    2. Pull a model:   ${C.cyan}ollama pull llama3.2${C.reset}
    3. Run again:      ${C.cyan}npx utoe start${C.reset}

  ${C.bold}Option B — Cloud API key:${C.reset}
    Add to ${C.yellow}.env.utoe${C.reset} (run ${C.cyan}npx utoe init${C.reset} to create it):
      GROQ_API_KEY=...        ${C.dim}(free tier, fast)${C.reset}
      OPENAI_API_KEY=...
      ANTHROPIC_API_KEY=...

  ${C.bold}Option C — Both:${C.reset}
    UTOE uses Ollama when free capacity is available,
    falls back to cloud automatically.

${C.dim}UTOE is starting anyway. Requests will fail until a provider is configured.${C.reset}
`);
  } else if (!hasAnyCloudKey && ollamaUp) {
    console.log(`${C.dim}ℹ  Ollama detected. Cloud API keys optional (add to .env.utoe for fallback).${C.reset}`);
  } else if (hasAnyCloudKey && !ollamaUp) {
    console.log(`${C.dim}ℹ  Cloud keys found. Install Ollama for free local fallback: https://ollama.ai/download${C.reset}`);
  }
}

async function cmdStart(config) {
  await checkFirstRunReadiness(config);

  const { createServer } = await import('../lib/server.js');
  const server = await createServer(config);

  // Save PID so the hook watchdog can find and health-check this process
  savePid(process.pid);

  server.listen(config.port, () => {
    console.clear();
    const providers = [
      config.OPENAI_API_KEY ? `${C.green}✓${C.reset} OpenAI` : `${C.dim}✗ OpenAI${C.reset}`,
      config.ANTHROPIC_API_KEY ? `${C.green}✓${C.reset} Anthropic` : `${C.dim}✗ Anthropic${C.reset}`,
      config.GROQ_API_KEY ? `${C.green}✓${C.reset} Groq` : `${C.dim}✗ Groq${C.reset}`,
      config.GEMINI_API_KEY ? `${C.green}✓${C.reset} Gemini` : `${C.dim}✗ Gemini${C.reset}`,
      `${C.green}✓${C.reset} Ollama (${config.OLLAMA_URL})`,
    ].join('\n  ');

    const modeBadge = config.UTOE_MODE === 'proxy'
      ? `${C.green}PROXY${C.reset} (calls real LLMs)`
      : `${C.yellow}BRIDGE${C.reset} (optimizes prompts, passes to original AI)`;

    console.log(`
${C.bold}${C.cyan}╔═══════════════════════════════════════════════════╗
║  ⚡ UTOE — Universal Token Optimization Engine    ║
║  v${VERSION}  •  Saving your tokens, automatically      ║
╚═══════════════════════════════════════════════════╝${C.reset}

${C.green}✓${C.reset} Server running on ${C.cyan}http://localhost:${config.port}${C.reset}
${C.green}✓${C.reset} Dashboard:       ${C.cyan}http://localhost:${config.port}/${C.reset}
${C.green}✓${C.reset} OpenAI proxy:    ${C.cyan}http://localhost:${config.port}/v1${C.reset}

${C.bold}Mode:${C.reset} ${modeBadge}

${C.bold}Providers:${C.reset}
  ${providers}

${C.bold}Quick start for any tool:${C.reset}
  ${C.dim}export OPENAI_BASE_URL=http://localhost:${config.port}/v1${C.reset}

${C.bold}Pipeline:${C.reset} Input → Clean → Compress → Memory → Route → LLM → Learn
${C.dim}Press Ctrl+C to stop  •  Dashboard auto-refreshes every 5s${C.reset}
`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`${C.red}Port ${config.port} already in use.${C.reset} Try: UTOE_PORT=8788 npx utoe start`);
      process.exit(1);
    }
    throw err;
  });

  // Clean shutdown — remove PID file so watchdog doesn't try to restart intentional stops
  const shutdown = (signal) => {
    clearPid();
    console.log(`\n${C.dim}UTOE stopped (${signal}). Your tokens are safe.${C.reset}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500); // force-exit if server.close hangs
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── PID file helpers ─────────────────────────────────────────────────────────
// Store the proxy PID in a well-known location so the hook watchdog can find it.

import { homedir } from 'os';

const UTOE_STATE_DIR = path.join(homedir(), '.utoe');
const PID_FILE       = path.join(UTOE_STATE_DIR, 'proxy.pid');
const PROXY_PORT     = parseInt(process.env.UTOE_PORT || '8787', 10);

function readSavedPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10); } catch { return null; }
}

function savePid(pid) {
  try { fs.mkdirSync(UTOE_STATE_DIR, { recursive: true }); fs.writeFileSync(PID_FILE, String(pid)); } catch { /* ignore */ }
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function isPidAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function isProxyReachable(port) {
  const net = await import('node:net').catch(() => null);
  if (!net) return false;
  return new Promise((resolve) => {
    const sock = new net.default.Socket();
    sock.setTimeout(600);
    sock.connect(port, '127.0.0.1', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

async function ensureProxyRunning() {
  // Fast path: PID alive + port responsive
  const savedPid = readSavedPid();
  if (isPidAlive(savedPid) && await isProxyReachable(PROXY_PORT)) return;

  // PID dead or port not responding — restart
  clearPid();
  const utoeBin = path.join(ROOT, 'bin', 'utoe.js');
  if (!fs.existsSync(utoeBin)) return;

  try {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [utoeBin, 'start'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, UTOE_PORT: String(PROXY_PORT) },
    });
    child.unref();
    savePid(child.pid);
    process.stderr.write(`[UTOE] Proxy restarted (PID ${child.pid}) on port ${PROXY_PORT}\n`);
  } catch { /* silently skip */ }
}

// ─── Hook command ─────────────────────────────────────────────────────────────

async function cmdHook(args = []) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  let hookData;
  try { hookData = JSON.parse(raw); } catch { process.exit(0); }

  // Watchdog: ensure proxy is running before every prompt.
  // Handles: crashed proxy, killed PID, system restart, Ctrl+C on start-utoe.sh.
  // Runs in background — never blocks the prompt.
  ensureProxyRunning().catch(() => { /* never throw from watchdog */ });

  const adapterArg = args.find((a) => a.startsWith('--adapter='));
  const explicitAdapter = adapterArg ? adapterArg.split('=')[1] : (process.env.UTOE_ADAPTER || '');

  const { runLocalOptimizer } = await import('../lib/local-optimizer.js');
  const { resolveBridgeAdapter, detectBridgeAdapter } = await import('../adapters/bridge-adapters.js');
  const { processTerminalOutput } = await import('../lib/terminal-hook.js');

  const adapter = resolveBridgeAdapter(hookData, explicitAdapter);
  const detected = detectBridgeAdapter(hookData);
  let prompt = adapter.capturePrompt(hookData);

  if (!prompt || prompt.length < 20) process.exit(0);

  // Stage 1: Terminal output compression
  const termResult = processTerminalOutput(prompt);
  if (termResult.savedPct > 5) prompt = termResult.processed;

  // Stage 2: Local optimizer
  const { optimized, stats } = runLocalOptimizer(prompt);
  const updatedPayload = adapter.injectOptimizedPrompt(hookData, optimized);

  if (stats.savedTokens > 0 || termResult.savedPct > 0) {
    process.stderr.write(
      `[UTOE/${String(explicitAdapter || detected).toUpperCase()}] ${stats.originalTokens}→${stats.optimizedTokens} tokens (saved ${stats.savedPct}%)\n`
    );
  }

  try {
    process.stdout.write(JSON.stringify(updatedPayload));
  } catch (err) {
    captureError('hook:output', err);
    // Fall back to unmodified payload so Claude still gets the prompt
    process.stdout.write(JSON.stringify(hookData));
  }
}

async function cmdCommand(input, config) {
  // Dynamically import command engine from lib (compiled JS)
  try {
    const { CommandEngine, createDefaultSession } = await import('../lib/command-engine.js');
    const engine = new CommandEngine({ projectRoot: process.cwd() });
    const session = createDefaultSession();
    const result = engine.process(input, session);
    if (result.handled || result.response) {
      console.log(result.response ?? '[UTOE] Command executed.');
    } else {
      console.log(`[UTOE] Unknown command: ${input}`);
    }
  } catch {
    console.log(`[UTOE] Command engine not compiled yet. Run: npm run build`);
  }
}

async function cmdAsk(message, config) {
  // Check if message is a slash command
  if (message.startsWith('/')) {
    return cmdCommand(message, config);
  }
  const { runPipeline } = await import('../lib/pipeline.js');
  const session = { history: [], lastTopic: null };

  process.stdout.write(`${C.dim}Routing to best model...${C.reset}\r`);
  try {
    const result = await runPipeline(message, session, config);
    process.stdout.write(' '.repeat(30) + '\r');
    console.log(`\n${C.bold}Response:${C.reset}\n${result.response}`);
    console.log(`\n${C.dim}Mode: ${String(result.mode || 'bridge').toUpperCase()} | Provider: ${result.provider} | Model: ${result.model} | Task: ${result.task}${C.reset}`);
    console.log(`${C.dim}Tokens: ${result.inputTokens} in / ${result.outputTokens} out | Saved: ${C.green}${result.savedTokens}${C.dim} tokens (${result.savingsPct}%) | ${result.elapsedMs}ms${C.reset}\n`);
  } catch (err) {
    console.error(`${C.red}Error: ${err.message}${C.reset}`);
    process.exit(1);
  }
}

async function cmdInit(args = []) {
  const { install } = await import('../lib/installer.js');
  await install(process.cwd(), { production: !args.includes('--dev') });
}

async function cmdVerify() {
  const { verifyInstallation } = await import('../lib/installer.js');
  const report = verifyInstallation(process.cwd());
  const icon = (ok) => ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
  console.log(`\n${C.bold}UTOE Installation Check${C.reset}`);
  for (const check of report.checks) {
    console.log(`  ${icon(check.ok)} ${check.id}: ${check.detail}`);
  }
  console.log(report.ok ? `\n${C.green}All checks passed.${C.reset}\n` : `\n${C.yellow}Some checks failed.${C.reset}\n`);
  if (!report.ok) process.exit(1);
}

// ─── Error capture helpers ────────────────────────────────────────────────────

const ERROR_LOG = path.join(homedir(), '.utoe', 'error.log');

function captureError(context, err) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    const entry = JSON.stringify({
      ts:       new Date().toISOString(),
      context,
      message:  err?.message ?? String(err),
      stack:    err?.stack?.split('\n').slice(0, 6).join('\n') ?? '',
      node:     process.versions.node,
      platform: process.platform,
      version:  VERSION,
      cwd:      process.cwd(),
    }) + '\n';
    fs.appendFileSync(ERROR_LOG, entry);
  } catch { /* never throw from error capture */ }
}

// ─── Report command ───────────────────────────────────────────────────────────

async function cmdReport() {
  console.log(`\n${C.bold}${C.cyan}UTOE Diagnostic Report${C.reset}\n`);

  const stateDir   = path.join(homedir(), '.utoe');
  const projectDir = process.cwd();
  const lines      = [];

  // ── 1. System info ──────────────────────────────────────────────────────────
  const sysInfo = {
    utoe_version: VERSION,
    node_version: process.versions.node,
    platform:     `${process.platform}-${process.arch}`,
    shell:        process.env.SHELL ?? 'unknown',
    term_program: process.env.TERM_PROGRAM ?? 'unknown',
    anthropic_base_url: process.env.ANTHROPIC_BASE_URL ?? '(not set)',
    proxy_running: false,
  };

  // Check proxy
  try {
    const net = await import('node:net');
    sysInfo.proxy_running = await new Promise(resolve => {
      const s = new net.default.Socket();
      s.setTimeout(600);
      s.connect(PROXY_PORT, '127.0.0.1', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
  } catch { /* ignore */ }

  lines.push('## System Info');
  for (const [k, v] of Object.entries(sysInfo)) {
    const icon = (k === 'proxy_running' && !v) ? `${C.yellow}✗${C.reset}` :
                 (k === 'anthropic_base_url' && v === '(not set)') ? `${C.yellow}✗${C.reset}` : `${C.green}✓${C.reset}`;
    console.log(`  ${icon}  ${k.padEnd(24)} ${C.dim}${v}${C.reset}`);
    lines.push(`- **${k}:** \`${v}\``);
  }

  // ── 2. Install report ───────────────────────────────────────────────────────
  const installReportPath = path.join(projectDir, '.utoe', 'install-report.json');
  let installReport = null;
  if (fs.existsSync(installReportPath)) {
    try { installReport = JSON.parse(fs.readFileSync(installReportPath, 'utf8')); } catch { /* ignore */ }
  }

  console.log(`\n  ${C.bold}Install report:${C.reset}  ${installReport ? `${C.green}found${C.reset}` : `${C.yellow}not found — run from project root${C.reset}`}`);
  if (installReport?.verify?.checks) {
    lines.push('\n## Install Verification');
    for (const check of installReport.verify.checks) {
      const icon = check.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(`    ${icon}  ${check.id.padEnd(20)} ${C.dim}${check.detail ?? ''}${C.reset}`);
      lines.push(`- [${check.ok ? 'x' : ' '}] \`${check.id}\` — ${check.detail ?? ''}`);
    }
  }

  // ── 3. Recent errors from ~/.utoe/error.log ─────────────────────────────────
  let recentErrors = [];
  if (fs.existsSync(ERROR_LOG)) {
    try {
      recentErrors = fs.readFileSync(ERROR_LOG, 'utf8')
        .split('\n').filter(Boolean).slice(-20)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    } catch { /* ignore */ }
  }

  console.log(`\n  ${C.bold}Error log:${C.reset}  ${recentErrors.length} recent error(s)  ${C.dim}(${ERROR_LOG})${C.reset}`);
  if (recentErrors.length > 0) {
    lines.push('\n## Recent Errors');
    for (const e of recentErrors.slice(-5)) {
      console.log(`    ${C.red}✗${C.reset}  [${e.ts?.slice(0,19)}] ${C.yellow}${e.context}${C.reset}: ${e.message}`);
      lines.push(`\n### ${e.ts?.slice(0,19)} — ${e.context}`);
      lines.push(`\`\`\`\n${e.message}\n${e.stack ?? ''}\n\`\`\``);
    }
  }

  // ── 4. Telemetry summary ────────────────────────────────────────────────────
  const telemetryPath = path.join(projectDir, '.utoe_telemetry.jsonl');
  let telemetryCount = 0;
  if (fs.existsSync(telemetryPath)) {
    try { telemetryCount = fs.readFileSync(telemetryPath, 'utf8').split('\n').filter(Boolean).length; } catch { /* ignore */ }
  }
  lines.push(`\n## Usage\n- Telemetry events recorded: ${telemetryCount}`);

  // ── 5. Build GitHub issue URL ───────────────────────────────────────────────
  const issueTitle = encodeURIComponent(`[bug] UTOE v${VERSION} — <describe your issue>`);
  const issueBody  = encodeURIComponent(
    `## What happened\n<!-- Describe the problem -->\n\n` +
    `## Steps to reproduce\n1. \n2. \n\n` +
    `## Expected behaviour\n\n` +
    `## Diagnostic info\n\`\`\`\n${lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 3000)}\n\`\`\`\n`
  );
  const issueURL = `https://github.com/MahammadAliNathametha/utoe-plugin/issues/new?title=${issueTitle}&body=${issueBody}`;

  console.log(`\n${C.bold}━━━ Report Options ━━━${C.reset}\n`);
  console.log(`  ${C.bold}1. Open a pre-filled GitHub issue:${C.reset}`);
  console.log(`     ${C.cyan}${issueURL.slice(0, 80)}...${C.reset}`);
  console.log(`     (full URL copied below)\n`);
  console.log(`  ${C.bold}2. View raw error log:${C.reset}`);
  console.log(`     ${C.dim}cat ${ERROR_LOG}${C.reset}\n`);
  console.log(`  ${C.bold}3. View install report:${C.reset}`);
  console.log(`     ${C.dim}cat ${installReportPath}${C.reset}\n`);

  // Write full URL to a temp file so user can open it
  const reportFile = path.join(stateDir, 'last-report-url.txt');
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(reportFile, issueURL);
    console.log(`  ${C.green}✓${C.reset}  Full GitHub issue URL saved to: ${C.dim}${reportFile}${C.reset}`);
    console.log(`     Open with: ${C.cyan}xdg-open $(cat ${reportFile})${C.reset}  ${C.dim}(Linux)${C.reset}`);
    console.log(`              : ${C.cyan}open $(cat ${reportFile})${C.reset}      ${C.dim}(macOS)${C.reset}\n`);
  } catch { /* ignore */ }
}

async function cmdStats() {
  try {
    const port = normalizeConfig(loadConfig()).port;
    const res = await fetch(`http://localhost:${port}/stats`);
    const data = await res.json();
    const g = data.global || {};
    console.log(`\n${C.bold}${C.cyan}UTOE Token Savings${C.reset}`);
    console.log(`  Session saved : ${C.green}${data.total_saved?.toLocaleString() || 0}${C.reset} tokens`);
    console.log(`  Session used  : ${data.total_used?.toLocaleString() || 0} tokens`);
    console.log(`  Global saved  : ${C.green}${g.tokens_saved?.toLocaleString() || 0}${C.reset} tokens`);
    console.log(`  Global cost   : ${C.yellow}$${g.cost_saved_usd || '0.0000'}${C.reset} saved`);
    console.log(`  Requests      : ${g.requests || 0}`);
    console.log(`  Memory facts  : ${data.memory?.longTerm || 0}`);
    console.log(`  Uptime        : ${Math.floor((g.uptime_s || 0) / 60)}m\n`);
    if (Object.keys(g.by_provider || {}).length) {
      console.log(`  By provider   : ${Object.entries(g.by_provider).map(([p, c]) => `${p}(${c})`).join(', ')}`);
    }
  } catch {
    const { memory } = await import('../lib/memory.js');
    console.log(`\n${C.dim}(Server not running — local memory only)${C.reset}`);
    const s = memory.stats();
    console.log(`  Long-term facts: ${s.longTerm}`);
    console.log(`  Short-term buffer: ${s.shortTerm}\n`);
  }
}

async function cmdDashboard() {
  const cfg = normalizeConfig(loadConfig());
  const url = `http://localhost:${cfg.port}/`;
  console.log(`${C.cyan}Opening dashboard: ${url}${C.reset}`);
  console.log(`${C.dim}(Start UTOE server first with: utoe start)${C.reset}`);
  try {
    // Try to open browser
    const { exec } = await import('child_process');
    const platform = process.platform;
    const open = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${open} ${url}`, (err) => {
      if (err) console.log(`\nOpen manually: ${C.cyan}${url}${C.reset}`);
    });
  } catch {
    console.log(`\nOpen manually: ${C.cyan}${url}${C.reset}`);
  }
}

async function cmdSuggestPrompt(message) {
  if (!message) {
    console.error(`${C.red}Usage: utoe suggest-prompt "your prompt"${C.reset}`);
    process.exit(1);
  }
  const { suggestBetterPrompt, scorePrompt } = await import('../lib/prompt-suggester.js');
  const result = suggestBetterPrompt(message);
  const score = scorePrompt(message);
  const scoreColor = score >= 70 ? C.green : score >= 40 ? C.yellow : C.red;

  console.log(`\n${C.bold}Prompt Analysis${C.reset}`);
  console.log(`  Quality score  : ${scoreColor}${score}/100${C.reset}`);
  console.log(`  Detected task  : ${C.cyan}${result.task}${C.reset}${result.lang ? ` (${result.lang})` : ''}`);
  console.log(`  Original tokens: ${result.originalTokens}`);
  console.log(`  Optimized tokens: ${result.suggestedTokens}`);
  const pct = result.improvementPct;
  const improvLabel = pct >= 0
    ? `${C.green}${pct}% fewer tokens${C.reset}`
    : `${C.yellow}${Math.abs(pct)}% more tokens${C.reset}${C.dim} (structured format — better LLM compliance)${C.reset}`;
  console.log(`  Improvement    : ${improvLabel}`);
  console.log(`\n${C.bold}Original:${C.reset}\n  ${message}`);
  console.log(`\n${C.bold}${C.green}Suggested:${C.reset}\n  ${result.suggested}`);
  if (result.whyBetter?.length) {
    console.log(`\n${C.bold}Why it's better:${C.reset}`);
    for (const w of result.whyBetter) console.log(`  ${C.dim}•${C.reset} ${w}`);
  }
  console.log();
}

async function cmdCompress(text) {
  if (!text) {
    console.error(`${C.red}Usage: utoe compress "your text"${C.reset}`);
    process.exit(1);
  }
  const { compress } = await import('../lib/compression.js');
  const result = compress(text);
  console.log(`\n${C.bold}Compression Results${C.reset}`);
  console.log(`  Original tokens  : ${result.stats.originalTokens}`);
  console.log(`  Compressed tokens: ${result.stats.compressedTokens}`);
  console.log(`  Saved            : ${C.green}${result.stats.savedTokens} tokens (${result.stats.savedPct}%)${C.reset}`);
  if (result.stats.layers.length) {
    console.log(`  Layers applied   : ${result.stats.layers.map((l) => `${l.name}(${l.saved})`).join(', ')}`);
  }
  console.log(`\n${C.bold}Compressed output:${C.reset}\n${result.compressed}\n`);
}

async function cmdTrainPersonal(args = []) {
  const verbose = !args.includes('--quiet');
  const projectDir = process.cwd();

  console.log(`\n${C.bold}${C.cyan}UTOE Personal Model Training${C.reset}`);
  console.log(`${C.dim}Indexing project for RAG (local vector search)...${C.reset}\n`);

  const { ProjectRAG } = await import('../lib/rag.js');
  const rag = new ProjectRAG(projectDir);

  const { memory } = await import('../lib/memory.js');
  memory.enableRAG(rag);

  const result = await rag.indexProject({ verbose });
  const stats = rag.stats();

  console.log(`\n${C.green}✓${C.reset} Project indexed:`);
  console.log(`  Files indexed : ${result.indexed}`);
  console.log(`  Files skipped : ${result.skipped}`);
  console.log(`  Total chunks  : ${stats.chunks}`);
  console.log(`  Storage       : ${stats.backend}`);

  if (!args.includes('--rag-only')) {
    console.log(`\n${C.bold}Personal LLM (LoRA fine-tune):${C.reset}`);
    console.log(`  ${C.dim}Full LoRA training requires Ollama + NVIDIA GPU.${C.reset}`);
    console.log(`  1. Install Ollama: ${C.cyan}https://ollama.ai${C.reset}`);
    console.log(`  2. Pull base model: ${C.cyan}ollama pull llama3.1${C.reset}`);
    console.log(`  3. UTOE RAG is now active for all requests.`);
    console.log(`\n  ${C.yellow}→ Project context will be injected into every prompt automatically.${C.reset}\n`);
  }
}

async function cmdStop() {
  const cfg  = normalizeConfig(loadConfig());
  const port = cfg.port;

  // Check whether the server is actually up first
  let running = false;
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    running = res.ok;
  } catch { /* not reachable */ }

  if (!running) {
    console.log(`${C.dim}UTOE server is not running on port ${port}.${C.reset}`);
    return;
  }

  console.log(`${C.yellow}Stopping UTOE server on port ${port}...${C.reset}`);

  const { execSync } = await import('child_process');
  const platform     = process.platform;

  try {
    let pid = '';

    if (platform === 'win32') {
      // Windows: netstat -ano | findstr :<port>  → last column is PID
      const out = execSync(`netstat -ano 2>nul | findstr ":${port} "`, { shell: 'cmd.exe' }).toString();
      const match = out.match(/\s+(\d+)\s*$/m);
      if (match) pid = match[1].trim();
      if (pid) {
        execSync(`taskkill /PID ${pid} /F 2>nul`, { shell: 'cmd.exe' });
        console.log(`${C.green}Server stopped (PID ${pid}).${C.reset}`);
      }
    } else if (platform === 'darwin') {
      // macOS: lsof is always available
      pid = execSync(`lsof -ti tcp:${port} 2>/dev/null`).toString().trim();
      if (pid) {
        process.kill(parseInt(pid, 10), 'SIGTERM');
        console.log(`${C.green}Server stopped (PID ${pid}).${C.reset}`);
      }
    } else {
      // Linux: try lsof first, then fuser (busybox environments)
      try {
        pid = execSync(`lsof -ti tcp:${port} 2>/dev/null`).toString().trim();
      } catch { /* lsof not available */ }
      if (!pid) {
        try {
          pid = execSync(`fuser ${port}/tcp 2>/dev/null`).toString().trim();
        } catch { /* fuser not available */ }
      }
      if (pid) {
        process.kill(parseInt(pid, 10), 'SIGTERM');
        console.log(`${C.green}Server stopped (PID ${pid}).${C.reset}`);
      }
    }

    if (!pid) {
      console.log(`${C.dim}Server is running but PID could not be detected.\nUse Ctrl+C in the terminal running ${C.cyan}utoe start${C.reset}${C.dim}.${C.reset}`);
    }
  } catch (err) {
    console.log(`${C.dim}Stop failed: ${err.message.slice(0, 120)}\nUse Ctrl+C in the terminal running utoe start.${C.reset}`);
  }
}

async function cmdForget(query) {
  try {
    const cfg = normalizeConfig(loadConfig());
    const res = await fetch(`http://localhost:${cfg.port}/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query || '' }),
    });
    const data = await res.json();
    console.log(`${C.green}Removed ${data.removed} memories.${C.reset}`);
  } catch {
    const { memory } = await import('../lib/memory.js');
    const removed = memory.forget(query || '');
    console.log(`${C.green}Removed ${removed} memories.${C.reset}`);
  }
}

async function cmdProviders() {
  const cfg = normalizeConfig(loadConfig());
  const { router } = await import('../lib/router.js');
  const providers = router.listProviders(cfg);
  const hw = router.getHardwareProfile();

  console.log(`\n${C.bold}Available Providers${C.reset} (in routing priority order):`);
  for (const p of providers) {
    const star = p.priority <= 2 ? ` ${C.yellow}★ preferred${C.reset}` : '';
    console.log(`  ${C.green}✓${C.reset} ${p.provider.padEnd(12)} quality: ${Math.round(p.quality * 100)}%${star}`);
  }

  console.log(`\n${C.bold}Hardware Profile:${C.reset}`);
  console.log(`  RAM    : ${hw.totalMemGB.toFixed(1)} GB`);
  console.log(`  CPUs   : ${hw.cpuCount}`);
  console.log(`  GPU    : ${hw.hasGpu ? `${C.green}detected${C.reset}` : `${C.dim}not detected${C.reset}`}`);
  console.log(`  Ollama : ${hw.ollamaCapacity} model capacity`);
  console.log();
}

async function cmdPostinstall() {
  // Detect CI / non-interactive environments — print banner only, skip side-effects
  const isCI = !!(
    process.env.CI || process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS || process.env.GITLAB_CI ||
    process.env.CIRCLECI || process.env.TRAVIS ||
    process.env.npm_lifecycle_event === 'test'
  );

  console.log(`
${C.bold}${C.cyan}  ╔═══════════════════════════════════════════════════════╗
  ║  ⚡ UTOE — Universal Token Optimization Engine       ║
  ║  v${VERSION}  •  Setting up automatically...               ║
  ╚═══════════════════════════════════════════════════════╝${C.reset}
`);

  if (isCI) {
    console.log(`  ${C.yellow}CI environment detected — skipping auto-setup.${C.reset}`);
    console.log(`  Run ${C.cyan}npx utoe init${C.reset} manually after your build.\n`);
    return;
  }

  // Determine the project root: the directory that ran `npm install`,
  // NOT node_modules/utoe-plugin itself.
  const projectDir = process.env.INIT_CWD ?? process.env.npm_config_local_prefix ?? process.cwd();

  // Skip if we're being installed inside node_modules of another package
  // (i.e. someone is publishing a package that depends on utoe-plugin — don't
  // touch their project's .claude/ settings).
  if (projectDir.includes('node_modules')) {
    console.log(`  ${C.dim}Nested install detected — skipping auto-setup.${C.reset}\n`);
    return;
  }

  try {
    const { install } = await import('../lib/installer.js');
    await install(projectDir, { silent: true });
  } catch (err) {
    // NEVER let postinstall fail npm install
    captureError('postinstall', err);
    console.log(`  ${C.yellow}Auto-setup encountered an issue: ${err.message}${C.reset}`);
    console.log(`  ${C.dim}Run ${C.cyan}npx utoe init${C.reset}${C.dim} to retry, or ${C.cyan}npx utoe report${C.reset}${C.dim} to get help.${C.reset}\n`);
  }
}

function showHelp() {
  console.log(`
${C.bold}${C.cyan}UTOE${C.reset} v${VERSION} — Universal Token Optimization Engine
${C.dim}Optimizes prompts, routes to cheapest provider, keeps context within limits.${C.reset}

${C.bold}Usage:${C.reset}
  ${C.cyan}npx utoe start${C.reset}                    Start proxy server (port 8787)
  ${C.cyan}npx utoe stop${C.reset}                     Stop the running proxy server
  ${C.cyan}npx utoe init${C.reset}                     Install into current project
  ${C.cyan}npx utoe verify${C.reset}                   Verify installation
  ${C.cyan}npx utoe ask ${C.dim}"your question"${C.reset}      One-shot query
  ${C.cyan}npx utoe stats${C.reset}                    Show savings statistics
  ${C.cyan}npx utoe dashboard${C.reset}                Open live dashboard in browser
  ${C.cyan}npx utoe suggest-prompt ${C.dim}"..."${C.reset}     Get optimized prompt
  ${C.cyan}npx utoe compress ${C.dim}"text"${C.reset}          Compress text, show savings
  ${C.cyan}npx utoe train-personal${C.reset}           Index project for RAG memory
  ${C.cyan}npx utoe providers${C.reset}                List available providers
  ${C.cyan}npx utoe forget [topic]${C.reset}           Clear memory
  ${C.cyan}npx utoe report${C.reset}                   Generate diagnostic report + GitHub issue URL

${C.bold}Environment:${C.reset}
  ${C.yellow}OPENAI_BASE_URL=http://localhost:8787/v1${C.reset}   → use with any OpenAI SDK
  ${C.yellow}UTOE_PORT=8787${C.reset}                             → custom port
  ${C.yellow}UTOE_MODE=proxy${C.reset}                            → proxy mode (calls LLMs)
  ${C.yellow}UTOE_MODE=bridge${C.reset}                           → bridge mode (optimize only)

${C.bold}Compatible with:${C.reset} Cursor, Claude Code, VS Code, Windsurf, Aider, llm CLI,
  any OpenAI SDK, Vercel AI SDK, LangChain, and more.
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// ─── Global error capture ─────────────────────────────────────────────────────
// Catches any unhandled error in the CLI/proxy and writes it to ~/.utoe/error.log
// so `npx utoe report` can include it in the diagnostic bundle.

process.on('uncaughtException', (err) => {
  captureError(`uncaughtException:${cmd ?? 'unknown'}`, err);
  // Only crash hard for the proxy — other commands can be silent
  if (cmd === 'start') {
    console.error(`${C.red}[UTOE] Fatal error: ${err.message}${C.reset}`);
    console.error(`${C.dim}Run 'npx utoe report' to generate a bug report.${C.reset}`);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  captureError(`unhandledRejection:${cmd ?? 'unknown'}`, reason instanceof Error ? reason : new Error(String(reason)));
});

const [,, cmd, ...args] = process.argv;
const config = normalizeConfig(loadConfig());

switch (cmd) {
  case 'start':
  case undefined:
    cmdStart(config); break;

  case 'hook':
    cmdHook(args); break;

  case 'stop':
    cmdStop(); break;

  case 'init':
    cmdInit(args); break;

  case 'verify':
    cmdVerify(); break;

  case 'report':
    cmdReport(); break;

  case 'ask':
    cmdAsk(args.join(' '), config); break;

  case 'cmd':
  case 'command':
    cmdCommand(args.join(' '), config); break;

  case 'stats':
    cmdStats(); break;

  case 'dashboard':
    cmdDashboard(); break;

  case 'suggest-prompt':
    cmdSuggestPrompt(args.join(' ')); break;

  case 'compress':
    cmdCompress(args.join(' ')); break;

  case 'train-personal':
    cmdTrainPersonal(args); break;

  case 'forget':
    cmdForget(args.join(' ')); break;

  case 'providers':
    cmdProviders(); break;

  case '_postinstall':
    cmdPostinstall(); break;

  case 'version':
  case '--version':
  case '-v':
    console.log(VERSION); break;

  case 'help':
  case '--help':
  case '-h':
    showHelp(); break;

  default:
    console.error(`${C.red}Unknown command: ${cmd}${C.reset}`);
    showHelp();
    process.exit(1);
}
