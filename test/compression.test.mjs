/**
 * UTOE Compression Engine Tests
 */

import assert from 'assert';
import { compress, estimateTokens, compressMessages } from '../lib/compression.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\nCompression Engine Tests\n');

// Token estimation
test('estimateTokens returns 0 for empty string', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens(null), 0);
});

test('estimateTokens approximates correctly', () => {
  const tokens = estimateTokens('Hello world, this is a test sentence.');
  assert.ok(tokens >= 6 && tokens <= 12, `Expected 6-12 tokens, got ${tokens}`);
});

// Filler removal
test('compress removes filler phrases', () => {
  const input = 'Hey, can you please help me explain what React hooks are?';
  const { compressed } = compress(input);
  assert.ok(!compressed.includes('Hey,'), 'should remove Hey,');
  assert.ok(!compressed.includes('can you please'), 'should remove can you please');
});

test('compress removes thank you phrases', () => {
  const input = 'Explain closures in JavaScript. Thank you!';
  const { compressed } = compress(input);
  assert.ok(!compressed.toLowerCase().includes('thank you'), 'should remove thank you');
});

// Deduplication
test('compress deduplicates repeated sentences', () => {
  const input = 'This is a sentence. This is a sentence. Some other content here.';
  const { compressed } = compress(input);
  const count = (compressed.match(/This is a sentence/g) || []).length;
  assert.ok(count <= 1, `Expected at most 1 duplicate, got ${count}`);
});

// Stats
test('compress returns accurate stats', () => {
  const input = 'Hey, could you please kindly help me explain what async/await does? Thank you so much!';
  const { stats } = compress(input);
  assert.ok(stats.originalTokens > 0, 'originalTokens should be positive');
  assert.ok(stats.compressedTokens <= stats.originalTokens, 'compressedTokens should be <= original');
  assert.ok(stats.savedPct >= 0 && stats.savedPct <= 100, 'savedPct should be 0-100');
  assert.ok(Array.isArray(stats.layers), 'layers should be array');
});

// Short text passthrough
test('compress passes through short text unchanged', () => {
  const input = 'Hi';
  const { compressed } = compress(input);
  assert.strictEqual(compressed, input);
});

// JSON SmartCrusher
test('compress crushes large JSON arrays', () => {
  const arr = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item${i}`, value: i * 10 }));
  const input = `Here is the data: ${JSON.stringify(arr, null, 2)}`;
  const { stats } = compress(input);
  assert.ok(stats.savedTokens > 0, 'should save tokens on large JSON');
});

// Code block summarization
test('compress summarizes very large code blocks', () => {
  const bigCode = '```javascript\n' + Array.from({ length: 250 }, (_, i) => `const var${i} = ${i};`).join('\n') + '\n```';
  const { compressed } = compress(bigCode);
  assert.ok(compressed.length < bigCode.length, 'should shorten large code block');
  assert.ok(compressed.includes('[Code:'), 'should add summary marker');
});

// Lossless mode
test('compress lossless mode skips clause removal', () => {
  const input = 'Of course, as I mentioned earlier, basically you need to install npm.';
  const { compressed: lossless } = compress(input, { lossless: true });
  const { compressed: lossy } = compress(input, { lossless: false });
  assert.ok(lossless.length >= lossy.length, 'lossless should not remove more than lossy');
});

// compressMessages
test('compressMessages processes message arrays', () => {
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hey, can you please help me understand how async/await works in JavaScript? Thank you!' },
  ];
  const { messages: compressed, totalSaved } = compressMessages(messages);
  assert.strictEqual(compressed.length, messages.length, 'should preserve message count');
  assert.ok(totalSaved >= 0, 'totalSaved should be non-negative');
});

// Git log compression
test('compress handles git log output', () => {
  const gitLog = Array.from({ length: 15 }, (_, i) =>
    `commit ${'a'.repeat(40)}\nAuthor: Dev <dev@example.com>\nDate: Mon Jan ${i + 1} 2024\n\n    Fix issue #${i}\n`
  ).join('\n');
  const { stats } = compress(gitLog, { toolOutputs: true });
  assert.ok(stats.savedTokens > 0, 'should compress git log');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
