/**
 * UTOE Pipeline Tests
 * Tests the 10-stage pipeline in bridge mode (no real LLM calls).
 */

import assert from 'assert';
import { runPipeline, suggestBetterPrompt } from '../lib/pipeline.js';
import { createDefaultSession } from '../lib/command-engine.js';
import { memory } from '../lib/memory.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  ✗ ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\nPipeline Tests\n');

const BRIDGE_CONFIG = {
  mode: 'bridge',
  port: 8787,
  maxTokens: 16000,
  outputTokenLimit: 1024,
  historyWindow: 6,
  maxHistoryTokens: 2000,
};

const promises = [];

// Basic pipeline run — string input shorthand
promises.push(test('pipeline accepts string input and returns valid result', async () => {
  const session = createDefaultSession();
  const result = await runPipeline('Explain what React hooks are', BRIDGE_CONFIG, session);
  assert.ok(result.response,           'should have response');
  assert.ok(result.model,              'should have model');
  assert.ok(result.provider,           'should have provider');
  assert.ok(result.task,               'should have task');
  assert.strictEqual(result.mode, 'bridge', 'should be in bridge mode');
}));

// ChatMessage[] input
promises.push(test('pipeline accepts ChatMessage[] input', async () => {
  const session = createDefaultSession();
  const messages = [{ role: 'user', content: 'What is TypeScript?' }];
  const result = await runPipeline(messages, BRIDGE_CONFIG, session);
  assert.ok(result.response, 'should have response');
}));

// Token savings — filler-heavy input
promises.push(test('pipeline reports token savings for filler-heavy input', async () => {
  const session = createDefaultSession();
  const result = await runPipeline(
    'Hey there! Hope you are doing well. Could you please kindly help me understand how async/await works? Thank you so much!',
    BRIDGE_CONFIG,
    session,
  );
  assert.ok(result.savedTokens >= 0,                         'savedTokens should be non-negative');
  assert.ok(result.savingsPct >= 0 && result.savingsPct <= 100, 'savingsPct should be 0-100');
}));

// Intent detection
promises.push(test('pipeline detects debug task', async () => {
  const session = createDefaultSession();
  const result = await runPipeline('Fix the bug: TypeError: cannot read property of undefined', BRIDGE_CONFIG, session);
  assert.strictEqual(result.task, 'debug', `expected debug, got ${result.task}`);
}));

promises.push(test('pipeline detects summarize task', async () => {
  const session = createDefaultSession();
  const result = await runPipeline('Summarize this article for me', BRIDGE_CONFIG, session);
  assert.strictEqual(result.task, 'summarize', `expected summarize, got ${result.task}`);
}));

// Session history
promises.push(test('pipeline accumulates session history', async () => {
  const session = createDefaultSession();
  await runPipeline('Explain TypeScript interfaces', BRIDGE_CONFIG, session);
  assert.ok(session.history.length >= 2, 'should have at least 2 history entries (user + assistant)');
}));

// Topic shift detection
promises.push(test('pipeline detects topic shifts', async () => {
  const session = createDefaultSession();
  await runPipeline('Explain JavaScript closures in code', BRIDGE_CONFIG, session);
  const result2 = await runPipeline('Write me a blog post about coffee', BRIDGE_CONFIG, session);
  assert.ok(typeof result2.topicShifted === 'boolean', 'topicShifted should be boolean');
}));

// Route plan
promises.push(test('pipeline includes route plan in result', async () => {
  const session = createDefaultSession();
  const result = await runPipeline('Analyze this code architecture', BRIDGE_CONFIG, session);
  assert.ok(result.routePlan,               'should have routePlan');
  assert.ok(result.routePlan.selected,      'routePlan should have selected');
  assert.ok(result.routeConfidence >= 0,    'should have routeConfidence');
}));

// Memory
promises.push(test('pipeline updates memory after response', async () => {
  const session = createDefaultSession();
  await runPipeline('My project is called SuperApp and I am using React', BRIDGE_CONFIG, session);
  const stats = memory.stats();
  assert.ok(typeof stats.longTerm === 'number', 'memory stats should be accessible');
}));

// suggestBetterPrompt — synchronous
test('suggestBetterPrompt returns structured SuggestionResult', () => {
  const result = suggestBetterPrompt('Hey can you please fix the bug in my code?');
  assert.ok(result.original,                          'should have original');
  assert.ok(result.suggested,                         'should have suggested');
  assert.ok(result.task,                              'should have task');
  assert.ok(typeof result.improvementPct === 'number','should have improvementPct');
  assert.ok(Array.isArray(result.whyBetter),          'should have whyBetter array');
});

test('suggestBetterPrompt detects debug task', () => {
  const result = suggestBetterPrompt('Fix the TypeError bug in my React component');
  assert.strictEqual(result.task, 'debug');
});

test('suggestBetterPrompt produces valid JSON suggestion', () => {
  const result = suggestBetterPrompt('Summarize this document');
  assert.doesNotThrow(() => JSON.parse(result.suggested), 'suggested should be valid JSON');
  const parsed = JSON.parse(result.suggested);
  assert.strictEqual(parsed.task, 'summarize');
});

// Large input
promises.push(test('pipeline handles large inputs without crashing', async () => {
  const session = createDefaultSession();
  const bigInput = 'Explain each of these: ' + Array.from({ length: 50 }, (_, i) => `concept${i}`).join(', ');
  const result = await runPipeline(bigInput, BRIDGE_CONFIG, session);
  assert.ok(result.response, 'should handle large input');
}));

// Code blocks
promises.push(test('pipeline handles code blocks', async () => {
  const session = createDefaultSession();
  const codeInput = 'Debug this code:\n```javascript\nfunction foo() {\n  return undefined.bar;\n}\n```';
  const result = await runPipeline(codeInput, BRIDGE_CONFIG, session);
  assert.ok(result.response, 'should handle code blocks');
}));

// Telemetry
promises.push(test('pipeline produces telemetry metadata', async () => {
  const session = createDefaultSession();
  const result = await runPipeline('Test telemetry', BRIDGE_CONFIG, session);
  assert.ok(result.telemetry?.requestId, 'should have requestId');
  assert.ok(result.telemetry?.sessionId, 'should have sessionId');
  assert.ok(result.telemetry?.traceId,   'should have traceId');
}));

await Promise.all(promises);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
