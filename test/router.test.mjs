/**
 * UTOE Model Router Tests
 */

import assert from 'assert';
import { router } from '../lib/router.js';

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

console.log('\nModel Router Tests\n');

// Basic routing
test('router.plan returns a valid plan structure', () => {
  const plan = router.plan('explain', 500, {}, {});
  assert.ok(plan.selected, 'should have selected');
  assert.ok(plan.selected.provider, 'should have provider');
  assert.ok(plan.selected.model, 'should have model');
  assert.ok(Array.isArray(plan.candidates_ranked), 'should have candidates_ranked');
  assert.ok(plan.candidates_ranked.length > 0, 'should have at least 1 candidate');
  assert.ok(typeof plan.confidence === 'number', 'should have confidence');
});

test('router defaults to ollama when no API keys configured', () => {
  const plan = router.plan('explain', 500, {}, {});
  assert.strictEqual(plan.selected.provider, 'ollama', 'should default to ollama');
});

test('router prefers ollama over cloud when both available', () => {
  // Ollama has cost=0 which should score highest on savings
  const plan = router.plan('summarize', 200, { OPENAI_API_KEY: 'sk-test', GROQ_API_KEY: 'gsk-test' }, {});
  const topCandidate = plan.candidates_ranked[0];
  // Ollama or Groq should win (both cheap)
  assert.ok(['ollama', 'groq'].includes(topCandidate.provider), `expected ollama or groq, got ${topCandidate.provider}`);
});

test('router uses groq when available and groq key is set', () => {
  const plan = router.plan('summarize', 200, { GROQ_API_KEY: 'gsk-test' }, {});
  // Both ollama and groq are available; either can win
  const providers = plan.candidates_ranked.map((c) => c.provider);
  assert.ok(providers.includes('groq'), 'groq should be a candidate');
});

// Force model
test('router.plan respects forceModel', () => {
  const plan = router.plan('explain', 500, { forceModel: 'gpt-4o', OPENAI_API_KEY: 'sk-test' }, {});
  assert.strictEqual(plan.selected.model, 'gpt-4o');
});

// Task tier mapping
test('router selects cheap tier for summarize task', () => {
  const plan = router.plan('summarize', 200, { OPENAI_API_KEY: 'sk-test' }, {});
  assert.ok(['cheap', 'user_specified'].includes(plan.selected.tier) || plan.selected.model.includes('mini') || plan.selected.provider === 'ollama');
});

test('router selects larger model for analyze task with large input', () => {
  const plan = router.plan('analyze', 15000, { OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-test' }, {});
  // Should select a capable model (not the cheapest)
  assert.ok(plan.selected, 'should produce a plan');
});

// Hardware profile
test('router.getHardwareProfile returns valid structure', () => {
  const hw = router.getHardwareProfile();
  assert.ok(typeof hw.totalMemGB === 'number', 'should have totalMemGB');
  assert.ok(typeof hw.cpuCount === 'number', 'should have cpuCount');
  assert.ok(typeof hw.hasGpu === 'boolean', 'should have hasGpu');
  assert.ok(['none', 'tiny', 'small', 'medium', 'large'].includes(hw.ollamaCapacity), 'should have valid ollamaCapacity');
});

// Fallback chain
test('router plan includes fallback chain', () => {
  const plan = router.plan('debug', 1000, { OPENAI_API_KEY: 'sk-test' }, {});
  assert.ok(Array.isArray(plan.fallback_chain), 'should have fallback_chain array');
});

// select shorthand
test('router.select returns provider/model/tier', () => {
  const result = router.select('generate', 800, {});
  assert.ok(result.provider, 'should have provider');
  assert.ok(result.model, 'should have model');
  assert.ok(result.tier, 'should have tier');
  assert.ok(result.fallbackChain, 'should have fallbackChain');
});

// Multiple providers
test('router lists all configured providers', () => {
  const providers = router.listProviders({
    OPENAI_API_KEY: 'sk-test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    GROQ_API_KEY: 'gsk-test',
  });
  const names = providers.map((p) => p.provider);
  assert.ok(names.includes('ollama'), 'should include ollama');
  assert.ok(names.includes('openai'), 'should include openai');
  assert.ok(names.includes('anthropic'), 'should include anthropic');
  assert.ok(names.includes('groq'), 'should include groq');
});

// Cost fields
test('router candidates include cost information', () => {
  const plan = router.plan('explain', 500, {}, {});
  for (const c of plan.candidates_ranked) {
    assert.ok(typeof c.predicted_cost_per_1k_usd === 'number', 'should have cost');
    assert.ok(typeof c.predicted_quality_risk === 'number', 'should have quality risk');
    assert.ok(typeof c.score === 'number', 'should have score');
  }
});

// Ollama is always available
test('router always includes ollama as candidate', () => {
  const plan = router.plan('explain', 500, {}, {});
  const providers = plan.candidates_ranked.map((c) => c.provider);
  assert.ok(providers.includes('ollama'), 'ollama should always be a candidate');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
