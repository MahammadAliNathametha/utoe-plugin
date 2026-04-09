/**
 * UTOE — Universal Token Optimization Engine
 * Public API entry point
 *
 * @example
 * ```typescript
 * import { createServer, compress, router, memory } from 'utoe-plugin';
 *
 * // Start the OpenAI-compatible proxy
 * const server = await createServer({ port: 8787 });
 * server.listen(8787);
 *
 * // Use the compression engine directly
 * const { compressed, stats } = compress('Hey, could you please help me fix this bug?');
 * console.log(`Saved ${stats.savedPct}% tokens`);
 * ```
 */
export type { UTOEConfig, ProviderName, ModelTier, ModelCandidate, RoutePlan, RoutePlanSelected, FallbackEntry, HardwareProfile, ChatMessage, MessageRole, TaskType, TopicType, CompressionStats, CompressionResult, CompressOptions, PipelineResult, MemoryStats, MemoryFact, RAGSearchResult, RAGIndexResult, RAGStats, SuggestionResult, ExecutionResult, SelectedRoute, CacheEntry, CacheStats, TerminalHookResult, } from './types.js';
export { createServer, createHonoApp, startHonoServer } from './server.js';
export { runPipeline, optimizeMessages, suggestBetterPrompt } from './pipeline.js';
export { compress, compressMessages, estimateTokens, computeCCR, queryAwareFilter, preserveAST, UniversalCompressor, universalCompressor, } from './compression.js';
export { router } from './router.js';
export { memory } from './memory.js';
export { executor } from './executor.js';
export { enforceTokenEnvelope, getModelContextLimit } from './token-guard.js';
export { runLocalOptimizer } from './local-optimizer.js';
export { ProjectRAG, getProjectRAG } from './rag.js';
export { terminalHook, processTerminalOutput, TerminalHookManager, runPrePromptHook, runPostPromptHook, } from './terminal-hook.js';
export { suggestBetterPrompt as suggestPrompt, scorePrompt, detectIntent, } from './prompt-suggester.js';
export { patchOpenAI, patchAnthropic, patchVercelAI, installMonkeyPatch, } from './monkey-patch.js';
export { semanticCache } from './semantic-cache.js';
export { CommandEngine, commandEngine, createDefaultSession, buildFlagInjection, injectFlagsIntoMessages, compactHistory, parseCommand, handleEscPress, EFFORT_PROFILES, } from './command-engine.js';
export { bootstrapProjectFiles, enforceClaudeMdLimit, loadRelevantSupportFiles, } from './project-bootstrap.js';
//# sourceMappingURL=index.d.ts.map