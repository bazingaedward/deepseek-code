/**
 * Display-side model. Distinct from `Message[]` (which is what we send to
 * the LLM): a transcript item maps 1:1 to something rendered on screen.
 */
export type TranscriptItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming: boolean }
  | {
      kind: 'tool';
      callId: string;
      name: string;
      preview: string;
      status: 'pending' | 'running' | 'ok' | 'error' | 'denied';
      result?: string;
    }
  | { kind: 'error'; text: string };
