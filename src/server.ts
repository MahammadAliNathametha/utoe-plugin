/**
 * UTOE Server — Node.js HTTP server entry point.
 *
 * Creates a Node.js http.Server powered by the Hono app in proxy.ts.
 * The server is returned unstarted — call server.listen(port, cb) to bind.
 *
 * @example
 * ```typescript
 * import { createServer } from 'utoe-plugin';
 * const server = await createServer({ port: 8787, UTOE_MODE: 'bridge' });
 * server.listen(8787, () => console.log('UTOE running'));
 * ```
 */

import type { UTOEConfig } from './types.js';
import { createHonoApp } from './proxy.js';

export { createHonoApp, startHonoServer } from './proxy.js';

/**
 * Create an unstarted Node.js HTTP server backed by the UTOE Hono app.
 * Uses @hono/node-server's createAdaptorServer under the hood.
 */
export async function createServer(config: UTOEConfig) {
  const { createAdaptorServer } = await import('@hono/node-server');
  const app = await createHonoApp(config);
  return createAdaptorServer({ fetch: app.fetch });
}
