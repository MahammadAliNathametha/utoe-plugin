declare module '@atjsh/llmlingua-2' {
  export class LLMLingua2 {
    compress(text: string, opts?: { ratio?: number }): Promise<{ compressed_prompt?: string }>;
  }
  const _default: typeof LLMLingua2;
  export default _default;
}
