/**
 * UTOE Proxy Server — TypeScript / Hono.js implementation
 *
 * Hono is an ultra-fast web framework for Node.js (and edge runtimes).
 * This file implements the OpenAI-compatible proxy using Hono.
 *
 * Features:
 *  - /v1/chat/completions  — OpenAI-compatible (streaming + non-streaming)
 *  - /v1/models            — Model listing
 *  - /v1/embeddings        — Embeddings proxy
 *  - /ask                  — Native UTOE API
 *  - /suggest, /rewrite, /compress
 *  - /stats, /health
 *  - /                     — Live dashboard
 *
 * Install Hono: npm install hono @hono/node-server
 *
 * @example
 * ```typescript
 * import { createHonoApp, startHonoServer } from './proxy.js';
 * const app = createHonoApp(config);
 * await startHonoServer(app, 8787);
 * ```
 */

import type { UTOEConfig, ChatMessage } from './types.js';
import { buildFlagInjection, injectFlagsIntoMessages, createDefaultSession, EFFORT_PROFILES, type RuntimeFlags, type SessionState } from './command-engine.js';
import { runPrePromptHook, runPostPromptHook } from './terminal-hook.js';

// ─── Hono app factory ─────────────────────────────────────────────────────────

/**
 * Creates a Hono application with all UTOE routes.
 * Falls back to the built-in http server if Hono is not installed.
 */
export async function createHonoApp(config: UTOEConfig) {
  // Dynamic import — Hono is optional, fallback to lib/server.js if missing
  let Hono: any;
  try {
    const mod = await import('hono');
    Hono = mod.Hono;
  } catch {
    throw new Error(
      'Hono not installed. Run: npm install hono @hono/node-server\n' +
      'Or use the built-in server: import { createServer } from "utoe-plugin"'
    );
  }

  const { stream } = await import('hono/streaming');
  const { cors } = await import('hono/cors');

  // Runtime implementations
  const { runPipeline, optimizeMessages } = await import('./pipeline.js');
  const { suggestBetterPrompt, scorePrompt } = await import('./prompt-suggester.js');
  const { memory } = await import('./memory.js');
  const { compress } = await import('./compression.js');
  const { runLocalOptimizer } = await import('./local-optimizer.js');
  const { semanticCache } = await import('./semantic-cache.js');
  const { trackRequest, createGlobalStats } = await import('./dashboard.js');

  // Shared stats object — persists for the lifetime of this server process
  const globalStats = createGlobalStats();

  const app = new Hono();

  // Global middleware
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-session-id', 'anthropic-version'],
  }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', (c: any) => {
    return c.json({
      status: 'ok',
      version: '1.2.0',
      mode: config.mode || 'bridge',
      server: 'hono',
      providers: {
        openai: !!config.OPENAI_API_KEY,
        anthropic: !!config.ANTHROPIC_API_KEY,
        groq: !!config.GROQ_API_KEY,
        gemini: !!config.GEMINI_API_KEY,
        ollama: true,
      },
    });
  });

  // ── OpenAI: POST /v1/chat/completions ───────────────────────────────────────
  app.post('/v1/chat/completions', async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const { messages = [], model, max_tokens, stream: isStream } = body;

    // Extract UTOE-specific flags from request body (non-standard, ignored by OpenAI)
    const utoeFlags: Partial<RuntimeFlags> = {
      disable_mcp: body.utoe_disable_mcp ?? false,
      disable_auto_memory: body.utoe_disable_auto_memory ?? false,
      disable_background_tasks: body.utoe_disable_background_tasks ?? false,
      disable_thinking: body.utoe_disable_thinking ?? false,
      effort: body.utoe_effort ?? 'medium',
      max_output_tokens: body.utoe_max_output_tokens ?? max_tokens ?? null,
      append_system_prompt: body.utoe_append_system_prompt ?? null,
      planning_mode: body.utoe_planning_mode ?? false,
    };

    const userMsg = [...(messages as ChatMessage[])].reverse().find((m) => m.role === 'user');
    if (!userMsg) return c.json({ error: { message: 'no user message', type: 'invalid_request_error' } }, 400);

    // Also check for --append-system-prompt inline flag in user message
    const preHook = runPrePromptHook(
      userMsg.content,
      utoeFlags.effort as 'low' | 'medium' | 'high',
      utoeFlags.append_system_prompt ?? undefined
    );
    if (preHook.appendedSystem) {
      utoeFlags.append_system_prompt = preHook.appendedSystem;
    }

    const sessionKey = c.req.header('x-session-id') || 'proxy_default';
    const utoeSession = createDefaultSession();
    Object.assign(utoeSession.flags, utoeFlags);
    utoeSession.sessionId = sessionKey;
    const sessionState = { ...utoeSession, lastTopic: null };

    // Check semantic cache first (use pre-compressed input)
    const cached = await semanticCache.get(preHook.input);
    if (cached) {
      return c.json(buildOpenAIResponse(cached.response, cached.model, 0, 0, {
        cache_hit: true, tokens_saved: preHook.savedTokens,
      }));
    }

    // Inject runtime flags into messages
    const messagesWithFlags = injectFlagsIntoMessages(
      messages as ChatMessage[],
      utoeSession,
      utoeFlags.append_system_prompt ?? undefined
    );

    const effortProfile = EFFORT_PROFILES[utoeFlags.effort as 'low' | 'medium' | 'high'] ?? EFFORT_PROFILES.medium;

    const cfg = {
      ...config,
      ...(model && model !== 'utoe-auto' && { forceModel: model }),
      outputTokenLimit: utoeFlags.max_output_tokens ?? effortProfile.max_output_tokens,
      executionMode: 'proxy' as const,
    };

    try {
      const result = await runPipeline(messagesWithFlags, cfg, sessionState as any);

      // Post-prompt hook: clean output and route to support files
      const postHook = runPostPromptHook(result.response, process.cwd());

      // Cache the result
      await semanticCache.set(preHook.input, postHook.output, result.model, result.provider);

      // Record stats for dashboard
      trackRequest(globalStats, result);

      if (isStream) {
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('X-UTOE-Saved-Tokens', String(result.savedTokens + preHook.savedTokens));
        c.header('X-UTOE-Provider', result.provider);
        c.header('X-UTOE-Effort', utoeFlags.effort as string);
        if (postHook.storedIn) c.header('X-UTOE-Stored-In', postHook.storedIn);

        return stream(c, async (s: any) => {
          const words = postHook.output.split(' ');
          for (let i = 0; i < words.length; i++) {
            const chunk = {
              id: `chatcmpl-utoe-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: result.model,
              choices: [{ delta: { content: (i === 0 ? '' : ' ') + words[i] }, index: 0, finish_reason: null }],
            };
            await s.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          await s.write('data: [DONE]\n\n');
        });
      }

      return c.json(buildOpenAIResponse(
        postHook.output, result.model, result.inputTokens, result.outputTokens,
        {
          provider: result.provider,
          task: result.task,
          tokens_saved: result.savedTokens + preHook.savedTokens,
          savings_pct: result.savingsPct,
          elapsed_ms: result.elapsedMs,
          effort: utoeFlags.effort,
          stored_in: postHook.storedIn ?? null,
          flags_active: Object.entries(utoeFlags)
            .filter(([k, v]) => v && k.startsWith('disable'))
            .map(([k]) => k),
        }
      ));
    } catch (err: any) {
      return c.json({ error: { message: err.message, type: 'server_error' } }, 500);
    }
  });

  // ── Anthropic: POST /v1/messages (transparent proxy) ────────────────────────
  // Intercepts Anthropic SDK calls (Claude Code, any @anthropic-ai/sdk client).
  // Set ANTHROPIC_BASE_URL=http://localhost:8787 to route through UTOE.
  //
  // Flow:
  //   1. Receive request with caller's auth token (Claude Pro, API key, etc.)
  //   2. Run stages 1-8: compress + memory + token-guard (optimizeMessages)
  //   3. Forward optimized request to real Anthropic API with original auth
  //   4. Stream/return response back to caller transparently
  //   5. Record token savings on dashboard
  app.post('/v1/messages', async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const { messages = [], system, model, max_tokens, stream: isStream } = body;

    // Preserve the caller's original auth header (Claude Pro session or API key)
    const authHeader = c.req.header('authorization') ?? c.req.header('x-api-key') ?? '';
    const anthropicVersion = c.req.header('anthropic-version') ?? '2023-06-01';

    const allMessages: ChatMessage[] = [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      ...(messages as ChatMessage[]),
    ];

    const userMsg = [...allMessages].reverse().find((m) => m.role === 'user');
    if (!userMsg) {
      return c.json({ type: 'error', error: { type: 'invalid_request_error', message: 'no user message' } }, 400);
    }

    const sessionKey = c.req.header('x-session-id') || 'claude_code';
    const utoeSession = createDefaultSession();
    utoeSession.sessionId = sessionKey;

    const cfg = { ...config, ...(model && { forceModel: model }), ...(max_tokens && { outputTokenLimit: max_tokens }) };

    // Stages 1-8: optimize messages (no LLM call)
    const optimized = await optimizeMessages(allMessages, cfg, utoeSession as any).catch(() => ({
      messages: allMessages, savedTokens: 0, savedPct: 0, originalTokens: 0, task: 'general', topic: 'general',
    }));

    // Separate system messages back out for Anthropic format
    const systemMsg = optimized.messages.find(m => m.role === 'system')?.content ?? system ?? undefined;
    const chatMessages = optimized.messages.filter(m => m.role !== 'system');

    // Build forwarded request body
    const forwardBody: Record<string, unknown> = {
      ...body,
      messages: chatMessages,
      ...(systemMsg !== undefined && { system: systemMsg }),
    };

    // Forward to real Anthropic with original auth — Stage 9 handled by Anthropic
    const ANTHROPIC_API = 'https://api.anthropic.com';
    const upstreamRes = await fetch(`${ANTHROPIC_API}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': anthropicVersion,
        ...(authHeader.startsWith('Bearer ') || authHeader.startsWith('sk-')
          ? { Authorization: authHeader }
          : authHeader
            ? { 'x-api-key': authHeader }
            : {}),
      },
      body: JSON.stringify(forwardBody),
    });

    // Record token savings on dashboard (approximate — response not yet read)
    if (optimized.savedTokens > 0) {
      globalStats.totalRequests++;
      globalStats.totalSaved += optimized.savedTokens;
      globalStats.totalTokensIn += optimized.originalTokens;
      if (optimized.task) globalStats.byTask[optimized.task] = (globalStats.byTask[optimized.task] ?? 0) + 1;
    }

    // Add savings headers so callers can observe UTOE's work
    c.header('X-UTOE-Saved-Tokens', String(optimized.savedTokens));
    c.header('X-UTOE-Savings-Pct', String(optimized.savedPct));
    c.header('X-UTOE-Task', optimized.task);

    // Stream: pipe upstream SSE directly back to client
    if (isStream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      return stream(c, async (s: any) => {
        const reader = upstreamRes.body?.getReader();
        if (!reader) { await s.write('data: [DONE]\n\n'); return; }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await s.write(value);
        }
      });
    }

    // Non-streaming: return upstream response body as-is
    const upstreamData = await upstreamRes.json().catch(() => ({}));
    return c.json(upstreamData, upstreamRes.status as any);
  });

  // ── OpenAI: GET /v1/models ──────────────────────────────────────────────────
  app.get('/v1/models', (c: any) => {
    const models: any[] = [
      { id: 'utoe-auto', object: 'model', owned_by: 'utoe', description: 'Auto-selects cheapest adequate model' },
    ];
    if (config.OPENAI_API_KEY) {
      models.push({ id: 'gpt-4o', object: 'model', owned_by: 'openai' });
      models.push({ id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' });
    }
    if (config.ANTHROPIC_API_KEY) {
      models.push({ id: 'claude-sonnet-4-6', object: 'model', owned_by: 'anthropic' });
      models.push({ id: 'claude-haiku-4-5-20251001', object: 'model', owned_by: 'anthropic' });
    }
    if (config.GROQ_API_KEY) {
      models.push({ id: 'llama-3.3-70b-versatile', object: 'model', owned_by: 'groq' });
      models.push({ id: 'llama-3.1-8b-instant', object: 'model', owned_by: 'groq' });
    }
    if (config.GEMINI_API_KEY) {
      models.push({ id: 'gemini-1.5-pro', object: 'model', owned_by: 'google' });
      models.push({ id: 'gemini-1.5-flash', object: 'model', owned_by: 'google' });
    }
    models.push({ id: 'llama3.1', object: 'model', owned_by: 'ollama' });
    models.push({ id: 'llama3.2', object: 'model', owned_by: 'ollama' });
    return c.json({ object: 'list', data: models });
  });

  // ── OpenAI: POST /v1/embeddings ─────────────────────────────────────────────
  app.post('/v1/embeddings', async (c: any) => {
    const { input, model = 'text-embedding-ada-002' } = await c.req.json().catch(() => ({}));
    if (!input) return c.json({ error: { message: 'input required', type: 'invalid_request_error' } }, 400);

    // If OpenAI key available, proxy to OpenAI
    if (config.OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
        body: JSON.stringify({ input, model }),
      });
      const data = await res.json();
      return c.json(data);
    }

    // Fallback: deterministic hash-based pseudo-embedding (1536d zero-vector with hash noise)
    const text = Array.isArray(input) ? input[0] : input;
    const dim = 1536;
    const embedding = new Array(dim).fill(0).map((_, i) => {
      const h = (text.charCodeAt(i % text.length) * (i + 1) * 2654435761) >>> 0;
      return ((h / 0xffffffff) - 0.5) * 0.1;
    });
    return c.json({
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding }],
      model: 'utoe-local-embedding',
      usage: { prompt_tokens: Math.ceil(text.length / 4), total_tokens: Math.ceil(text.length / 4) },
    });
  });

  // ── Native: POST /ask ───────────────────────────────────────────────────────
  app.post('/ask', async (c: any) => {
    const { message, session_id = 'default', provider, force_model } = await c.req.json().catch(() => ({}));
    if (!message) return c.json({ error: 'message required' }, 400);

    const utoeSession = createDefaultSession();
    utoeSession.sessionId = session_id;
    const sessionState = { ...utoeSession, lastTopic: 'general' };
    const messages = [{ role: 'user' as const, content: message }];
    const cfg = { ...config, ...(provider && { provider }), ...(force_model && { forceModel: force_model }) };

    try {
      const result = await runPipeline(messages, cfg, sessionState as any);
      trackRequest(globalStats, result);
      return c.json({
        response: result.response, model_used: result.model, provider: result.provider,
        task: result.task, input_tokens: result.inputTokens, output_tokens: result.outputTokens,
        tokens_saved: result.savedTokens, savings_pct: result.savingsPct, elapsed_ms: result.elapsedMs,
        mode: result.mode, optimized_prompt: result.optimizedPrompt,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ── Native: POST /suggest ───────────────────────────────────────────────────
  app.post('/suggest', async (c: any) => {
    const { message } = await c.req.json().catch(() => ({}));
    if (!message) return c.json({ error: 'message required' }, 400);
    return c.json(suggestBetterPrompt(message));
  });

  // ── Native: POST /rewrite ───────────────────────────────────────────────────
  app.post('/rewrite', async (c: any) => {
    const { message } = await c.req.json().catch(() => ({}));
    if (!message) return c.json({ error: 'message required' }, 400);
    const { optimized, stats } = runLocalOptimizer(message);
    const suggestion = suggestBetterPrompt(message);
    return c.json({
      original: message, cleaned: optimized, structured: suggestion.suggested,
      task_detected: suggestion.task, lang_detected: suggestion.lang,
      tokens_original: stats.originalTokens, tokens_cleaned: stats.optimizedTokens,
      tokens_structured: suggestion.suggestedTokens, best_savings_pct: suggestion.improvementPct,
      prompt_score: scorePrompt(message), why_better: suggestion.whyBetter,
    });
  });

  // ── Native: POST /compress ──────────────────────────────────────────────────
  app.post('/compress', async (c: any) => {
    const { text, lossless, aggressiveCode } = await c.req.json().catch(() => ({}));
    if (!text) return c.json({ error: 'text required' }, 400);
    return c.json(compress(text, { lossless, aggressiveCode }));
  });

  // ── Native: GET /stats ──────────────────────────────────────────────────────
  app.get('/stats', (c: any) => {
    return c.json({ memory: memory.stats(), cache: semanticCache.stats(), pipeline: globalStats });
  });

  // ── Native: POST /forget ────────────────────────────────────────────────────
  app.post('/forget', async (c: any) => {
    const { query = '' } = await c.req.json().catch(() => ({}));
    const removed = memory.forget(query);
    return c.json({ removed, query });
  });

  // ── GET / (dashboard) ───────────────────────────────────────────────────────
  app.get('/', async (c: any) => {
    const { buildDashboardHTML } = await import('./dashboard.js');
    return c.html(buildDashboardHTML(config as any, globalStats));
  });

  return app;
}

/**
 * Start the Hono server using @hono/node-server.
 */
export async function startHonoServer(app: any, port: number): Promise<void> {
  const { serve } = await import('@hono/node-server');
  return new Promise((resolve) => {
    serve({ fetch: app.fetch, port }, (info: any) => {
      console.log(`[UTOE] Hono server running on http://localhost:${info.port}`);
      resolve();
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOpenAIResponse(
  content: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  utoe: Record<string, unknown>
) {
  return {
    id: `chatcmpl-utoe-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    utoe,
  };
}
