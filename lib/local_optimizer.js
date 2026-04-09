import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('../lib/local_optimizer.js');
export const runLocalOptimizer = mod.runLocalOptimizer;
//# sourceMappingURL=local_optimizer.js.map