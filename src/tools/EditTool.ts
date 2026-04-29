import { promises as fs } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to edit.'),
  old_string: z.string().describe('Exact text to replace. Must match uniquely unless replace_all is true.'),
  new_string: z.string().describe('Replacement text.'),
  replace_all: z.boolean().optional().describe('Replace every occurrence instead of requiring uniqueness.'),
});

type Input = z.infer<typeof inputSchema>;

export const EditTool: Tool<Input> = {
  name: 'Edit',
  description:
    'Replace exact text in a file. By default old_string must occur exactly once. ' +
    'Set replace_all to substitute every occurrence (good for renames).',
  inputSchema,
  isReadOnly: false,
  renderPreview: (i) =>
    `Edit ${i.file_path} (${i.replace_all ? 'replace all' : 'single occurrence'})`,
  async execute(input, ctx) {
    const path = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(ctx.cwd, input.file_path);
    const original = await fs.readFile(path, 'utf8');

    if (!original.includes(input.old_string)) {
      throw new Error(`old_string not found in ${path}`);
    }

    let updated: string;
    if (input.replace_all) {
      updated = original.split(input.old_string).join(input.new_string);
    } else {
      const first = original.indexOf(input.old_string);
      const second = original.indexOf(input.old_string, first + input.old_string.length);
      if (second !== -1) {
        throw new Error(
          `old_string is not unique in ${path}. Pass replace_all=true or include more surrounding context.`,
        );
      }
      updated = original.slice(0, first) + input.new_string + original.slice(first + input.old_string.length);
    }

    await fs.writeFile(path, updated, 'utf8');
    const count = (original.length - updated.length + input.new_string.length * 1) / 1; // not exact, just informative
    return `Edited ${path}. Old size: ${original.length}, new size: ${updated.length}.`;
  },
};
