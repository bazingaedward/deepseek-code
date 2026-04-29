import type { z } from 'zod';

/**
 * Tool interface, modeled on Claude Code's `Tool<Input, Output>` but trimmed
 * to what the v0 closed loop needs.
 *
 * Each tool declares its input as a Zod schema; we convert to JSONSchema for
 * the LLM `tools` field via `zod-to-json-schema` in `src/llm/adapter.ts`.
 */
export interface Tool<Input = unknown> {
  /** Stable name passed to the LLM (e.g. "Read"). */
  name: string;

  /** Short, LLM-facing description. Keep terse; the LLM picks tools from this. */
  description: string;

  /** Zod schema for arguments. */
  inputSchema: z.ZodType<Input>;

  /**
   * Permission gate. Returning `false` means the tool will require user
   * approval before each call. `true` means the tool runs without prompting
   * (read-only ops can opt in). The user can also globally bypass via the
   * permission mode.
   */
  isReadOnly: boolean;

  /** Render a one-line preview of what the tool is about to do, for the prompt. */
  renderPreview(input: Input): string;

  /** Execute. Throw on error; the runner converts errors into ToolResult.isError. */
  execute(input: Input, ctx: ToolContext): Promise<string>;
}

export interface ToolContext {
  /** Working directory the agent was launched from. */
  cwd: string;
  /** Abort signal — currently unused in v0; reserved for ESC/cancel. */
  signal: AbortSignal;
}
