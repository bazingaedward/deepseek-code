import { Box, Text } from 'ink';
import type { LLMClient } from '../llm/client.js';
import type { PermissionMode } from '../permissions/canUseTool.js';
import { Repl } from './Repl.js';

interface Props {
  client: LLMClient;
  cwd: string;
  permissionMode: PermissionMode;
}

export function App({ client, cwd, permissionMode }: Props) {
  return (
    <Box flexDirection="column" padding={1}>
      <Repl client={client} cwd={cwd} permissionMode={permissionMode} />
      <Box marginTop={1}>
        <Text color="gray">─────────────────</Text>
      </Box>
    </Box>
  );
}
