import { Command } from 'commander';
import { render } from 'ink';
import { createElement } from 'react';
import { loadSettings } from './config/settings.js';
import { createDeepSeekClient } from './llm/client.js';
import type { PermissionMode } from './permissions/canUseTool.js';
import { App } from './tui/App.js';

async function main() {
  const program = new Command();
  program
    .name('dsc')
    .description('deepseek-code: a minimal Claude-Code-style CLI agent powered by DeepSeek')
    .version('0.1.0')
    .option('--accept-edits', 'auto-approve file edits (still prompts for Bash)')
    .option('--dangerously-skip-permissions', 'auto-approve all tool calls — use with care')
    .option('--cwd <dir>', 'working directory (defaults to process.cwd())')
    .parse();

  const opts = program.opts<{
    acceptEdits?: boolean;
    dangerouslySkipPermissions?: boolean;
    cwd?: string;
  }>();

  const settings = loadSettings();
  const client = createDeepSeekClient(settings);
  const cwd = opts.cwd ?? process.cwd();
  const permissionMode: PermissionMode = opts.dangerouslySkipPermissions
    ? 'bypass'
    : opts.acceptEdits
      ? 'acceptEdits'
      : 'default';

  const { waitUntilExit } = render(
    createElement(App, { client, cwd, permissionMode }),
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
