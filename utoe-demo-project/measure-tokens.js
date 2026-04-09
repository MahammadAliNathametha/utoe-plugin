#!/usr/bin/env node
/**
 * measure-tokens.js
 *
 * Token counting utility for UTOE demo.
 *
 * Tries three counting strategies (best → fallback):
 *   1. @dqbd/tiktoken (exact — if installed)
 *   2. js-tiktoken WASM (exact — if installed)
 *   3. Character-based estimator (±5% accuracy, zero deps)
 *
 * Usage:
 *   node measure-tokens.js "your text here"
 *   node measure-tokens.js --file path/to/file.txt
 *   node measure-tokens.js --compare  (reads .utoe-test-without.json and .utoe-test-with.json)
 *   node measure-tokens.js --stdin    (pipe text via stdin)
 *
 * Examples:
 *   echo "Hello world" | node measure-tokens.js --stdin
 *   node measure-tokens.js "Please write a function that sorts an array"
 *   node measure-tokens.js --compare
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { estimateTokens } from './shared/prompts.js';

// ─── Tiktoken integration (optional) ─────────────────────────────────────────

async function countWithTiktoken(text) {
  // Try @dqbd/tiktoken first (native addon)
  try {
    const { get_encoding } = await import('@dqbd/tiktoken');
    const enc = get_encoding('cl100k_base');
    const tokens = enc.encode(text);
    enc.free();
    return { count: tokens.length, method: '@dqbd/tiktoken (cl100k_base)' };
  } catch {
    // not installed — fall through
  }

  // Try js-tiktoken (pure JS, may be installed as dependency of other tools)
  try {
    const { getEncoding } = await import('js-tiktoken');
    const enc = getEncoding('cl100k_base');
    const tokens = enc.encode(text);
    return { count: tokens.length, method: 'js-tiktoken (cl100k_base)' };
  } catch {
    // not installed — use estimator
  }

  // Character-based estimator (no native deps)
  return { count: estimateTokens(text), method: 'char-based estimator (±5%)' };
}

// ─── Compare mode ─────────────────────────────────────────────────────────────

function printComparisonTable() {
  const withoutFile = '.utoe-test-without.json';
  const withFile    = '.utoe-test-with.json';

  if (!fs.existsSync(withoutFile) || !fs.existsSync(withFile)) {
    console.error('\n  Run both tests first:');
    console.error('    node test-without-utoe.js --dry-run');
    console.error('    node test-with-utoe.js    --dry-run');
    process.exit(1);
  }

  const without = JSON.parse(fs.readFileSync(withoutFile, 'utf8'));
  const with_   = JSON.parse(fs.readFileSync(withFile,    'utf8'));

  const savedTotal   = without.grandTotal - with_.grandTotal;
  const savingsPct   = ((savedTotal / without.grandTotal) * 100).toFixed(1);
  const costSaved    = (without.estimatedCostUSD - with_.estimatedCostUSD).toFixed(4);
  const ROI          = without.estimatedCostUSD > 0
    ? ((without.estimatedCostUSD - with_.estimatedCostUSD) / without.estimatedCostUSD * 100).toFixed(1)
    : '0.0';

  const W = 56;
  const bar  = '═'.repeat(W);
  const sep  = '─'.repeat(W);
  const pad  = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);

  console.log('\n╔' + bar + '╗');
  console.log('║' + ' UTOE Token Savings — Demo Results'.padEnd(W) + '║');
  console.log('╠' + bar + '╣');
  console.log(`║  ${pad('Metric', 28)} ${pad('Without UTOE', 12)} ${pad('With UTOE', 10)} ║`);
  console.log('╠' + bar + '╣');
  console.log(`║  ${pad('Input tokens', 28)} ${rpad(without.totalInputTokens.toLocaleString(), 12)} ${rpad(with_.totalInputTokens.toLocaleString(), 10)} ║`);
  console.log(`║  ${pad('Output tokens', 28)} ${rpad(without.totalOutputTokens.toLocaleString(), 12)} ${rpad(with_.totalOutputTokens.toLocaleString(), 10)} ║`);
  console.log(`║  ${pad('Total tokens', 28)} ${rpad(without.grandTotal.toLocaleString(), 12)} ${rpad(with_.grandTotal.toLocaleString(), 10)} ║`);
  console.log(`║  ${pad('Est. cost (claude-haiku)', 28)} $${rpad(without.estimatedCostUSD.toFixed(4), 11)} $${rpad(with_.estimatedCostUSD.toFixed(4), 9)} ║`);
  console.log('╠' + bar + '╣');
  console.log(`║  ${'Tokens saved by UTOE:'.padEnd(28)} ${rpad(savedTotal.toLocaleString(), 23)} ║`);
  console.log(`║  ${'Savings %:'.padEnd(28)} ${rpad(savingsPct + '%', 23)} ║`);
  console.log(`║  ${'Est. cost saved:'.padEnd(28)} $${rpad(costSaved, 22)} ║`);
  console.log(`║  ${'Cost reduction:'.padEnd(28)} ${rpad(ROI + '%', 23)} ║`);
  console.log('╠' + bar + '╣');

  // Per-turn breakdown
  console.log('║  ' + pad('Turn-by-turn breakdown:', W - 2) + ' ║');
  console.log('║  ' + pad('Turn  Without  With    Saved   %', W - 2) + ' ║');
  console.log('║  ' + sep.slice(0, W - 2) + ' ║');

  const maxTurns = Math.min(without.turns?.length ?? 0, with_.turns?.length ?? 0);
  for (let i = 0; i < maxTurns; i++) {
    const w = without.turns[i];
    const u = with_.turns[i];
    const s = (w.inputTokens || 0) - (u.optimizedTokens || u.inputTokens || 0);
    const p = w.inputTokens > 0 ? ((s / w.inputTokens) * 100).toFixed(0) : '0';
    console.log(`║  ${pad(i + 1, 4)} ${rpad((w.inputTokens || 0).toLocaleString(), 7)}  ${rpad((u.optimizedTokens || u.inputTokens || 0).toLocaleString(), 7)} ${rpad(s.toLocaleString(), 7)} ${rpad(p + '%', 5)} ║`);
  }

  console.log('╠' + bar + '╣');
  console.log(`║  Test timestamp (without): ${pad(without.timestamp?.slice(0, 19) ?? 'N/A', W - 30)} ║`);
  console.log(`║  Test timestamp (with):    ${pad(with_.timestamp?.slice(0, 19)  ?? 'N/A', W - 30)} ║`);
  console.log('╚' + bar + '╝');
  console.log();
}

// ─── Single text mode ─────────────────────────────────────────────────────────

async function measureText(text, label = 'Input') {
  const { count, method } = await countWithTiktoken(text);
  const chars = text.length;
  const words = text.split(/\s+/).length;

  console.log(`\n  ${label}`);
  console.log('  ' + '─'.repeat(50));
  console.log(`  Characters : ${chars.toLocaleString()}`);
  console.log(`  Words      : ${words.toLocaleString()}`);
  console.log(`  Tokens     : ${count.toLocaleString()}  (${method})`);
  console.log(`  Chars/token: ${(chars / count).toFixed(2)}`);
  console.log(`  Est. cost  : $${((count / 1_000_000) * 3.0).toFixed(6)}  (claude-haiku @$3/MTok)`);
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--compare') || args.includes('-c')) {
    printComparisonTable();
    return;
  }

  if (args.includes('--stdin') || args.includes('-s')) {
    const lines = [];
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) lines.push(line);
    await measureText(lines.join('\n'), 'stdin');
    return;
  }

  if (args.includes('--file') || args.includes('-f')) {
    const idx = args.findIndex(a => a === '--file' || a === '-f');
    const filePath = args[idx + 1];
    if (!filePath) { console.error('Usage: --file <path>'); process.exit(1); }
    const text = fs.readFileSync(path.resolve(filePath), 'utf8');
    await measureText(text, `File: ${filePath}`);
    return;
  }

  if (args.length > 0 && !args[0].startsWith('-')) {
    await measureText(args.join(' '), 'Argument text');
    return;
  }

  // No args: show help
  console.log(`
  measure-tokens.js — Token counting utility for UTOE demo

  Usage:
    node measure-tokens.js "text to count"
    node measure-tokens.js --file path/to/file.txt
    node measure-tokens.js --compare           (show demo results comparison)
    node measure-tokens.js --stdin             (pipe text via stdin)

  Examples:
    node measure-tokens.js "Hello, world!"
    node measure-tokens.js --compare
    cat todo-app/src/index.ts | node measure-tokens.js --stdin
  `);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
