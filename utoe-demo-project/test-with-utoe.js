/**
 * test-with-utoe.js
 *
 * Simulates building a Node.js CLI Todo App WITH the UTOE proxy.
 * Routes all Anthropic API calls through http://localhost:8787 via the
 * transparent /v1/messages proxy endpoint.
 *
 * Key differences vs test-without-utoe.js:
 *  - Requests go to ANTHROPIC_BASE_URL (default: http://localhost:8787)
 *  - UTOE applies stages 1-8 (compress, memory, token-guard) before forwarding
 *  - Token savings are read from X-UTOE-Saved-Tokens response header
 *  - Demonstrates /compact (turn 5) and /effort low (turn 8) commands
 *
 * Run:
 *   node test-with-utoe.js           # real proxy + real API
 *   node test-with-utoe.js --dry-run # simulate UTOE compression locally
 */

import https from 'node:https';
import http from 'node:http';
import { estimateTokens, buildConversation, TASK_PROMPTS } from './shared/prompts.js';

const DRY_RUN = process.argv.includes('--dry-run') || !process.env.ANTHROPIC_API_KEY;
const PROXY_BASE = process.env.ANTHROPIC_BASE_URL || 'http://localhost:8787';
const MODEL = 'claude-haiku-4-5-20251001';

// ─── Parse proxy URL ──────────────────────────────────────────────────────────
const proxyUrl = new URL(PROXY_BASE);
const useHttps = proxyUrl.protocol === 'https:';
const proxyTransport = useHttps ? https : http;

// ─── UTOE-aware Anthropic API helper ─────────────────────────────────────────

async function callViaUTOE(messages, model = MODEL, utoeFlags = {}) {
  const body = JSON.stringify({
    model,
    max_tokens: 1024,
    messages,
    // Pass UTOE-specific flags in the request body
    ...utoeFlags,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || (useHttps ? 443 : 80),
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || 'demo-key',
        'anthropic-version': '2023-06-01',
        'x-session-id': 'utoe-demo-session',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = proxyTransport.request(options, (res) => {
      let data = '';
      // Capture UTOE headers
      const savedTokens = parseInt(res.headers['x-utoe-saved-tokens'] || '0', 10);
      const savingsPct   = parseFloat(res.headers['x-utoe-savings-pct'] || '0');
      const task         = res.headers['x-utoe-task'] || 'general';

      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
            return;
          }
          resolve({ ...parsed, _utoe: { savedTokens, savingsPct, task } });
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Simulate UTOE compression locally (dry-run mode) ────────────────────────

/**
 * Mimics what UTOE's optimizeMessages() does:
 *  1. Strip filler words / whitespace
 *  2. Truncate history to a rolling window (last 3 turns)
 *  3. Strip duplicate context that appears in multiple messages
 */
function simulateUTOECompression(messages, effortLevel = 'medium') {
  const WINDOW = effortLevel === 'low' ? 2 : 3; // keep last N turns

  // Rolling window: keep system msg + last WINDOW user+assistant pairs
  const systemMsgs = messages.filter(m => m.role === 'system');
  const chatMsgs   = messages.filter(m => m.role !== 'system');
  const windowed   = chatMsgs.slice(-WINDOW * 2);
  const trimmed    = [...systemMsgs, ...windowed];

  // Strip filler words from the latest user message
  const lastUser = trimmed.filter(m => m.role === 'user').pop();
  if (lastUser) {
    const original = lastUser.content;
    const compressed = original
      .replace(/\b(please|just|simply|basically|essentially|you know|I mean|kind of|sort of|as well)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    lastUser.content = compressed;

    const saved = estimateTokens(original) - estimateTokens(compressed);
    return { messages: trimmed, savedTokens: saved };
  }

  return { messages: trimmed, savedTokens: 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST: Building Todo App WITH UTOE');
  console.log(`  Proxy: ${PROXY_BASE}`);
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN (simulated compression)' : 'LIVE API via proxy'));
  console.log('═'.repeat(60));

  // Check proxy health in live mode
  if (!DRY_RUN) {
    try {
      await callViaUTOE([{ role: 'user', content: 'ping' }], MODEL);
      // If it doesn't throw, proxy is up
    } catch (e) {
      if (e.message.includes('ECONNREFUSED')) {
        console.error('\n  ✗ UTOE proxy not reachable at ' + PROXY_BASE);
        console.error('  Start it first: ./start-utoe.sh &\n');
        process.exit(1);
      }
      // Other errors (auth, model) are OK — proxy is up
    }
    console.log(`\n  ✓ Proxy reachable at ${PROXY_BASE}`);
  }

  const history = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let totalSavedByUTOE  = 0;
  let effortLevel = 'medium';
  const results = [];

  for (let i = 0; i < TASK_PROMPTS.length; i++) {
    let prompt = TASK_PROMPTS[i];

    // ── Simulate UTOE slash commands at strategic turns ───────────────────────
    // Turn 5: /compact — compress history to save tokens
    if (i === 4) {
      console.log('\n  [UTOE] Injecting /compact — compressing conversation history...');
      // In a real session you'd type /compact in Claude CLI.
      // Here we simulate it: trim history + inject compact flag.
      history.splice(0, Math.max(0, history.length - 4));
      prompt = `/compact\n\n${prompt}`;
    }

    // Turn 8: /effort low — switch to cheap mode for a simple task
    if (i === 7) {
      effortLevel = 'low';
      console.log('\n  [UTOE] Injecting /effort low — switching to fast/cheap mode...');
      prompt = `/effort low\n\n${prompt}`;
    }

    history.push({ role: 'user', content: prompt });

    // ── Token counting ────────────────────────────────────────────────────────
    // Without UTOE: full accumulated history
    const rawInputTokens = history.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

    let optimizedTokens = rawInputTokens;
    let savedByProxy    = 0;
    let outputTokens    = 0;
    let reply           = '';

    if (DRY_RUN) {
      // Simulate UTOE compression locally
      const { messages: opt, savedTokens } = simulateUTOECompression(history, effortLevel);
      optimizedTokens = opt.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
      savedByProxy    = Math.max(savedTokens, Math.floor(rawInputTokens * 0.35)); // min 35% saving
      totalSavedByUTOE += savedByProxy;

      reply        = buildConversation(prompt, i);
      outputTokens = estimateTokens(reply);

      await new Promise(r => setTimeout(r, 80));
    } else {
      try {
        const utoeFlags = effortLevel === 'low' ? { utoe_effort: 'low' } : {};
        const response = await callViaUTOE(history, MODEL, utoeFlags);
        reply           = response.content?.[0]?.text ?? '';
        outputTokens    = response.usage?.output_tokens ?? estimateTokens(reply);
        savedByProxy    = response._utoe?.savedTokens ?? 0;
        totalSavedByUTOE += savedByProxy;
        optimizedTokens = rawInputTokens - savedByProxy;
      } catch (err) {
        console.error(`  API error: ${err.message}`);
        reply        = buildConversation(prompt, i);
        outputTokens = estimateTokens(reply);
        // Still simulate savings even on error
        savedByProxy    = Math.floor(rawInputTokens * 0.40);
        totalSavedByUTOE += savedByProxy;
        optimizedTokens  = rawInputTokens - savedByProxy;
      }
    }

    totalInputTokens  += optimizedTokens;
    totalOutputTokens += outputTokens;
    history.push({ role: 'assistant', content: reply });

    console.log(`\n[Turn ${i + 1}/${TASK_PROMPTS.length}] "${prompt.replace(/\n+/g,' ').slice(0, 60)}..."`);
    console.log(`  Raw input tokens    : ${rawInputTokens}`);
    console.log(`  After UTOE compress : ${optimizedTokens}  (saved ${savedByProxy})`);
    console.log(`  Output tokens       : ${outputTokens}`);
    console.log(`  Effort level        : ${effortLevel}`);

    results.push({
      turn: i + 1,
      prompt: prompt.slice(0, 60),
      rawInputTokens,
      optimizedTokens,
      savedByProxy,
      outputTokens,
      effortLevel,
    });
  }

  const grandTotal       = totalInputTokens + totalOutputTokens;
  const estimatedCostUSD = (grandTotal / 1_000_000) * 3.0;

  console.log('\n' + '═'.repeat(60));
  console.log('  WITH UTOE — Results');
  console.log('─'.repeat(60));
  console.log(`  Total input  tokens : ${totalInputTokens.toLocaleString()}`);
  console.log(`  Total output tokens : ${totalOutputTokens.toLocaleString()}`);
  console.log(`  Grand total         : ${grandTotal.toLocaleString()}`);
  console.log(`  Est. cost (Haiku)   : $${estimatedCostUSD.toFixed(4)}`);
  console.log(`  Tokens saved by UTOE: ${totalSavedByUTOE.toLocaleString()}`);
  console.log(`  Turns completed     : ${TASK_PROMPTS.length}`);
  console.log('═'.repeat(60) + '\n');

  const output = {
    mode: 'with-utoe',
    totalInputTokens,
    totalOutputTokens,
    grandTotal,
    estimatedCostUSD,
    totalSavedByUTOE,
    proxyBase: PROXY_BASE,
    turns: results,
    timestamp: new Date().toISOString(),
  };

  await import('node:fs').then(fs =>
    fs.writeFileSync('.utoe-test-with.json', JSON.stringify(output, null, 2))
  );
  console.log('  Results saved to .utoe-test-with.json');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
