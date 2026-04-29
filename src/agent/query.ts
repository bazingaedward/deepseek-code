import type { LLMClient } from '../llm/client.js';
import type { CanUseTool } from '../permissions/canUseTool.js';
import type { Tool, ToolContext } from '../tools/Tool.js';
import type { AgentEvent, Message } from '../types/message.js';
import { runTools } from './runTools.js';

export interface QueryParams {
  messages: Message[];
  tools: Tool[];
  client: LLMClient;
  canUseTool: CanUseTool;
  ctx: ToolContext;
  /** Safety bound on tool-call iterations. */
  maxTurns?: number;
}

/**
 * The agent loop. Generator-based, mirroring Claude Code's `query()`.
 *
 *   while True:
 *     stream LLM response  → yield text deltas
 *     if no tool_calls     → done
 *     for each tool_call   → permission gate → execute → tool result
 *     append assistant + tool messages → loop
 *
 * Returns the final `messages` (so callers can persist conversation state).
 */
export async function* query(
  params: QueryParams,
): AsyncGenerator<AgentEvent, Message[], void> {
  const { client, tools, canUseTool, ctx } = params;
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const messages = [...params.messages];
  const maxTurns = params.maxTurns ?? 25;

  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = client.stream({ messages, tools, signal: ctx.signal });

    let result: Awaited<ReturnType<typeof client.stream> extends AsyncGenerator<unknown, infer R, unknown> ? R : never>;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        result = next.value;
        break;
      }
      yield { type: 'assistant_text_delta', text: next.value.text };
    }

    if (result.text) {
      yield { type: 'assistant_text_done', text: result.text };
    }

    messages.push({
      role: 'assistant',
      content: result.text,
      toolCalls: result.toolCalls.length ? result.toolCalls : undefined,
    });

    if (result.toolCalls.length === 0) {
      yield { type: 'turn_done' };
      return messages;
    }

    const toolGen = runTools(result.toolCalls, toolMap, canUseTool, ctx);
    while (true) {
      const next = await toolGen.next();
      if (next.done) {
        messages.push(...next.value);
        break;
      }
      yield next.value;
    }
  }

  yield {
    type: 'error',
    message: `Reached max turns (${maxTurns}) without resolution.`,
  };
  return messages;
}
