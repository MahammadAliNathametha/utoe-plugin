export default {
  name() {
    return 'mock';
  },
  async sessionIdentity() {
    return { session_id: 'session_mock' };
  },
  async capturePrompt(raw) {
    return { prompt: String(raw?.prompt || ''), context: raw?.context || [] };
  },
  async injectOptimizedPrompt(_payload) {
    return;
  },
  async captureResponseMeta() {
    return { input_tokens: 10, output_tokens: 20, latency_ms: 30, provider: 'openai', model: 'gpt-4o-mini' };
  },
  async safeBypass() {
    return;
  }
};
