import OpenAI from 'openai';
import type { Settings } from '../config/settings.js';
import type { Tool } from '../tools/Tool.js';
import type { Message, ToolCall } from '../types/message.js';
import { StreamAccumulator, messagesToOpenAI, toolsToOpenAI } from './adapter.js';

export interface CallModelParams {
  messages: Message[];
  tools: Tool[];
  signal?: AbortSignal;
}

export interface CallModelResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

/**
 * The LLM seam — equivalent to Claude Code's `deps.callModel`.
 * Returns an async generator yielding text deltas; the final return value
 * holds the full text + parsed tool_calls.
 */
export interface LLMClient {
  stream(params: CallModelParams): AsyncGenerator<
    { type: 'text_delta'; text: string },
    CallModelResult,
    void
  >;
}

export function createDeepSeekClient(settings: Settings): LLMClient {
  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
  });

  return {
    async *stream({ messages, tools, signal }) {
      const acc = new StreamAccumulator();
      const stream = await openai.chat.completions.create(
        {
          model: settings.model,
          messages: messagesToOpenAI(messages),
          tools: tools.length ? toolsToOpenAI(tools) : undefined,
          tool_choice: tools.length ? 'auto' : undefined,
          stream: true,
        },
        { signal },
      );

      let finishReason: string | null = null;
      for await (const chunk of stream) {
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
        const event = acc.ingest(chunk);
        if (event.type === 'text_delta') {
          yield { type: 'text_delta', text: event.text };
        }
      }

      return {
        text: acc.text,
        toolCalls: acc.finalizeToolCalls(),
        finishReason,
      };
    },
  };
}
