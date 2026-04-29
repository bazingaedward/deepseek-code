import type { Tool } from '../tools/Tool.js';
import type { ToolCall } from '../types/message.js';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypass';

export type PermissionDecision =
  | { allow: true }
  | { allow: false; reason: string };

/**
 * Awaitable permission gate. The agent loop calls this before every tool
 * execution and blocks until it resolves. The TUI is responsible for
 * surfacing the request and resolving the promise based on user input.
 */
export type CanUseTool = (
  tool: Tool,
  call: ToolCall,
) => Promise<PermissionDecision>;

/**
 * Default fast-path: read-only tools auto-allow; everything else defers to
 * `askUser`. `bypass` mode (--dangerously-skip-permissions) auto-allows all.
 */
export function makeCanUseTool(
  mode: PermissionMode,
  askUser: (tool: Tool, call: ToolCall) => Promise<PermissionDecision>,
): CanUseTool {
  return async (tool, call) => {
    if (mode === 'bypass') return { allow: true };
    if (tool.isReadOnly) return { allow: true };
    if (mode === 'acceptEdits' && tool.name !== 'Bash') return { allow: true };
    return askUser(tool, call);
  };
}
