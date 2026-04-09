# Architecture Decisions

Auto-populated by UTOE post-prompt hooks.

## 2026-04-09 09:41
The improved list command now shows: [ ] / [x] checkboxes, relative timestamps (just now / 2h ago / yesterday), color-coded output, and a summary line.

Architecture decision: using ANSI escape codes directly instead of chalk to keep zero runtime dependencies.

## 2026-04-09 09:41
tsconfig.json created with strict mode, ES2022 target, NodeNext module resolution.

Architecture decision: using NodeNext module resolution instead of CommonJS for native ESM support in Node.js 18+.
