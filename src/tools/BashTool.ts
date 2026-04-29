import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  command: z.string().describe('Shell command to run. Executed via /bin/sh -c.'),
  timeout_ms: z.number().int().positive().max(600_000).optional()
    .describe('Optional timeout in milliseconds (default 120000, max 600000).'),
  description: z.string().optional().describe('Short human-readable description shown to the user.'),
});

type Input = z.infer<typeof inputSchema>;

const MAX_OUTPUT_BYTES = 100 * 1024; // 100 KB cap to keep context bounded

export const BashTool: Tool<Input> = {
  name: 'Bash',
  description:
    'Run a shell command in the working directory. Returns combined stdout+stderr and exit code. ' +
    'Use for file listing, running tests, git operations, etc. Avoid interactive commands.',
  inputSchema,
  isReadOnly: false,
  renderPreview: (i) => i.description ? `${i.description}: ${i.command}` : i.command,
  async execute(input, ctx) {
    const timeout = input.timeout_ms ?? 120_000;
    return new Promise<string>((resolvePromise, reject) => {
      const child = spawn('/bin/sh', ['-c', input.command], {
        cwd: ctx.cwd,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;

      const append = (buf: Buffer, target: 'out' | 'err') => {
        const s = buf.toString('utf8');
        if (target === 'out') {
          if (stdout.length + s.length > MAX_OUTPUT_BYTES) {
            stdout += s.slice(0, MAX_OUTPUT_BYTES - stdout.length);
            truncated = true;
          } else stdout += s;
        } else {
          if (stderr.length + s.length > MAX_OUTPUT_BYTES) {
            stderr += s.slice(0, MAX_OUTPUT_BYTES - stderr.length);
            truncated = true;
          } else stderr += s;
        }
      };

      child.stdout.on('data', (d: Buffer) => append(d, 'out'));
      child.stderr.on('data', (d: Buffer) => append(d, 'err'));

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      const onAbort = () => {
        child.kill('SIGTERM');
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });

      child.on('close', (code) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        const parts: string[] = [];
        if (stdout) parts.push(stdout);
        if (stderr) parts.push(`[stderr]\n${stderr}`);
        parts.push(`[exit code: ${code ?? 'null'}]`);
        if (truncated) parts.push('[output truncated to 100KB]');
        resolvePromise(parts.join('\n'));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },
};
