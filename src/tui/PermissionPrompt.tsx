import { Box, Text, useInput } from 'ink';
import type { Tool } from '../tools/Tool.js';
import type { PermissionDecision } from '../permissions/canUseTool.js';
import type { ToolCall } from '../types/message.js';

interface Props {
  tool: Tool;
  call: ToolCall;
  onResolve: (decision: PermissionDecision) => void;
}

export function PermissionPrompt({ tool, call, onResolve }: Props) {
  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') {
      onResolve({ allow: true });
    } else if (input === 'n' || input === 'N' || key.escape) {
      onResolve({ allow: false, reason: 'User declined' });
    }
  });

  const preview = safePreview(tool, call);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>Tool call requires approval</Text>
      <Box marginTop={1}>
        <Text bold>{tool.name}  </Text>
        <Text color="gray">{preview}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Approve? </Text>
        <Text color="green">[Y]es</Text>
        <Text color="gray"> / </Text>
        <Text color="red">[N]o</Text>
      </Box>
    </Box>
  );
}

function safePreview(tool: Tool, call: ToolCall): string {
  try {
    return tool.renderPreview(call.arguments as never);
  } catch {
    return JSON.stringify(call.arguments).slice(0, 200);
  }
}
