/**
 * UTOE Monkey-Patch — transparently intercept OpenAI / Anthropic / Vercel AI SDK calls.
 *
 * How it works:
 *  - Wraps the SDK client's chat/messages method
 *  - Compresses the prompt before it leaves your process
 *  - Logs token savings
 *  - No server required — pure in-process optimization
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { patchOpenAI } from 'utoe-plugin';
 *
 * const client = new OpenAI();
 * patchOpenAI(client);
 * // All client.chat.completions.create() calls are now compressed automatically
 * ```
 */
interface PatchOptions {
    lossless?: boolean;
    aggressiveCode?: boolean;
    silent?: boolean;
}
/**
 * Patch an OpenAI SDK client instance to compress all chat prompts.
 * Works with openai npm package v4+.
 */
export declare function patchOpenAI(client: {
    chat: {
        completions: {
            create: (...args: unknown[]) => unknown;
        };
    };
}, opts?: PatchOptions): void;
/**
 * Patch an Anthropic SDK client instance to compress all message prompts.
 * Works with @anthropic-ai/sdk npm package.
 */
export declare function patchAnthropic(client: {
    messages: {
        create: (...args: unknown[]) => unknown;
    };
}, opts?: PatchOptions): void;
/**
 * Patch the Vercel AI SDK's generateText / streamText by wrapping the prompt.
 * Pass the options object and UTOE will compress the messages/prompt before the call.
 */
export declare function patchVercelAI(opts?: PatchOptions): {
    compressOptions: (options: Record<string, unknown>) => Record<string, unknown>;
};
/**
 * Attempt to auto-detect and patch all installed AI SDK clients.
 * Looks for OpenAI and Anthropic instances registered on globalThis.
 * Safe to call multiple times — only patches once.
 */
export declare function installMonkeyPatch(opts?: PatchOptions): void;
export {};
//# sourceMappingURL=monkey-patch.d.ts.map