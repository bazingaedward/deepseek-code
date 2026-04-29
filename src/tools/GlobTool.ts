import { glob } from 'glob';
import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern, e.g. "**/*.ts" or "src/**/*.{ts,tsx}".'),
  path: z.string().optional().describe('Directory to search in. Defaults to cwd.'),
});

type Input = z.infer<typeof inputSchema>;

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
];

const MAX_RESULTS = 200;

export const GlobTool: Tool<Input> = {
  name: 'Glob',
  description:
    'Find files by glob pattern. Returns paths sorted by modification time (most recent first), ' +
    'capped at 200 results. Common ignores (node_modules, .git, dist, build, .next, coverage) are applied. ' +
    'Use this for file discovery before Read.',
  inputSchema,
  isReadOnly: true,
  renderPreview: (i) => `Glob "${i.pattern}"${i.path ? ` in ${i.path}` : ''}`,
  async execute(input, ctx) {
    const root = input.path
      ? (isAbsolute(input.path) ? input.path : resolve(ctx.cwd, input.path))
      : ctx.cwd;

    const matches = await glob(input.pattern, {
      cwd: root,
      ignore: DEFAULT_IGNORES,
      nodir: true,
      dot: false,
      absolute: true,
      signal: ctx.signal,
    });

    if (matches.length === 0) {
      return `No files match "${input.pattern}" in ${root}`;
    }

    const stats = await Promise.all(
      matches.map(async (m) => {
        try {
          const s = await fs.stat(m);
          return { path: m, mtime: s.mtimeMs };
        } catch {
          return { path: m, mtime: 0 };
        }
      }),
    );
    stats.sort((a, b) => b.mtime - a.mtime);

    const shown = stats.slice(0, MAX_RESULTS).map((s) => relative(ctx.cwd, s.path) || s.path);
    const header = stats.length > MAX_RESULTS
      ? `[showing ${MAX_RESULTS} of ${stats.length} matches, sorted by mtime desc]\n`
      : `[${stats.length} match${stats.length === 1 ? '' : 'es'}, sorted by mtime desc]\n`;
    return header + shown.join('\n');
  },
};
