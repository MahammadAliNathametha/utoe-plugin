/**
 * UTOE Project Bootstrap — creates and manages project support files.
 *
 * Responsibilities:
 *  - Detect which AI tool is in use (Claude Code, Cursor, Copilot, Windsurf, etc.)
 *  - Create the correct context file for that tool (claude.md, .cursorrules, etc.)
 *  - Create .utoe/logs/ support files (tech_debt, bug_list, etc.)
 *  - Enforce the 60-line limit on the context file
 *  - Load relevant support files via keyword scoring (RAG-lite fallback)
 *
 * This module is intentionally separated from the memory engine (memory.ts)
 * so that file-system concerns don't pollute the in-memory store logic.
 */
/**
 * Detect which AI coding tool is active based on environment variables,
 * existing config files, and process ancestors.
 */
export declare function detectAITool(projectRoot?: string): {
    tool: 'claude' | 'cursor' | 'copilot' | 'windsurf' | 'aider' | 'continue' | 'generic';
    contextFile: string;
    label: string;
};
/**
 * Bootstrap a project: create the appropriate AI context file and all UTOE support files.
 * Auto-detects the active AI tool (Claude Code → claude.md, Cursor → .cursorrules, etc.).
 * Idempotent — skips files that already exist.
 */
export declare function bootstrapProjectFiles(projectRoot?: string): {
    created: string[];
    skipped: string[];
    detectedTool: string;
    contextFile: string;
};
/**
 * Enforce the 60-line limit on the AI context file (claude.md, .cursorrules, etc.).
 * Trims excess lines and appends a pointer to .utoe/logs/ if needed.
 */
export declare function enforceClaudeMdLimit(projectRoot?: string): void;
/**
 * Load only relevant files from .utoe/logs/ based on keyword overlap with a query.
 * Used as a RAG-lite fallback when LanceDB is not available.
 */
export declare function loadRelevantSupportFiles(query: string, projectRoot?: string, topK?: number): Array<{
    file: string;
    content: string;
    score: number;
}>;
/**
 * Start the UTOE proxy as a detached background daemon.
 * Uses a TCP probe to skip startup if already running.
 * Never throws — failure is swallowed so npm install always succeeds.
 */
export declare function autoStartDaemon(port?: number): Promise<boolean>;
/**
 * Append ANTHROPIC_BASE_URL + OPENAI_BASE_URL to the user's shell profile
 * (~/.zshrc, ~/.bashrc, or ~/.profile) if the line is not already present.
 * Idempotent and non-destructive — never overwrites existing values.
 */
export declare function patchShellProfile(port?: number): {
    file: string | null;
    added: boolean;
};
//# sourceMappingURL=project-bootstrap.d.ts.map