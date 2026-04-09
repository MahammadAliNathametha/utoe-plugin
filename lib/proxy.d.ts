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
import type { UTOEConfig } from './types.js';
/**
 * Creates a Hono application with all UTOE routes.
 * Falls back to the built-in http server if Hono is not installed.
 */
export declare function createHonoApp(config: UTOEConfig): Promise<any>;
/**
 * Start the Hono server using @hono/node-server.
 */
export declare function startHonoServer(app: any, port: number): Promise<void>;
//# sourceMappingURL=proxy.d.ts.map