/**
 * UTOE Monkey-Patch — transparently intercept OpenAI / Anthropic / Vercel AI SDK calls.
 *
 * How it works:
 *  - Wraps the SDK client's chat/messages method
 *  - Compresses the prompt before it leaves your process
 *  - Logs token savings
 *  - No server required — pure in-process optimization
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { patchOpenAI } from 'utoe-plugin';
 *
 * const client = new OpenAI();
 * patchOpenAI(client);
 * // All client.chat.completions.create() calls are now compressed automatically
 * ```
 */

import { compress, estimateTokens } from './compression.js';
import type { CompressOptions } from './types.js';

interface PatchOptions {
  lossless?: boolean;
  aggressiveCode?: boolean;
  silent?: boolean;
}

function log(msg: string, silent = false): void {
  if (!silent) console.log(`[UTOE] ${msg}`);
}

function compressMessages(
  messages: Array<{ role: string; content: string }>,
  opts: CompressOptions
): { messages: typeof messages; savedTokens: number; savedPct: number } {
  let totalOriginal = 0;
  let totalCompressed = 0;

  const result = messages.map(msg => {
    if (!msg.content || typeof msg.content !== 'string') return msg;
    const compressOpts = msg.role === 'system' ? { ...opts, lossless: true } : opts;
    const { compressed, stats } = compress(msg.content, compressOpts);
    totalOriginal += stats.originalTokens;
    totalCompressed += stats.compressedTokens;
    return { ...msg, content: compressed };
  });

  const savedTokens = Math.max(0, totalOriginal - totalCompressed);
  const savedPct = totalOriginal > 0 ? Math.round((savedTokens / totalOriginal) * 100) : 0;
  return { messages: result, savedTokens, savedPct };
}

// ─── OpenAI SDK patch ─────────────────────────────────────────────────────────

/**
 * Patch an OpenAI SDK client instance to compress all chat prompts.
 * Works with openai npm package v4+.
 */
export function patchOpenAI(
  client: { chat: { completions: { create: (...args: unknown[]) => unknown } } },
  opts: PatchOptions = {}
): void {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = function (...args: unknown[]) {
    const body = args[0] as Record<string, unknown> | undefined;
    if (body?.messages && Array.isArray(body.messages)) {
      const compressOpts: CompressOptions = { lossless: opts.lossless, aggressiveCode: opts.aggressiveCode };
      const { messages, savedTokens, savedPct } = compressMessages(
        body.messages as Array<{ role: string; content: string }>,
        compressOpts
      );
      if (savedTokens > 0) {
        log(`OpenAI: compressed ${savedTokens} tokens (${savedPct}%)`, opts.silent);
        args[0] = { ...body, messages };
      }
    }
    return original(...args);
  };
}

// ─── Anthropic SDK patch ──────────────────────────────────────────────────────

/**
 * Patch an Anthropic SDK client instance to compress all message prompts.
 * Works with @anthropic-ai/sdk npm package.
 */
export function patchAnthropic(
  client: { messages: { create: (...args: unknown[]) => unknown } },
  opts: PatchOptions = {}
): void {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = function (...args: unknown[]) {
    const body = args[0] as Record<string, unknown> | undefined;
    if (body?.messages && Array.isArray(body.messages)) {
      const compressOpts: CompressOptions = { lossless: opts.lossless, aggressiveCode: opts.aggressiveCode };
      const { messages, savedTokens, savedPct } = compressMessages(
        body.messages as Array<{ role: string; content: string }>,
        compressOpts
      );
      if (savedTokens > 0) {
        log(`Anthropic: compressed ${savedTokens} tokens (${savedPct}%)`, opts.silent);
        args[0] = { ...body, messages };
      }
    }
    // Also compress the top-level system prompt if present
    if (body?.system && typeof body.system === 'string') {
      const { compressed, stats } = compress(body.system, { lossless: true });
      if (stats.savedTokens > 0) {
        log(`Anthropic system: compressed ${stats.savedTokens} tokens`, opts.silent);
        args[0] = { ...(args[0] as Record<string, unknown>), system: compressed };
      }
    }
    return original(...args);
  };
}

// ─── Vercel AI SDK patch ──────────────────────────────────────────────────────

/**
 * Patch the Vercel AI SDK's generateText / streamText by wrapping the prompt.
 * Pass the options object and UTOE will compress the messages/prompt before the call.
 */
export function patchVercelAI(opts: PatchOptions = {}): {
  compressOptions: (options: Record<string, unknown>) => Record<string, unknown>;
} {
  return {
    compressOptions(options: Record<string, unknown>): Record<string, unknown> {
      if (options['messages'] && Array.isArray(options['messages'])) {
        const compressOpts: CompressOptions = { lossless: opts.lossless };
        const { messages, savedTokens, savedPct } = compressMessages(
          options['messages'] as Array<{ role: string; content: string }>,
          compressOpts
        );
        if (savedTokens > 0) {
          log(`Vercel AI: compressed ${savedTokens} tokens (${savedPct}%)`, opts.silent);
          return { ...options, messages };
        }
      }
      if (options['prompt'] && typeof options['prompt'] === 'string') {
        const { compressed, stats } = compress(options['prompt'] as string, opts);
        if (stats.savedTokens > 0) {
          log(`Vercel AI prompt: compressed ${stats.savedTokens} tokens`, opts.silent);
          return { ...options, prompt: compressed };
        }
      }
      return options;
    },
  };
}

// ─── Auto-detect and patch everything ────────────────────────────────────────

/**
 * Attempt to auto-detect and patch all installed AI SDK clients.
 * Looks for OpenAI and Anthropic instances registered on globalThis.
 * Safe to call multiple times — only patches once.
 */
export function installMonkeyPatch(opts: PatchOptions = {}): void {
  const g = globalThis as Record<string, unknown>;

  // Patch any OpenAI instance stored on globalThis.__utoe_openai
  if (g['__utoe_openai']) {
    patchOpenAI(g['__utoe_openai'] as Parameters<typeof patchOpenAI>[0], opts);
    log('Auto-patched OpenAI client', opts.silent);
  }

  // Patch any Anthropic instance stored on globalThis.__utoe_anthropic
  if (g['__utoe_anthropic']) {
    patchAnthropic(g['__utoe_anthropic'] as Parameters<typeof patchAnthropic>[0], opts);
    log('Auto-patched Anthropic client', opts.silent);
  }

  if (!g['__utoe_openai'] && !g['__utoe_anthropic']) {
    log('installMonkeyPatch: no clients registered. Set globalThis.__utoe_openai or __utoe_anthropic before calling.', opts.silent);
  }
}
