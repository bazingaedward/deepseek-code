import { Box, Text } from 'ink';
import type { TranscriptItem } from './transcript.js';

interface Props {
  items: TranscriptItem[];
}

export function MessageList({ items }: Props) {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Item item={item} />
        </Box>
      ))}
    </Box>
  );
}

function Item({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <Box>
          <Text color="cyan" bold>{'> '}</Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box flexDirection="column">
          <Text color="green" bold>● deepseek</Text>
          <Text>{item.text}{item.streaming ? '▌' : ''}</Text>
        </Box>
      );
    case 'tool':
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={statusColor(item.status)}>{statusGlyph(item.status)} </Text>
            <Text bold>{item.name}</Text>
            <Text color="gray">  {item.preview}</Text>
          </Box>
          {item.result && (
            <Box marginLeft={2} flexDirection="column">
              <Text color={item.status === 'error' ? 'red' : 'gray'}>
                {truncate(item.result, 800)}
              </Text>
            </Box>
          )}
        </Box>
      );
    case 'error':
      return (
        <Box>
          <Text color="red">! {item.text}</Text>
        </Box>
      );
  }
}

function statusGlyph(s: 'pending' | 'running' | 'ok' | 'error' | 'denied') {
  switch (s) {
    case 'pending': return '◯';
    case 'running': return '◐';
    case 'ok':      return '✓';
    case 'error':   return '✗';
    case 'denied':  return '⊘';
  }
}

function statusColor(s: 'pending' | 'running' | 'ok' | 'error' | 'denied') {
  switch (s) {
    case 'pending': return 'yellow';
    case 'running': return 'yellow';
    case 'ok':      return 'green';
    case 'error':   return 'red';
    case 'denied':  return 'gray';
  }
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n… [${s.length - n} more chars]`;
}
