/**
 * Universal adapter contract for UTOE tool integrations.
 */

/**
 * @typedef {{ session_id: string, user_id_hash?: string }} SessionIdentity
 * @typedef {{ prompt: string, context?: string[] }} CapturedPrompt
 * @typedef {{ optimized_prompt: string, route_plan: import('../lib/schemas/route-plan.js').RoutePlan }} InjectPayload
 * @typedef {{ input_tokens?: number, output_tokens?: number, latency_ms?: number, provider?: string, model?: string, error_code?: string }} ResponseMeta
 */

export class ToolAdapter {
  name() {
    throw new Error('ToolAdapter.name() not implemented');
  }

  /** @returns {Promise<SessionIdentity>} */
  async sessionIdentity() {
    throw new Error('ToolAdapter.sessionIdentity() not implemented');
  }

  /** @param {unknown} raw */
  async capturePrompt(raw) {
    void raw;
    throw new Error('ToolAdapter.capturePrompt() not implemented');
  }

  /** @param {InjectPayload} payload */
  async injectOptimizedPrompt(payload) {
    void payload;
    throw new Error('ToolAdapter.injectOptimizedPrompt() not implemented');
  }

  /** @param {unknown} raw */
  async captureResponseMeta(raw) {
    void raw;
    throw new Error('ToolAdapter.captureResponseMeta() not implemented');
  }

  /** @param {string} reason */
  async safeBypass(reason) {
    void reason;
    throw new Error('ToolAdapter.safeBypass() not implemented');
  }
}

const REQUIRED_METHODS = [
  'name',
  'sessionIdentity',
  'capturePrompt',
  'injectOptimizedPrompt',
  'captureResponseMeta',
  'safeBypass',
];

export function assertAdapterShape(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Adapter must be an object instance');
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Adapter missing required method: ${method}()`);
    }
  }

  const adapterName = adapter.name();
  if (typeof adapterName !== 'string' || adapterName.length === 0) {
    throw new Error('Adapter.name() must return a non-empty string');
  }
}

export const ADAPTER_REQUIRED_METHODS = REQUIRED_METHODS;
