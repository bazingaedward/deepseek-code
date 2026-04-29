import type { CanUseTool } from '../permissions/canUseTool.js';
import type { Tool, ToolContext } from '../tools/Tool.js';
import type { AgentEvent, Message, ToolCall } from '../types/message.js';

/**
 * Dispatch a batch of tool calls. Yields events to the caller (agent loop)
 * and returns the tool result messages to append to the conversation.
 *
 * Mirrors the spirit of `runTools` in Claude Code's query.ts: permission
 * gate first, execute on approval, surface deny as a tool_result so the
 * model can recover.
 */
export async function* runTools(
  toolCalls: ToolCall[],
  tools: Map<string, Tool>,
  canUseTool: CanUseTool,
  ctx: ToolContext,
): AsyncGenerator<AgentEvent, Message[], void> {
  const resultMessages: Message[] = [];

  for (const call of toolCalls) {
    if (ctx.signal.aborted) {
      // User cancelled mid-batch — feed a tombstone tool_result for every
      // remaining tool_use so the LLM transcript stays well-formed if the
      // session continues, then stop.
      resultMessages.push({
        role: 'tool',
        toolCallId: call.id,
        content: 'Cancelled by user before execution.',
      });
      continue;
    }

    yield { type: 'tool_call_requested', call };

    const tool = tools.get(call.name);
    if (!tool) {
      const reason = `Unknown tool: ${call.name}`;
      yield { type: 'tool_call_denied', toolCallId: call.id, reason };
      resultMessages.push({ role: 'tool', toolCallId: call.id, content: reason });
      continue;
    }

    const decision = await canUseTool(tool, call);
    if (!decision.allow) {
      yield { type: 'tool_call_denied', toolCallId: call.id, reason: decision.reason };
      resultMessages.push({
        role: 'tool',
        toolCallId: call.id,
        content: `Tool call denied by user: ${decision.reason}`,
      });
      continue;
    }

    const parsed = tool.inputSchema.safeParse(call.arguments);
    if (!parsed.success) {
      const content = `Invalid arguments: ${parsed.error.message}`;
      yield {
        type: 'tool_call_result',
        result: { toolCallId: call.id, content, isError: true },
      };
      resultMessages.push({ role: 'tool', toolCallId: call.id, content });
      continue;
    }

    try {
      const output = await tool.execute(parsed.data, ctx);
      yield {
        type: 'tool_call_result',
        result: { toolCallId: call.id, content: output, isError: false },
      };
      resultMessages.push({ role: 'tool', toolCallId: call.id, content: output });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const content = `Error: ${msg}`;
      yield {
        type: 'tool_call_result',
        result: { toolCallId: call.id, content, isError: true },
      };
      resultMessages.push({ role: 'tool', toolCallId: call.id, content });
    }
  }

  return resultMessages;
}
