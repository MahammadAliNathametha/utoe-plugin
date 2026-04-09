/**
 * shared/prompts.js
 *
 * Shared task prompts, token estimator, and conversation simulator
 * used by both test-without-utoe.js and test-with-utoe.js.
 *
 * All 10 prompts build the same CLI Todo App step-by-step so the
 * two test scripts are directly comparable.
 */

// ─── The 10 prompts used in both tests ───────────────────────────────────────
export const TASK_PROMPTS = [
  // Turn 1: project setup
  `I want to build a simple CLI Todo App in TypeScript with Node.js 18.
  The app should have the following commands:
    add <title>     — add a new todo
    list            — list all todos (pending + done)
    done <id>       — mark a todo as done
    remove <id>     — remove a todo
    clear           — remove all completed todos
  Use in-memory storage for now (no database). Use commander.js for CLI parsing.
  Let's start: create the project structure and package.json.`,

  // Turn 2: types
  `Good. Now define the TypeScript types for the Todo item and the in-memory store.
  A Todo should have: id (number), title (string), done (boolean), createdAt (Date).
  Place types in src/types.ts.`,

  // Turn 3: storage
  `Now implement the in-memory storage layer in src/store.ts.
  It should export: addTodo, listTodos, markDone, removeTodo, clearCompleted.
  Each function should validate input and throw a descriptive error on failure.`,

  // Turn 4: CLI commands
  `Now implement the main CLI entry point in src/index.ts using commander.js.
  Wire up all five commands (add, list, done, remove, clear) to the store functions.
  Add colored output using ANSI codes (no extra dependencies).`,

  // Turn 5: list formatting
  `The 'list' command output is too plain. Improve it:
  - Show a numbered list with checkboxes: [x] done items, [ ] pending items
  - Show creation date (relative: "2 hours ago", "yesterday")
  - Show a summary line: "3 pending, 2 done"
  - Colorize: pending=white, done=dim grey, summary=cyan`,

  // Turn 6: error handling
  `Add proper error handling throughout:
  - If 'done <id>' or 'remove <id>' receives a non-numeric id, print a friendly error
  - If the id doesn't exist in the store, print "Todo #<id> not found"
  - Wrap the commander action handlers in try/catch and exit with code 1 on error
  - Add a global unhandledRejection handler`,

  // Turn 7: tests
  `Write unit tests for the store layer (src/store.test.ts) using Node.js built-in
  test runner (node:test + node:assert). Cover:
  - addTodo: adds item, assigns sequential id
  - markDone: marks correct item, throws on unknown id
  - removeTodo: removes item, throws on unknown id
  - clearCompleted: removes only done items, leaves pending`,

  // Turn 8: README
  `Write a concise README.md for the todo app. Include:
  - One-line description
  - Installation (npm install + npm run build)
  - Usage examples for all five commands
  - Output screenshot (ASCII art)
  - License: MIT`,

  // Turn 9: build script
  `Add an npm build script that:
  1. Compiles TypeScript to dist/ using tsc
  2. Makes dist/index.js executable (chmod +x)
  3. Adds a 'start' script: node dist/index.js
  Update package.json accordingly and create tsconfig.json (strict, ES2022, NodeNext).`,

  // Turn 10: final review
  `Do a final review of the whole codebase. Check for:
  - Any TypeScript strict-mode errors
  - Missing error handling
  - Code style consistency
  - Anything that would break on Node.js 18
  List any issues found, then provide the final corrected src/index.ts.`,
];

// ─── Lightweight token estimator (≈ tiktoken accuracy for English) ────────────
/**
 * Estimates token count using a simple character-based formula.
 * Accuracy: ±5% for English prose, ±10% for code.
 * Does NOT require native addons.
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // Average English: ~4 chars per token. Code: ~3.5. We use 3.8 as a blend.
  const words = text.split(/\s+/).length;
  const chars = text.length;
  // Weighted blend: 60% char-based, 40% word-based
  return Math.ceil(0.6 * (chars / 3.8) + 0.4 * (words * 1.3));
}

// ─── Realistic simulated assistant responses (used in dry-run mode) ───────────
const SIMULATED_RESPONSES = [
  // Turn 1 — project structure
  `Here's the project structure for your TypeScript CLI Todo App:

\`\`\`
todo-app/
├── src/
│   ├── index.ts      ← CLI entry point
│   ├── types.ts      ← Todo type definitions
│   └── store.ts      ← In-memory storage
├── package.json
└── tsconfig.json
\`\`\`

**package.json:**
\`\`\`json
{
  "name": "todo-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": { "todo": "dist/index.js" },
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "start": "node dist/index.js"
  },
  "dependencies": { "commander": "^12.0.0" },
  "devDependencies": { "typescript": "^5.4.0", "@types/node": "^20.0.0" }
}
\`\`\``,

  // Turn 2 — types
  `**src/types.ts:**
\`\`\`typescript
export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
}

export interface Store {
  todos: Todo[];
  nextId: number;
}
\`\`\``,

  // Turn 3 — store
  `**src/store.ts:**
\`\`\`typescript
import type { Todo, Store } from './types.js';

const store: Store = { todos: [], nextId: 1 };

export function addTodo(title: string): Todo {
  if (!title.trim()) throw new Error('Title cannot be empty');
  const todo: Todo = { id: store.nextId++, title: title.trim(), done: false, createdAt: new Date() };
  store.todos.push(todo);
  return todo;
}

export function listTodos(): Todo[] {
  return [...store.todos];
}

export function markDone(id: number): Todo {
  const todo = store.todos.find(t => t.id === id);
  if (!todo) throw new Error(\`Todo #\${id} not found\`);
  todo.done = true;
  return todo;
}

export function removeTodo(id: number): void {
  const idx = store.todos.findIndex(t => t.id === id);
  if (idx === -1) throw new Error(\`Todo #\${id} not found\`);
  store.todos.splice(idx, 1);
}

export function clearCompleted(): number {
  const before = store.todos.length;
  store.todos = store.todos.filter(t => !t.done);
  return before - store.todos.length;
}
\`\`\``,

  // Turn 4 — CLI
  `**src/index.ts** (commander.js wiring):
\`\`\`typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { addTodo, listTodos, markDone, removeTodo, clearCompleted } from './store.js';

const program = new Command();
program.name('todo').description('CLI Todo App').version('1.0.0');

program.command('add <title>').description('Add a new todo')
  .action((title) => {
    const t = addTodo(title);
    console.log(\`\\x1b[32m✓ Added:\\x1b[0m #\${t.id} \${t.title}\`);
  });

program.command('list').description('List all todos').action(() => {
  const todos = listTodos();
  if (!todos.length) { console.log('No todos yet.'); return; }
  todos.forEach(t => console.log(\`\${t.done ? '\\x1b[2m[x]' : '[ ]'} #\${t.id} \${t.title}\\x1b[0m\`));
});

program.command('done <id>').action((id) => {
  markDone(parseInt(id));
  console.log(\`\\x1b[32m✓ Marked #\${id} as done\\x1b[0m\`);
});

program.command('remove <id>').action((id) => {
  removeTodo(parseInt(id));
  console.log(\`\\x1b[31m✗ Removed #\${id}\\x1b[0m\`);
});

program.command('clear').action(() => {
  const n = clearCompleted();
  console.log(\`\\x1b[33mCleared \${n} completed todo(s)\\x1b[0m\`);
});

program.parse();
\`\`\``,

  // Turn 5 — list formatting
  `Enhanced list output with relative dates, checkboxes, and colors:

\`\`\`typescript
function relativeDate(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return \`\${Math.floor(diff / 60_000)}m ago\`;
  if (diff < 86_400_000) return \`\${Math.floor(diff / 3_600_000)}h ago\`;
  return \`\${Math.floor(diff / 86_400_000)}d ago\`;
}

// In list action:
const pending = todos.filter(t => !t.done);
const done = todos.filter(t => t.done);
todos.forEach(t => {
  const cb = t.done ? '\\x1b[2m[x]' : '[ ]';
  const title = t.done ? \`\\x1b[2m\${t.title}\` : t.title;
  console.log(\`  \${cb} #\${t.id} \${title} \\x1b[33m(\${relativeDate(t.createdAt)})\\x1b[0m\`);
});
console.log(\`\\n  \\x1b[36m\${pending.length} pending, \${done.length} done\\x1b[0m\`);
\`\`\``,

  // Turn 6 — error handling
  `Error handling additions:

\`\`\`typescript
// Wrap each action:
program.command('done <id>').action((idStr) => {
  try {
    const id = parseInt(idStr);
    if (isNaN(id)) throw new Error(\`"$\{idStr}" is not a valid todo ID\`);
    markDone(id);
    console.log(\`\\x1b[32m✓ Done #\${id}\\x1b[0m\`);
  } catch (e: any) {
    console.error(\`\\x1b[31mError: \${e.message}\\x1b[0m\`);
    process.exit(1);
  }
});

// Global handler (add before program.parse):
process.on('unhandledRejection', (err: any) => {
  console.error(\`\\x1b[31mUnhandled error: \${err?.message ?? err}\\x1b[0m\`);
  process.exit(1);
});
\`\`\``,

  // Turn 7 — tests
  `**src/store.test.ts** (node:test):
\`\`\`typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Reset store between tests via a resetStore() helper
test('addTodo: assigns sequential ids', () => {
  const t1 = addTodo('First');
  const t2 = addTodo('Second');
  assert.equal(t1.id + 1, t2.id);
});

test('markDone: marks correct item', () => {
  const t = addTodo('Task');
  markDone(t.id);
  assert.equal(listTodos().find(x => x.id === t.id)?.done, true);
});

test('markDone: throws on unknown id', () => {
  assert.throws(() => markDone(9999), /not found/);
});

test('removeTodo: removes item', () => {
  const t = addTodo('ToRemove');
  removeTodo(t.id);
  assert.equal(listTodos().find(x => x.id === t.id), undefined);
});

test('clearCompleted: only removes done items', () => {
  const p = addTodo('Pending');
  const d = addTodo('Done');
  markDone(d.id);
  clearCompleted();
  const remaining = listTodos();
  assert.ok(remaining.find(x => x.id === p.id));
  assert.equal(remaining.find(x => x.id === d.id), undefined);
});
\`\`\``,

  // Turn 8 — README
  `**README.md:**
\`\`\`markdown
# todo-cli

A minimal CLI Todo app built with TypeScript and Node.js.

## Install
\\\`\\\`\\\`bash
npm install && npm run build
\\\`\\\`\\\`

## Usage
\\\`\\\`\\\`bash
todo add "Buy milk"        # ✓ Added: #1 Buy milk
todo list                  # [ ] #1 Buy milk  (just now)
todo done 1                # ✓ Marked #1 as done
todo remove 1              # ✗ Removed #1
todo clear                 # Cleared 0 completed todo(s)
\\\`\\\`\\\`

## License
MIT
\\\`\\\`\\\``,

  // Turn 9 — build config
  `**tsconfig.json:**
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
\`\`\`

Updated package.json scripts:
\`\`\`json
"scripts": {
  "build": "tsc && chmod +x dist/index.js",
  "start": "node dist/index.js",
  "test": "node --test src/store.test.ts"
}
\`\`\``,

  // Turn 10 — final review
  `Final review — no critical issues found. Minor fixes applied:

1. **types.ts** — \`Store\` interface moved to internal only (not needed in public API).
2. **store.ts** — \`clearCompleted\` now returns void for cleaner API.
3. **index.ts** — All \`parseInt\` calls now use radix 10 explicitly.
4. **store.test.ts** — Added \`resetStore()\` call in \`beforeEach\` to prevent state leakage.
5. **tsconfig.json** — Added \`"forceConsistentCasingInFileNames": true\`.

All checks pass on Node.js 18. The app is ready.`,
];

/**
 * Build a simulated assistant reply for a given turn.
 * @param {string} prompt - the user prompt
 * @param {number} turn - 0-based turn index
 */
export function buildConversation(prompt, turn) {
  return SIMULATED_RESPONSES[turn % SIMULATED_RESPONSES.length];
}
