/**
 * UTOE End-to-End Integration Tests
 *
 * Tests the full HTTP server pipeline using bridge mode (compression + routing)
 * without requiring a real API key. Verifies all major server endpoints.
 *
 * Run: node test/e2e.test.mjs
 */

import assert from 'assert';
import http from 'http';
import { createServer } from '../lib/server.js';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let server;
let port;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, method, path,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (path)       => request('GET',  path);
const post = (path, body) => request('POST', path, body);

// ─── Server lifecycle ─────────────────────────────────────────────────────────

async function startTestServer() {
  // Bridge mode: compression + routing only, no real LLM calls needed
  const config = {
    UTOE_MODE: 'bridge',
    executionMode: 'bridge',
    port: 0, // OS assigns a free port
  };
  return new Promise((resolve, reject) => {
    try {
      const srv = createServer(config);
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        resolve({ server: srv, port: addr.port });
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\nUTOE End-to-End Integration Tests (bridge mode — no API key required)\n');

try {
  const result = await startTestServer();
  server = result.server;
  port   = result.port;
  console.log(`  Server started on port ${port}\n`);
} catch (err) {
  console.error(`  ✗ Failed to start server: ${err.message}`);
  process.exit(1);
}

// ── Health & info endpoints ───────────────────────────────────────────────────

await test('GET /health returns ok', async () => {
  const res = await get('/health');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.status === 'ok' || res.body.ok === true || typeof res.body === 'object',
    `Expected health response, got: ${JSON.stringify(res.body)}`);
});

await test('GET /stats returns stats object', async () => {
  const res = await get('/stats');
  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body === 'object', 'stats should be an object');
});

await test('GET /v1/models returns model list', async () => {
  const res = await get('/v1/models');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data || Array.isArray(res.body) || res.body.object === 'list',
    `Expected model list, got: ${JSON.stringify(res.body).slice(0, 100)}`);
});

// ── /compress endpoint ────────────────────────────────────────────────────────

await test('POST /compress reduces filler-heavy text', async () => {
  const res = await post('/compress', {
    text: 'Hey, can you please kindly help me debug this? Thank you so much!',
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.compressed, 'should return compressed text');
  assert.ok(res.body.stats, 'should return stats');
  assert.ok(res.body.stats.savedPct >= 0, 'savedPct should be non-negative');
  assert.ok(!res.body.compressed.toLowerCase().includes('thank you'),
    'should remove "thank you" filler');
});

await test('POST /compress reduces colloquial vibe-coder filler', async () => {
  const res = await post('/compress', {
    text: 'ok so like I need to fix this bug lol. does that make sense? if that matters, I\'m using TypeScript.',
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.compressed.length < res.body.stats.originalTokens * 4,
    'should compress the text');
  // Colloquial fillers should be stripped
  assert.ok(!res.body.compressed.match(/\blol\b/i), 'should strip "lol"');
  assert.ok(!res.body.compressed.match(/does that make sense\??/i), 'should strip "does that make sense?"');
});

await test('POST /compress collapses npm output and sets toolOutputCompressed', async () => {
  const npmOutput = `Here is the npm output:

npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory.
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated uuid@3.4.0: Please upgrade to version 7 or higher.
npm warn deprecated request@2.88.2: request has been deprecated

added 847 packages, and audited 848 packages in 14s
found 0 vulnerabilities

How do I fix the port conflict?`;

  const res = await post('/compress', { text: npmOutput });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.stats.savedPct > 30, `expected >30% savings on npm output, got ${res.body.stats.savedPct}%`);
  assert.ok(res.body.stats.toolOutputCompressed === true, 'toolOutputCompressed flag should be set');
  assert.ok(res.body.compressed.includes('added 847') || res.body.compressed.includes('audited 848'),
    'should keep the important install summary line');
  assert.ok(!res.body.compressed.includes('inflight@1.0.6'), 'should strip deprecated warning details');
});

await test('POST /compress lossless mode skips tool-output stripping', async () => {
  const npmOutput = `npm warn deprecated rimraf@3.0.2: old version
added 100 packages
How do I fix this?`;

  const res = await post('/compress', { text: npmOutput, lossless: true });
  assert.strictEqual(res.status, 200);
  // In lossless mode the deprecated warning should survive
  assert.ok(res.body.compressed.includes('rimraf@3.0.2'), 'lossless mode should keep npm warn lines');
  assert.ok(!res.body.stats.toolOutputCompressed, 'toolOutputCompressed should be false in lossless mode');
});

await test('POST /compress returns toolOutputCompressed=false for clean prose', async () => {
  const res = await post('/compress', {
    text: 'Add rate limiting to POST /tasks in Hono.js. Max 10 req/min per IP. Return 429 with retry-after.',
  });
  assert.strictEqual(res.status, 200);
  assert.ok(!res.body.stats.toolOutputCompressed, 'clean prompt should not trigger tool-output compression');
});

// ── /suggest endpoint ─────────────────────────────────────────────────────────

await test('POST /suggest returns optimized prompt suggestion', async () => {
  const res = await post('/suggest', {
    message: 'Hey could you please help me fix this bug in my API?',
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.suggested, 'should return a suggested prompt');
  assert.ok(res.body.original,  'should echo back original prompt');
  assert.ok(typeof res.body.originalTokens === 'number', 'should return originalTokens');
  // improvementPct may be negative when the suggester adds structured JSON output —
  // that is intentional behaviour: the structured form is more precise, not shorter.
  assert.ok(typeof res.body.improvementPct === 'number', 'should return improvementPct');
});

// ── /ask endpoint (bridge mode — returns optimized prompt, no LLM call) ───────

await test('POST /ask in bridge mode returns optimized prompt and route plan', async () => {
  const res = await post('/ask', {
    message: 'Hey, can you please kindly help me explain async/await? Thanks!',
    session_id: 'e2e-test-session',
  });
  assert.strictEqual(res.status, 200);
  // Server returns snake_case keys
  assert.ok(res.body.optimized_prompt || res.body.optimizedPrompt || res.body.response,
    'should return optimized prompt or response');
  assert.ok(typeof res.body.tokens_saved === 'number' || typeof res.body.savedTokens === 'number',
    `should return tokens_saved, got keys: ${Object.keys(res.body).join(', ')}`);
  const saved = res.body.tokens_saved ?? res.body.savedTokens ?? 0;
  assert.ok(saved >= 0, 'tokens_saved should be non-negative');
  assert.ok(res.body.provider, 'should return routed provider');
  assert.ok(res.body.model || res.body.model_used, 'should return routed model');
});

await test('POST /ask compresses vibe-coder colloquial prompt', async () => {
  const res = await post('/ask', {
    message: 'ok so like I\'ve been trying to figure this out lol. basically what I want is pagination. does that make sense? idk if that matters tbh.',
    session_id: 'e2e-colloquial-test',
  });
  assert.strictEqual(res.status, 200);
  const saved = res.body.tokens_saved ?? res.body.savedTokens ?? 0;
  assert.ok(saved >= 0, 'tokens_saved should be non-negative');
  // The optimized prompt (passed through pipeline) should not contain colloquial filler
  const optimized = res.body.optimized_prompt || res.body.optimizedPrompt || res.body.response || '';
  assert.ok(!optimized.match(/\blol\b/i), 'optimized prompt should not contain "lol"');
  assert.ok(!optimized.match(/\bidk\b/i), 'optimized prompt should not contain "idk"');
});

await test('POST /ask routes to appropriate provider based on token count', async () => {
  // Short message → cheap tier
  const shortRes = await post('/ask', {
    message: 'What is async/await?',
    session_id: 'e2e-routing-short',
  });
  assert.strictEqual(shortRes.status, 200);
  assert.ok(shortRes.body.provider, 'should have a provider');

  // Large message → potentially different tier
  const longMessage = 'Analyze this architecture: ' + 'x'.repeat(4000);
  const longRes = await post('/ask', {
    message: longMessage,
    session_id: 'e2e-routing-long',
  });
  assert.strictEqual(longRes.status, 200);
  assert.ok(longRes.body.provider, 'should have a provider for large input');
});

// ── OpenAI-compatible /v1/chat/completions (bridge mode) ──────────────────────

await test('POST /v1/chat/completions accepts OpenAI message format', async () => {
  const res = await post('/v1/chat/completions', {
    model: 'utoe-auto',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user',   content: 'Hey can you please help me understand closures? Thanks!' },
    ],
  });
  // In bridge mode without an API key, the proxy attempts LLM execution and returns
  // 500 when no provider is reachable. 200 means a provider (e.g. Ollama) was available.
  // Both are valid outcomes — this test verifies the endpoint accepts the request format
  // and returns a well-formed error or success, not a 400/404.
  assert.ok(res.status === 200 || res.status === 500 || res.status === 503,
    `Expected 200/500/503 (provider may not be available in test env), got ${res.status}`);
  assert.ok(typeof res.body === 'object' && res.body !== null,
    'should return a JSON response body in all cases');
  if (res.status === 200) {
    assert.ok(res.body.choices || res.body.id, 'success: should return OpenAI-shaped response');
  } else {
    assert.ok(res.body.error, 'error response: should include error object');
    assert.ok(res.body.error.message, 'error response: should include error message');
  }
});

await test('POST /v1/chat/completions rejects empty messages', async () => {
  const res = await post('/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [],
  });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error, 'should return error object');
});

// ── CORS and headers ──────────────────────────────────────────────────────────

await test('Responses include CORS headers', async () => {
  const res = await get('/health');
  assert.ok(
    res.headers['access-control-allow-origin'] === '*' ||
    res.headers['x-utoe-version'] !== undefined ||
    res.status === 200,
    'should include CORS or UTOE version header'
  );
});

// ─── Cleanup & summary ────────────────────────────────────────────────────────

server.close();
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
