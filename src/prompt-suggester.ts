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

// ─── Intent detection ─────────────────────────────────────────────────────────

const TASK_KW: Record<string, { kws: string[]; weight: number }> = {
  summarize: { kws: ['summarize', 'summary', 'tldr', 'brief', 'shorten', 'condense'], weight: 2 },
  translate: { kws: ['translate', 'translation', 'in french', 'in spanish', 'in german'], weight: 2 },
  classify:  { kws: ['classify', 'categorize', 'what type', 'label', 'sort into'], weight: 2 },
  clean:     { kws: ['clean', 'format', 'tidy', 'beautify', 'lint', 'fix formatting'], weight: 1 },
  explain:   { kws: ['explain', 'what is', 'how does', 'describe', 'tell me about', 'what are'], weight: 1 },
  refactor:  { kws: ['refactor', 'rewrite', 'restructure', 'improve code', 'clean up code'], weight: 2 },
  review:    { kws: ['review', 'feedback', 'check this', "what's wrong", 'any issues'], weight: 1 },
  document:  { kws: ['document', 'docstring', 'add comments', 'jsdoc', 'add docs'], weight: 2 },
  debug:     { kws: ['debug', 'fix bug', 'fix the', 'error', 'exception', 'not working', 'broken', 'crash'], weight: 2 },
  generate:  { kws: ['generate', 'create', 'build', 'make', 'write', 'add', 'implement', 'code'], weight: 1 },
  analyze:   { kws: ['analyze', 'analysis', 'compare', 'evaluate', 'assess', 'audit'], weight: 1 },
  test:      { kws: ['test', 'unit test', 'write tests', 'spec', 'jest', 'mocha', 'pytest'], weight: 2 },
  optimize:  { kws: ['optimize', 'performance', 'speed up', 'faster', 'efficient'], weight: 2 },
};

export function detectIntent(text: string): TaskType {
  const lower = text.toLowerCase();
  let best: TaskType = 'generate';
  let bestScore = 0;
  for (const [task, { kws, weight }] of Object.entries(TASK_KW)) {
    const score = kws.filter((k) => lower.includes(k)).length * weight;
    if (score > bestScore) { bestScore = score; best = task as TaskType; }
  }
  return best;
}

// ─── Language detection ───────────────────────────────────────────────────────

const LANG_PAT: Record<string, RegExp> = {
  typescript: /\btypescript\b|\btsx?\b|\.tsx?/i,
  javascript: /\bjavascript\b|\bjs\b|\.jsx?/i,
  python:     /\bpython\b|\.py\b/i,
  rust:       /\brust\b|\.rs\b|cargo/i,
  go:         /\bgolang\b|\bgo\b|\.go\b/i,
  java:       /\bjava\b|\.java\b/i,
  ruby:       /\bruby\b|\.rb\b|rails/i,
  react:      /\breact\b|jsx|tsx|useState|useEffect/i,
  vue:        /\bvue\b|\.vue\b/i,
  svelte:     /\bsvelte\b/i,
  nextjs:     /next\.js|nextjs/i,
};

export function detectLanguage(text: string): string | null {
  for (const [lang, pat] of Object.entries(LANG_PAT)) {
    if (pat.test(text)) return lang;
  }
  return null;
}

// ─── Prompt templates ─────────────────────────────────────────────────────────

type Template = (input: string, lang: string | null) => Record<string, unknown>;

const TEMPLATES: Partial<Record<TaskType, Template>> = {
  summarize: (i) => ({ task: 'summarize', text: i.slice(0, 300), format: 'bullet_points', max_words: 150 }),
  translate: (i) => ({ task: 'translate', text: i.slice(0, 300), source: 'auto', target: '<TARGET_LANGUAGE>', preserve: 'formatting' }),
  classify:  (i) => ({ task: 'classify', text: i.slice(0, 300), output: 'label+confidence', format: 'json' }),
  explain:   (i, l) => ({ task: 'explain', topic: i.slice(0, 200), level: 'developer', format: 'concise', max_tokens: 300, ...(l && { language_context: l }) }),
  refactor:  (i, l) => ({ task: 'refactor', code: i.includes('```') ? '<see_attached_code>' : i.slice(0, 200), style: 'clean', requirements: ['readable', 'add_comments', 'no_duplication', 'preserve_behavior'], ...(l && { language: l }) }),
  review:    (i, l) => ({ task: 'code_review', code: i.includes('```') ? '<see_attached_code>' : i.slice(0, 200), focus: ['bugs', 'security', 'performance', 'style'], output: 'issues_list+severity', ...(l && { language: l }) }),
  document:  (i, l) => ({ task: 'document', code: i.includes('```') ? '<see_attached_code>' : i.slice(0, 200), style: l === 'python' ? 'google_docstring' : 'jsdoc', include: ['params', 'returns', 'throws', 'example'] }),
  debug:     (i, l) => ({ task: 'debug', symptom: i.slice(0, 200), output: 'root_cause+fixed_code+explanation', ...(l && { language: l }) }),
  generate:  (i, l) => ({ task: 'generate', description: i.slice(0, 200), output: 'code+explanation+usage_example', quality: 'production_ready', ...(l && { language: l }) }),
  analyze:   (i) => ({ task: 'analyze', subject: i.slice(0, 200), format: 'structured_report', sections: ['summary', 'findings', 'recommendations'] }),
  test:      (i, l) => ({ task: 'write_tests', code: i.includes('```') ? '<see_attached_code>' : i.slice(0, 200), framework: l === 'python' ? 'pytest' : 'jest', coverage: ['happy_path', 'edge_cases', 'error_cases'], ...(l && { language: l }) }),
  optimize:  (i, l) => ({ task: 'optimize', code: i.includes('```') ? '<see_attached_code>' : i.slice(0, 200), focus: ['time_complexity', 'memory', 'readability'], output: 'optimized_code+explanation+benchmarks', ...(l && { language: l }) }),
};

function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 4);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function suggestBetterPrompt(rawPrompt: string): SuggestionResult {
  const cleaned = rawPrompt.replace(/^(hey|hi|hello|greetings)[,!.]*\s*/i, '').replace(/\bplease\b\s*/gi, '').trim();
  const task = detectIntent(cleaned);
  const lang = detectLanguage(cleaned);
  const template = TEMPLATES[task];
  const structured = template
    ? JSON.stringify(template(cleaned, lang), null, 0)
    : JSON.stringify({ task, input: cleaned.slice(0, 300) });

  const originalTokens = estimateTokens(rawPrompt);
  const suggestedTokens = estimateTokens(structured);
  const improvementPct = Math.round(((originalTokens - suggestedTokens) / Math.max(originalTokens, 1)) * 100);
  const quality = improvementPct >= 0 ? `${improvementPct}% fewer tokens` : `${Math.abs(improvementPct)}% more tokens but significantly better output quality`;

  return {
    original: rawPrompt, suggested: structured, task, lang,
    originalTokens, suggestedTokens, improvementPct,
    tip: `Structured JSON: ${quality}. Produces more accurate, consistent results.`,
    whyBetter: [
      'Eliminates ambiguity — LLM knows exactly what output format to produce',
      'Specifies constraints (length, style, coverage) upfront',
      'Removes filler words that waste tokens without adding meaning',
      ...(lang ? [`Language context (${lang}) ensures correct idioms`] : []),
    ],
  };
}

export function scorePrompt(prompt: string): number {
  let score = 50;
  const lower = prompt.toLowerCase();
  if (prompt.trim().startsWith('{')) score += 20;
  if (/output|format|style/i.test(prompt)) score += 10;
  if (/max_\w+|limit/i.test(prompt)) score += 5;
  if (detectLanguage(prompt)) score += 5;
  if (prompt.length > 50 && prompt.length < 500) score += 10;
  if (/^(hey|hi|hello)/i.test(prompt)) score -= 10;
  if (/please|kindly|could you/i.test(lower)) score -= 10;
  if (/\bi\s+need\s+you\b/i.test(lower)) score -= 5;
  if (prompt.length > 2000) score -= 15;
  if (/thank you|thanks/i.test(lower)) score -= 5;
  return Math.max(0, Math.min(100, score));
}
