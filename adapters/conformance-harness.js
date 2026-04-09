#!/usr/bin/env node
/**
 * Adapter conformance harness.
 *
 * Usage:
 *   node adapters/conformance-harness.js ./path/to/adapter.js
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { assertAdapterShape } from './contract.js';

function pass(name, detail = '') {
  return { check: name, ok: true, detail };
}

function fail(name, error) {
  return { check: name, ok: false, detail: error instanceof Error ? error.message : String(error) };
}

function normalizeAdapterExport(mod) {
  if (mod?.default && typeof mod.default === 'object') return mod.default;
  if (mod?.default && typeof mod.default === 'function') return mod.default();
  if (mod?.adapter && typeof mod.adapter === 'object') return mod.adapter;
  if (mod?.createAdapter && typeof mod.createAdapter === 'function') return mod.createAdapter();
  throw new Error('Could not find adapter export (default object/function or createAdapter)');
}

async function runCheck(name, fn) {
  try {
    await fn();
    return pass(name);
  } catch (error) {
    return fail(name, error);
  }
}

/**
 * @param {unknown} adapter
 */
export async function runAdapterConformance(adapter) {
  const results = [];

  results.push(await runCheck('shape', async () => {
    assertAdapterShape(adapter);
  }));

  results.push(await runCheck('sessionIdentity()', async () => {
    const identity = await adapter.sessionIdentity();
    if (!identity || typeof identity.session_id !== 'string' || identity.session_id.length === 0) {
      throw new Error('sessionIdentity() must resolve { session_id: string }');
    }
  }));

  results.push(await runCheck('capturePrompt()', async () => {
    const captured = await adapter.capturePrompt({ prompt: 'test prompt', context: [] });
    if (!captured || typeof captured.prompt !== 'string') {
      throw new Error('capturePrompt() must resolve { prompt: string }');
    }
  }));

  results.push(await runCheck('injectOptimizedPrompt()', async () => {
    await adapter.injectOptimizedPrompt({
      optimized_prompt: 'optimized prompt',
      route_plan: {
        request_id: 'req_test',
        trace_id: 'trace_test',
        router_policy_version: 'v1.0.0',
        selected: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          compression_level: 'lossless',
          memory_budget_tokens: 500,
          context_budget_tokens: 1200,
          max_output_tokens: 400
        },
        candidates_ranked: [
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            score: 1,
            predicted_latency_ms: 300,
            predicted_cost_per_1k_usd: 0.001,
            predicted_quality_risk: 0.1
          }
        ],
        fallback_chain: [{ provider: 'openai', model: 'gpt-4o-mini' }],
        confidence: 0.92,
        conservative_override: false
      }
    });
  }));

  results.push(await runCheck('captureResponseMeta()', async () => {
    const meta = await adapter.captureResponseMeta({});
    if (meta && typeof meta !== 'object') {
      throw new Error('captureResponseMeta() must resolve an object');
    }
  }));

  results.push(await runCheck('safeBypass()', async () => {
    await adapter.safeBypass('conformance test');
  }));

  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node adapters/conformance-harness.js ./path/to/adapter.js');
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), target);
  const mod = await import(pathToFileURL(absPath).href);
  const adapter = await normalizeAdapterExport(mod);
  const report = await runAdapterConformance(adapter);

  for (const r of report.results) {
    if (r.ok) {
      console.log(`PASS ${r.check}`);
    } else {
      console.log(`FAIL ${r.check} -> ${r.detail}`);
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
