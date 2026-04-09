#!/usr/bin/env node
/**
 * todo-app/src/index.ts
 *
 * CLI Todo App — the finished artifact that UTOE helped build.
 * This is the final, production-ready version of the app
 * constructed turn-by-turn in the demo.
 *
 * Commands:
 *   add <title>     Add a new todo item
 *   list            List all todos (pending + done)
 *   done <id>       Mark a todo as done
 *   remove <id>     Remove a todo by id
 *   clear           Remove all completed todos
 *
 * Build:
 *   npm install && npm run build
 *
 * Run:
 *   node dist/index.js add "Buy milk"
 *   node dist/index.js list
 */

import { Command } from 'commander';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const todos: Todo[] = [];
let nextId = 1;

function addTodo(title: string): Todo {
  if (!title.trim()) throw new Error('Title cannot be empty');
  const todo: Todo = { id: nextId++, title: title.trim(), done: false, createdAt: new Date() };
  todos.push(todo);
  return todo;
}

function listTodos(): Todo[] {
  return [...todos];
}

function markDone(id: number): Todo {
  const todo = todos.find(t => t.id === id);
  if (!todo) throw new Error(`Todo #${id} not found`);
  todo.done = true;
  return todo;
}

function removeTodo(id: number): void {
  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) throw new Error(`Todo #${id} not found`);
  todos.splice(idx, 1);
}

function clearCompleted(): number {
  const before = todos.length;
  todos.splice(0, todos.length, ...todos.filter(t => !t.done));
  return before - todos.length;
}

// ─── ANSI colour helpers ──────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

function relativeDate(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 2) return 'yesterday';
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('todo')
  .description('Minimal CLI Todo App — built with UTOE token savings')
  .version('1.0.0');

// add
program
  .command('add <title>')
  .description('Add a new todo item')
  .action((title: string) => {
    try {
      const t = addTodo(title);
      console.log(`${c.green}✓ Added:${c.reset} #${t.id} ${c.bold}${t.title}${c.reset}`);
    } catch (e: any) {
      console.error(`${c.red}Error: ${e.message}${c.reset}`);
      process.exit(1);
    }
  });

// list
program
  .command('list')
  .description('List all todos (pending + done)')
  .action(() => {
    const all = listTodos();
    if (all.length === 0) {
      console.log(`${c.dim}  No todos yet. Try: todo add "Buy milk"${c.reset}`);
      return;
    }
    console.log('');
    all.forEach(t => {
      const checkbox = t.done ? `${c.dim}[x]` : `${c.white}[ ]`;
      const title    = t.done ? `${c.dim}${t.title}` : `${c.bold}${t.title}`;
      const date     = `${c.yellow}(${relativeDate(t.createdAt)})`;
      console.log(`  ${checkbox} #${t.id} ${title}${c.reset} ${date}${c.reset}`);
    });
    const pending = all.filter(t => !t.done).length;
    const done    = all.length - pending;
    console.log(`\n  ${c.cyan}${pending} pending, ${done} done${c.reset}\n`);
  });

// done
program
  .command('done <id>')
  .description('Mark a todo as done')
  .action((idStr: string) => {
    try {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) throw new Error(`"${idStr}" is not a valid todo ID`);
      const t = markDone(id);
      console.log(`${c.green}✓ Done:${c.reset} #${t.id} ${c.dim}${t.title}${c.reset}`);
    } catch (e: any) {
      console.error(`${c.red}Error: ${e.message}${c.reset}`);
      process.exit(1);
    }
  });

// remove
program
  .command('remove <id>')
  .alias('rm')
  .description('Remove a todo by ID')
  .action((idStr: string) => {
    try {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) throw new Error(`"${idStr}" is not a valid todo ID`);
      removeTodo(id);
      console.log(`${c.red}✗ Removed:${c.reset} #${id}`);
    } catch (e: any) {
      console.error(`${c.red}Error: ${e.message}${c.reset}`);
      process.exit(1);
    }
  });

// clear
program
  .command('clear')
  .description('Remove all completed todos')
  .action(() => {
    const n = clearCompleted();
    if (n === 0) {
      console.log(`${c.dim}  Nothing to clear — no completed todos.${c.reset}`);
    } else {
      console.log(`${c.yellow}✓ Cleared ${n} completed todo${n === 1 ? '' : 's'}${c.reset}`);
    }
  });

// ─── Global error handlers ────────────────────────────────────────────────────

process.on('unhandledRejection', (err: any) => {
  console.error(`${c.red}Unhandled error: ${err?.message ?? err}${c.reset}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});

program.parse();
