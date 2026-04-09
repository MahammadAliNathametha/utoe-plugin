import { detectBridgeAdapter, resolveBridgeAdapter } from '../adapters/bridge-adapters.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} -> ${error.message}`);
    process.exitCode = 1;
  }
}

run('detect claude payload', () => {
  const payload = { prompt: 'please explain this function' };
  assert(detectBridgeAdapter(payload) === 'claude', 'expected claude');
});

run('detect codex payload (input)', () => {
  const payload = { input: 'summarize this architecture' };
  assert(detectBridgeAdapter(payload) === 'codex', 'expected codex');
});

run('detect codex payload (messages)', () => {
  const payload = { messages: [{ role: 'user', content: 'debug this bug' }] };
  assert(detectBridgeAdapter(payload) === 'codex', 'expected codex for messages payload');
});

run('detect cursor payload', () => {
  const payload = { text: 'rewrite this prompt' };
  assert(detectBridgeAdapter(payload) === 'cursor', 'expected cursor');
});

run('claude capture/inject', () => {
  const payload = { prompt: 'please please optimize this prompt' };
  const adapter = resolveBridgeAdapter(payload, 'claude');
  const prompt = adapter.capturePrompt(payload);
  assert(prompt.includes('optimize'), 'capture failed');
  const out = adapter.injectOptimizedPrompt(payload, 'optimized prompt');
  assert(out.prompt === 'optimized prompt', 'inject failed');
});

run('codex capture/inject from input', () => {
  const payload = { input: 'please optimize this codex input' };
  const adapter = resolveBridgeAdapter(payload, 'codex');
  const prompt = adapter.capturePrompt(payload);
  assert(prompt.includes('codex'), 'capture failed');
  const out = adapter.injectOptimizedPrompt(payload, 'optimized codex prompt');
  assert(out.input === 'optimized codex prompt', 'inject input failed');
});

run('codex capture/inject from messages', () => {
  const payload = {
    messages: [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'please optimize this from messages' },
    ],
  };
  const adapter = resolveBridgeAdapter(payload, 'codex');
  const prompt = adapter.capturePrompt(payload);
  assert(prompt.includes('messages'), 'capture from messages failed');
  const out = adapter.injectOptimizedPrompt(payload, 'optimized message prompt');
  assert(out.messages[1].content === 'optimized message prompt', 'inject messages failed');
});

run('cursor capture/inject from text', () => {
  const payload = { text: 'please optimize cursor text' };
  const adapter = resolveBridgeAdapter(payload, 'cursor');
  const prompt = adapter.capturePrompt(payload);
  assert(prompt.includes('cursor'), 'capture failed');
  const out = adapter.injectOptimizedPrompt(payload, 'optimized cursor prompt');
  assert(out.text === 'optimized cursor prompt', 'inject text failed');
});

run('explicit adapter override takes precedence', () => {
  const payload = { prompt: 'this looks like claude but force codex' };
  const adapter = resolveBridgeAdapter(payload, 'codex');
  const out = adapter.injectOptimizedPrompt(payload, 'forced codex payload');
  assert(out.input === 'forced codex payload', 'explicit override failed');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
