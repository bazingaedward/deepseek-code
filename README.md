# deepseek-code

A minimal Claude-Code-style CLI coding agent powered by DeepSeek.

This is a v0 closed loop: streaming chat, tool calls with per-call permission prompts, and four built-in tools (Read, Write, Edit, Bash). The architecture mirrors Claude Code at a high level — generator-based agent loop, Zod tool schemas, awaitable permission gate, Ink-based TUI — so growing the surface (slash commands, sessions, MCP, hooks) is mostly additive.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env and set DEEPSEEK_API_KEY
npm run dev
```

Or build and run:

```bash
npm run build
./bin/dsc.js
```

## Flags

| Flag | Effect |
| --- | --- |
| `--accept-edits` | Auto-approve Read/Write/Edit; still prompt for Bash |
| `--dangerously-skip-permissions` | Auto-approve everything |
| `--cwd <dir>` | Set working directory |

## Architecture

```
src/
├── index.ts              # CLI entry: arg parsing, render Ink root
├── tui/                  # Ink components
│   ├── App.tsx           # root, global keybindings
│   ├── Repl.tsx          # message list + input + permission prompt orchestrator
│   ├── MessageList.tsx
│   ├── PermissionPrompt.tsx
│   └── transcript.ts
├── agent/
│   ├── query.ts          # async function* — the agent loop
│   ├── runTools.ts       # tool dispatch with permission gate
│   └── systemPrompt.ts
├── llm/
│   ├── client.ts         # DeepSeek (OpenAI-compatible) streaming client
│   └── adapter.ts        # tool/message ↔ OpenAI format, stream accumulator
├── tools/
│   ├── Tool.ts           # interface
│   ├── registry.ts       # builtinTools list
│   ├── ReadTool.ts
│   ├── WriteTool.ts
│   ├── EditTool.ts
│   └── BashTool.ts
├── permissions/
│   └── canUseTool.ts     # awaitable permission gate
├── config/
│   └── settings.ts       # .env loader
└── types/
    └── message.ts        # Message + AgentEvent unions
```

### The agent loop

`src/agent/query.ts` is an `async function*` that:

1. Calls the LLM with the current `messages[]` and `tools[]`.
2. Yields text deltas as they stream; consumers (the TUI) update the assistant row.
3. When the stream ends with tool calls, dispatches them through `runTools` — which awaits the `canUseTool` permission gate before each execution.
4. Appends the assistant message + each tool result to `messages[]` and loops, until the LLM responds with no tool calls (or `maxTurns` is hit).

Every tool execution flows through `canUseTool`, which is the seam where the TUI surfaces a Y/N prompt and blocks the loop until the user decides.

### Adding a tool

Implement `Tool<Input>` from `src/tools/Tool.ts` (`name`, `description`, `inputSchema`, `isReadOnly`, `renderPreview`, `execute`) and add it to `src/tools/registry.ts`.

## Roadmap

- Slash commands (`/clear`, `/compact`, `/help`)
- Session persistence + resume
- Glob / Grep / WebFetch tools
- Hooks (PreToolUse / PostToolUse / Stop)
- MCP client
- `CLAUDE.md`-equivalent project-memory injection

## License

MIT
