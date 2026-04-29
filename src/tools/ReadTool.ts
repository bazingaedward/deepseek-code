import { promises as fs } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to read.'),
  offset: z.number().int().nonnegative().optional().describe('Line number to start from (0-indexed).'),
  limit: z.number().int().positive().optional().describe('Maximum number of lines to read.'),
});

type Input = z.infer<typeof inputSchema>;

export const ReadTool: Tool<Input> = {
  name: 'Read',
  description: 'Read a file from the filesystem. Returns content with line numbers (cat -n style).',
  inputSchema,
  isReadOnly: true,
  renderPreview: (i) => `Read ${i.file_path}${i.offset != null ? ` from line ${i.offset}` : ''}`,
  async execute(input, ctx) {
    const path = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(ctx.cwd, input.file_path);
    const raw = await fs.readFile(path, 'utf8');
    const lines = raw.split('\n');
    const start = input.offset ?? 0;
    const end = input.limit ? start + input.limit : lines.length;
    const slice = lines.slice(start, end);
    return slice.map((l, i) => `${(start + i + 1).toString().padStart(6)}\t${l}`).join('\n');
  },
};
