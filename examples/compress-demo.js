/**
 * UTOE Example: Compression Engine Demo
 *
 * Shows how UTOE compresses different types of content.
 * Run: node examples/compress-demo.js
 */

import { compress, estimateTokens, compressMessages } from '../lib/compression.js';
import { suggestBetterPrompt, scorePrompt } from '../lib/prompt-suggester.js';

function sep(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// 1. Filler removal
sep('1. Filler Removal');
const fillerPrompt = `Hey there! Hope you're doing well today.
I was wondering if you could please kindly help me understand
what React hooks are? I need you to explain it to me in simple
terms. Thank you so much for your help!`;

const { compressed: c1, stats: s1 } = compress(fillerPrompt);
console.log('BEFORE:', fillerPrompt.trim());
console.log('\nAFTER:', c1);
console.log(`\nSaved: ${s1.savedTokens} tokens (${s1.savedPct}%) | Layers: ${s1.layers.map(l => l.name).join(', ')}`);

// 2. Redundant clause removal
sep('2. Redundant Clause Removal');
const redundant = `In other words, as I mentioned earlier, it's important to note that
you should use TypeScript. To put it simply, TypeScript is basically
just JavaScript with types. Of course, you already know this.`;

const { compressed: c2, stats: s2 } = compress(redundant);
console.log('BEFORE:', redundant.trim());
console.log('\nAFTER:', c2);
console.log(`\nSaved: ${s2.savedTokens} tokens (${s2.savedPct}%)`);

// 3. Git log compression
sep('3. Git Log Compression');
const gitLog = Array.from({ length: 12 }, (_, i) => `commit ${'a1b2c3d4'.repeat(5)}
Author: Developer <dev@example.com>
Date:   Mon Jan ${i + 1} 10:00:00 2024 +0000

    ${['Fix login bug', 'Add user auth', 'Refactor API', 'Update deps', 'Fix tests', 'Add caching'][i % 6]} (#${100 + i})
`).join('\n');

const { stats: s3 } = compress(gitLog, { toolOutputs: true });
console.log(`Git log: ${gitLog.split('\n').length} lines → saved ${s3.savedTokens} tokens (${s3.savedPct}%)`);

// 4. Large JSON
sep('4. JSON SmartCrusher');
const bigJson = JSON.stringify(
  Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Product ${i}`, price: i * 9.99, category: 'electronics', inStock: true })),
  null, 2
);
const { compressed: c4, stats: s4 } = compress(`Here is the product catalog:\n${bigJson}`);
console.log(`Large JSON array (${s4.originalTokens} tokens) → ${s4.compressedTokens} tokens (${s4.savedPct}% saved)`);
console.log('Compressed to:', c4.slice(0, 150) + '...');

// 5. Large code block summarization
sep('5. Large Code Block Summarization');
const bigCode = `Here is the full implementation:\n\`\`\`typescript\n` +
  Array.from({ length: 220 }, (_, i) => {
    if (i % 20 === 0) return `\nfunction processItem${Math.floor(i/20)}(data: any) {`;
    if (i % 20 === 19) return `  return data;\n}`;
    return `  const step${i % 20} = transform${i % 20}(data);`;
  }).join('\n') + `\n\`\`\``;

const { stats: s5 } = compress(bigCode);
console.log(`Code (${s5.originalTokens} tokens) → ${s5.compressedTokens} tokens (${s5.savedPct}% saved)`);

// 6. Prompt suggestion
sep('6. Prompt Suggestion Engine');
const weakPrompts = [
  "Hey can you help me fix the bug where undefined is being read",
  "Please summarize this long document for me",
  "Write me a function that sorts an array",
  "Review my React code",
];

for (const p of weakPrompts) {
  const score = scorePrompt(p);
  const suggestion = suggestBetterPrompt(p);
  const scoreBar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
  console.log(`\nWeak: "${p}"`);
  console.log(`Score: [${scoreBar}] ${score}/100 | Task: ${suggestion.task}`);
  console.log(`Better: ${suggestion.suggested}`);
  console.log(`Improvement: ${suggestion.improvementPct}%`);
}

// 7. Messages array compression
sep('7. Messages Array Compression');
const messages = [
  { role: 'system', content: 'You are a helpful AI assistant.' },
  { role: 'user', content: 'Hey, could you please kindly help me understand what async/await does? Thank you!' },
  { role: 'assistant', content: 'Async/await is syntactic sugar over Promises...' },
  { role: 'user', content: 'I was wondering if you could possibly please explain closures too?' },
];
const { messages: compressed, totalSaved } = compressMessages(messages);
console.log(`Messages: ${messages.length} | Total saved: ${totalSaved} tokens`);
for (const [i, m] of compressed.entries()) {
  const orig = estimateTokens(messages[i].content);
  const comp = estimateTokens(m.content);
  console.log(`  [${m.role}] ${orig}→${comp} tokens: "${m.content.slice(0, 60)}..."`);
}

console.log('\n✓ Compression demo complete\n');
