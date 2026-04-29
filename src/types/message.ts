/**
 * Internal message + event types.
 *
 * We keep an internal canonical message format and translate to/from the
 * provider format inside `src/llm/*`. That way the agent loop and tools
 * never depend on OpenAI/DeepSeek wire shapes directly.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments object. The LLM sends a JSON string; we parse before storing. */
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  /** Free-form text result fed back to the LLM. */
  content: string;
  isError: boolean;
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/**
 * Events yielded by the agent generator. The TUI consumes them to update state.
 * Naming mirrors Anthropic's stream event shape loosely so it's easy to skim.
 */
export type AgentEvent =
  | { type: 'assistant_text_delta'; text: string }
  | { type: 'assistant_text_done'; text: string }
  | { type: 'tool_call_requested'; call: ToolCall }
  | { type: 'tool_call_denied'; toolCallId: string; reason: string }
  | { type: 'tool_call_result'; result: ToolResult }
  | { type: 'turn_done' }
  | { type: 'error'; message: string };
