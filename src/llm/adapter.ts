import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '../tools/Tool.js';
import type { Message, ToolCall } from '../types/message.js';

/**
 * Convert our internal Tool list to OpenAI/DeepSeek `tools` parameter shape.
 * DeepSeek's chat completions API mirrors OpenAI's function-calling spec.
 */
export function toolsToOpenAI(
  tools: Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.inputSchema, { target: 'openApi3' }) as Record<string, unknown>,
    },
  }));
}

/** Internal Message[] → OpenAI ChatCompletionMessageParam[]. */
export function messagesToOpenAI(
  messages: Message[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
    switch (m.role) {
      case 'system':
        return { role: 'system', content: m.content };
      case 'user':
        return { role: 'user', content: m.content };
      case 'assistant':
        return {
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls && m.toolCalls.length
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                })),
              }
            : {}),
        };
      case 'tool':
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
  });
}

/**
 * Accumulator for a single streaming assistant turn. The OpenAI streaming
 * format sends tool_call deltas piece-by-piece (name + arguments come in
 * fragments across many chunks); we stitch them back together here.
 */
export class StreamAccumulator {
  text = '';
  private partial: Array<{
    index: number;
    id: string;
    name: string;
    args: string;
  }> = [];

  ingest(chunk: OpenAI.Chat.Completions.ChatCompletionChunk):
    | { type: 'text_delta'; text: string }
    | { type: 'noop' } {
    const delta = chunk.choices[0]?.delta;
    if (!delta) return { type: 'noop' };

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      this.text += delta.content;
      return { type: 'text_delta', text: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index;
        let slot = this.partial.find((p) => p.index === i);
        if (!slot) {
          slot = { index: i, id: '', name: '', args: '' };
          this.partial.push(slot);
        }
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
    return { type: 'noop' };
  }

  /** Finalize accumulated tool_calls. Called once the stream ends. */
  finalizeToolCalls(): ToolCall[] {
    return this.partial
      .sort((a, b) => a.index - b.index)
      .map((p) => {
        let args: Record<string, unknown> = {};
        if (p.args.trim()) {
          try {
            args = JSON.parse(p.args);
          } catch {
            // Model occasionally emits malformed JSON. Surface as empty args;
            // the tool's Zod schema will reject and produce a clean error
            // that gets fed back to the model on the next turn.
            args = { __raw: p.args };
          }
        }
        return { id: p.id, name: p.name, arguments: args };
      });
  }
}
