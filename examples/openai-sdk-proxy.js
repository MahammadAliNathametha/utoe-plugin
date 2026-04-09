/**
 * UTOE Example: OpenAI SDK Transparent Proxy
 *
 * This example shows how to use the OpenAI SDK with UTOE as a drop-in proxy.
 * UTOE automatically:
 *  - Compresses your prompts (saves 60-95% tokens)
 *  - Routes to the cheapest adequate model
 *  - Manages conversation memory
 *  - Prevents context overflow
 *
 * Setup:
 *   1. npx utoe start           (in a separate terminal)
 *   2. node examples/openai-sdk-proxy.js
 */

// You can use the official OpenAI SDK unchanged — just change the baseURL
// npm install openai
// import OpenAI from 'openai';
//
// const openai = new OpenAI({
//   apiKey: 'any-key',  // UTOE handles routing, so any non-empty string works
//   baseURL: 'http://localhost:8787/v1',
// });

// Without the OpenAI SDK — using native fetch (zero deps demo)
const UTOE_BASE = 'http://localhost:8787';

async function chat(message, sessionId = 'example-session') {
  const res = await fetch(`${UTOE_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId,
    },
    body: JSON.stringify({
      model: 'utoe-auto', // UTOE picks the best model automatically
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Request failed');
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    tokensIn: data.usage.prompt_tokens,
    tokensOut: data.usage.completion_tokens,
    // UTOE metadata
    utoe: data.utoe,
  };
}

async function main() {
  console.log('UTOE OpenAI Proxy Example\n');
  console.log('Checking UTOE is running...');

  try {
    const health = await fetch(`${UTOE_BASE}/health`);
    const hData = await health.json();
    console.log(`✓ UTOE is running (mode: ${hData.mode})\n`);
  } catch {
    console.error('✗ UTOE is not running. Start it with: npx utoe start');
    process.exit(1);
  }

  // Example 1: Simple question
  console.log('--- Example 1: Simple question ---');
  const r1 = await chat('Hey, can you please explain what async/await does in JavaScript? Thank you!');
  console.log(`Response: ${r1.content}`);
  console.log(`Model: ${r1.model} | Saved: ${r1.utoe?.tokens_saved} tokens (${r1.utoe?.savings_pct}%)\n`);

  // Example 2: Code debug
  console.log('--- Example 2: Debug request ---');
  const r2 = await chat('Fix the bug: TypeError: Cannot read properties of undefined (reading "map")');
  console.log(`Response: ${r2.content.slice(0, 200)}...`);
  console.log(`Model: ${r2.model} | Task detected: ${r2.utoe?.task}\n`);

  // Example 3: Streaming
  console.log('--- Example 3: Streaming response ---');
  const streamRes = await fetch(`${UTOE_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'utoe-auto',
      messages: [{ role: 'user', content: 'List 3 benefits of TypeScript in one sentence each.' }],
      stream: true,
    }),
  });

  process.stdout.write('Response: ');
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices?.[0]?.delta?.content;
          if (content) process.stdout.write(content);
        } catch { /* ignore */ }
      }
    }
  }
  console.log('\n');

  // Show savings summary
  const statsRes = await fetch(`${UTOE_BASE}/stats`);
  const stats = await statsRes.json();
  console.log(`--- Session Summary ---`);
  console.log(`Total tokens saved: ${stats.global.tokens_saved}`);
  console.log(`Total requests: ${stats.global.requests}`);
  console.log(`Est. cost saved: $${stats.global.cost_saved_usd}`);
}

main().catch(console.error);
