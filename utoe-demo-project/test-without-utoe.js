/**
 * test-without-utoe.js
 *
 * Simulates building a Node.js CLI Todo App WITHOUT the UTOE proxy.
 * Sends 10 prompts directly to the Anthropic API (or counts tokens locally
 * if ANTHROPIC_API_KEY is not set / --dry-run flag is passed).
 *
 * Run:
 *   node test-without-utoe.js           # real API calls
 *   node test-without-utoe.js --dry-run # token counting only (no API calls)
 */

import https from 'node:https';
import { estimateTokens, buildConversation, TASK_PROMPTS } from './shared/prompts.js';

const DRY_RUN = process.argv.includes('--dry-run') || !process.env.ANTHROPIC_API_KEY;

// ─── Anthropic API helper ─────────────────────────────────────────────────────

async function callAnthropic(messages, model = 'claude-haiku-4-5-20251001') {
  const body = JSON.stringify({
    model,
    max_tokens: 1024,
    messages,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed);
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST: Building Todo App WITHOUT UTOE');
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN (token counting only)' : 'LIVE API'));
  console.log('═'.repeat(60) + '\n');

  const history = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const results = [];

  for (let i = 0; i < TASK_PROMPTS.length; i++) {
    const prompt = TASK_PROMPTS[i];
    history.push({ role: 'user', content: prompt });

    // Count tokens BEFORE sending (full accumulated history)
    const inputTokens = history.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    totalInputTokens += inputTokens;

    console.log(`\n[Turn ${i + 1}/${TASK_PROMPTS.length}] Prompt: "${prompt.slice(0, 70)}..."`);
    console.log(`  Input tokens (full history): ${inputTokens}`);

    let outputTokens = 0;
    let reply = '';

    if (DRY_RUN) {
      // Simulate a realistic response length for each task
      reply = buildConversation(prompt, i);
      outputTokens = estimateTokens(reply);
      await new Promise(r => setTimeout(r, 80)); // simulate latency
    } else {
      try {
        const response = await callAnthropic(history);
        reply = response.content?.[0]?.text ?? '';
        outputTokens = response.usage?.output_tokens ?? estimateTokens(reply);
        totalOutputTokens += response.usage?.input_tokens ?? inputTokens;
      } catch (err) {
        console.error(`  API error: ${err.message}`);
        reply = buildConversation(prompt, i);
        outputTokens = estimateTokens(reply);
      }
    }

    totalOutputTokens += outputTokens;
    history.push({ role: 'assistant', content: reply });

    console.log(`  Output tokens: ${outputTokens}`);
    console.log(`  Cumulative input: ${totalInputTokens} | output: ${totalOutputTokens}`);

    results.push({
      turn: i + 1,
      prompt: prompt.slice(0, 60),
      inputTokens,
      outputTokens,
    });
  }

  const grandTotal = totalInputTokens + totalOutputTokens;
  const estimatedCostUSD = (grandTotal / 1_000_000) * 3.0; // claude-haiku pricing ~$3/MTok input

  console.log('\n' + '═'.repeat(60));
  console.log('  WITHOUT UTOE — Results');
  console.log('─'.repeat(60));
  console.log(`  Total input  tokens : ${totalInputTokens.toLocaleString()}`);
  console.log(`  Total output tokens : ${totalOutputTokens.toLocaleString()}`);
  console.log(`  Grand total         : ${grandTotal.toLocaleString()}`);
  console.log(`  Est. cost (Haiku)   : $${estimatedCostUSD.toFixed(4)}`);
  console.log(`  Turns completed     : ${TASK_PROMPTS.length}`);
  console.log('═'.repeat(60) + '\n');

  // Write results to file for comparison script
  const output = {
    mode: 'without-utoe',
    totalInputTokens,
    totalOutputTokens,
    grandTotal,
    estimatedCostUSD,
    turns: results,
    timestamp: new Date().toISOString(),
  };

  await import('node:fs').then(fs =>
    fs.writeFileSync('.utoe-test-without.json', JSON.stringify(output, null, 2))
  );
  console.log('  Results saved to .utoe-test-without.json');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
