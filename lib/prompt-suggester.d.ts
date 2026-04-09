/**
 * UTOE Prompt Suggestion Engine — TypeScript
 *
 * Analyzes prompts and rewrites them to structured JSON for better LLM results.
 * Includes real-time quality scoring (0-100) and task/language detection.
 *
 * @example
 * ```typescript
 * import { suggestBetterPrompt, scorePrompt } from './prompt-suggester.js';
 *
 * const result = suggestBetterPrompt('Hey fix the bug in my code');
 * // result.task = 'debug'
 * // result.suggested = '{"task":"debug","symptom":"fix the bug...","output":"root_cause+fixed_code+explanation"}'
 * // result.improvementPct = -40 (more tokens but better quality)
 * ```
 */
import type { SuggestionResult, TaskType } from './types.js';
export declare function detectIntent(text: string): TaskType;
export declare function detectLanguage(text: string): string | null;
export declare function suggestBetterPrompt(rawPrompt: string): SuggestionResult;
export declare function scorePrompt(prompt: string): number;
//# sourceMappingURL=prompt-suggester.d.ts.map