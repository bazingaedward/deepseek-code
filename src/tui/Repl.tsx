import { Box, Static, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useCallback, useRef, useState } from 'react';
import { query } from '../agent/query.js';
import { buildSystemPrompt } from '../agent/systemPrompt.js';
import type { LLMClient } from '../llm/client.js';
import { makeCanUseTool, type PermissionDecision, type PermissionMode } from '../permissions/canUseTool.js';
import { builtinTools } from '../tools/registry.js';
import type { Tool } from '../tools/Tool.js';
import type { Message, ToolCall } from '../types/message.js';
import { MessageList } from './MessageList.js';
import { PermissionPrompt } from './PermissionPrompt.js';
import type { TranscriptItem } from './transcript.js';

interface Props {
  client: LLMClient;
  cwd: string;
  permissionMode: PermissionMode;
}

type Mode = 'idle' | 'busy' | 'awaiting_permission';

export function Repl({ client, cwd, permissionMode }: Props) {
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [pending, setPending] = useState<{ tool: Tool; call: ToolCall } | null>(null);

  // The conversation messages we send to the LLM. Kept in a ref so the agent
  // loop reads the current value without React re-render coupling.
  const messagesRef = useRef<Message[]>([
    { role: 'system', content: buildSystemPrompt(cwd) },
  ]);

  const permissionResolverRef = useRef<((d: PermissionDecision) => void) | null>(null);

  const askUser = useCallback(
    (tool: Tool, call: ToolCall): Promise<PermissionDecision> => {
      return new Promise((resolve) => {
        permissionResolverRef.current = resolve;
        setPending({ tool, call });
        setMode('awaiting_permission');
      });
    },
    [],
  );

  const resolvePermission = useCallback((decision: PermissionDecision) => {
    const resolver = permissionResolverRef.current;
    permissionResolverRef.current = null;
    setPending(null);
    setMode('busy');
    resolver?.(decision);
  }, []);

  const onSubmit = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || mode !== 'idle') return;

      setDraft('');
      setMode('busy');

      // Append the user turn to both transcript and message history.
      setTranscript((t) => [...t, { kind: 'user', text }]);
      messagesRef.current = [...messagesRef.current, { role: 'user', content: text }];

      const ctrl = new AbortController();
      const canUseTool = makeCanUseTool(permissionMode, askUser);

      const gen = query({
        messages: messagesRef.current,
        tools: builtinTools,
        client,
        canUseTool,
        ctx: { cwd, signal: ctrl.signal },
      });

      // Track the in-flight assistant item index so deltas update the same row.
      let assistantIdx: number | null = null;
      const toolIdxByCallId = new Map<string, number>();

      try {
        while (true) {
          const next = await gen.next();
          if (next.done) {
            messagesRef.current = next.value;
            break;
          }
          const ev = next.value;

          if (ev.type === 'assistant_text_delta') {
            setTranscript((t) => {
              if (assistantIdx === null) {
                assistantIdx = t.length;
                return [...t, { kind: 'assistant', text: ev.text, streaming: true }];
              }
              const copy = t.slice();
              const cur = copy[assistantIdx];
              if (cur && cur.kind === 'assistant') {
                copy[assistantIdx] = { ...cur, text: cur.text + ev.text };
              }
              return copy;
            });
          } else if (ev.type === 'assistant_text_done') {
            setTranscript((t) => {
              if (assistantIdx === null) return t;
              const copy = t.slice();
              const cur = copy[assistantIdx];
              if (cur && cur.kind === 'assistant') {
                copy[assistantIdx] = { ...cur, text: ev.text, streaming: false };
              }
              return copy;
            });
            assistantIdx = null;
          } else if (ev.type === 'tool_call_requested') {
            setTranscript((t) => {
              const idx = t.length;
              toolIdxByCallId.set(ev.call.id, idx);
              const tool = builtinTools.find((x) => x.name === ev.call.name);
              const preview = tool ? safePreview(tool, ev.call) : JSON.stringify(ev.call.arguments);
              return [
                ...t,
                {
                  kind: 'tool',
                  callId: ev.call.id,
                  name: ev.call.name,
                  preview,
                  status: 'pending',
                },
              ];
            });
          } else if (ev.type === 'tool_call_denied') {
            updateTool(setTranscript, toolIdxByCallId, ev.toolCallId, (item) => ({
              ...item,
              status: 'denied',
              result: ev.reason,
            }));
          } else if (ev.type === 'tool_call_result') {
            updateTool(setTranscript, toolIdxByCallId, ev.result.toolCallId, (item) => ({
              ...item,
              status: ev.result.isError ? 'error' : 'ok',
              result: ev.result.content,
            }));
          } else if (ev.type === 'error') {
            setTranscript((t) => [...t, { kind: 'error', text: ev.message }]);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTranscript((t) => [...t, { kind: 'error', text: msg }]);
      } finally {
        setMode('idle');
      }
    },
    [askUser, client, cwd, mode, permissionMode],
  );

  return (
    <Box flexDirection="column">
      <Static items={[{ key: 'banner' }]}>
        {() => (
          <Box key="banner" flexDirection="column" marginBottom={1}>
            <Text color="cyan" bold>deepseek-code</Text>
            <Text color="gray">cwd: {cwd}  ·  mode: {permissionMode}  ·  Ctrl+C to exit</Text>
          </Box>
        )}
      </Static>

      <MessageList items={transcript} />

      {mode === 'awaiting_permission' && pending && (
        <PermissionPrompt
          tool={pending.tool}
          call={pending.call}
          onResolve={resolvePermission}
        />
      )}

      {mode === 'idle' && (
        <Box>
          <Text color="cyan">{'> '}</Text>
          <TextInput value={draft} onChange={setDraft} onSubmit={onSubmit} />
        </Box>
      )}

      {mode === 'busy' && (
        <Box>
          <Text color="yellow">… thinking</Text>
        </Box>
      )}
    </Box>
  );
}

function updateTool(
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptItem[]>>,
  index: Map<string, number>,
  callId: string,
  patch: (item: Extract<TranscriptItem, { kind: 'tool' }>) => TranscriptItem,
) {
  setTranscript((t) => {
    const idx = index.get(callId);
    if (idx == null) return t;
    const cur = t[idx];
    if (!cur || cur.kind !== 'tool') return t;
    const copy = t.slice();
    copy[idx] = patch(cur);
    return copy;
  });
}

function safePreview(tool: Tool, call: ToolCall): string {
  try {
    return tool.renderPreview(call.arguments as never);
  } catch {
    return JSON.stringify(call.arguments).slice(0, 120);
  }
}
