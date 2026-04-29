import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  file_path: z.string().describe('Absolute path to write to. Parent directories will be created.'),
  content: z.string().describe('Full file content. Overwrites any existing file.'),
});

type Input = z.infer<typeof inputSchema>;

export const WriteTool: Tool<Input> = {
  name: 'Write',
  description: 'Write a file to the filesystem, creating parent directories as needed. Overwrites if it exists.',
  inputSchema,
  isReadOnly: false,
  renderPreview: (i) => `Write ${i.file_path} (${i.content.length} bytes)`,
  async execute(input, ctx) {
    const path = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(ctx.cwd, input.file_path);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, input.content, 'utf8');
    return `Wrote ${input.content.length} bytes to ${path}`;
  },
};
