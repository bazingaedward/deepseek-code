import { glob } from 'glob';
import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './Tool.js';

const inputSchema = z.object({
  pattern: z.string().describe('Regex (JS RegExp syntax). Anchors and lookarounds are supported.'),
  path: z.string().optional().describe('Directory to search. Defaults to cwd.'),
  glob: z.string().optional().describe('File-name filter glob, e.g. "**/*.ts". Default: all text files.'),
  case_insensitive: z.boolean().optional().describe('Match case-insensitively (i flag).'),
  output_mode: z
    .enum(['content', 'files_with_matches', 'count'])
    .optional()
    .describe('"content" (default) shows file:line:text; "files_with_matches" lists files; "count" shows match count per file.'),
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

const MAX_FILES_SCANNED = 1000;
const MAX_RESULT_LINES = 200;
const MAX_FILE_BYTES = 1_000_000; // 1MB cap per file
const BINARY_SNIFF_BYTES = 512;

export const GrepTool: Tool<Input> = {
  name: 'Grep',
  description:
    'Search file contents with a regex. Pure-JS implementation (no ripgrep dependency). ' +
    'Skips binary files and common ignore dirs. Output capped at 200 lines. ' +
    'Use the `glob` arg to scope file types, e.g. glob="**/*.ts".',
  inputSchema,
  isReadOnly: true,
  renderPreview: (i) =>
    `Grep /${i.pattern}/${i.case_insensitive ? 'i' : ''} ` +
    `${i.glob ?? '**/*'}${i.path ? ` in ${i.path}` : ''}`,
  async execute(input, ctx) {
    const root = input.path
      ? (isAbsolute(input.path) ? input.path : resolve(ctx.cwd, input.path))
      : ctx.cwd;

    let regex: RegExp;
    try {
      regex = new RegExp(input.pattern, input.case_insensitive ? 'i' : '');
    } catch (err) {
      throw new Error(`Invalid regex: ${err instanceof Error ? err.message : String(err)}`);
    }

    const filePattern = input.glob ?? '**/*';
    const files = await glob(filePattern, {
      cwd: root,
      ignore: DEFAULT_IGNORES,
      nodir: true,
      dot: false,
      absolute: true,
      signal: ctx.signal,
    });

    const mode = input.output_mode ?? 'content';
    const lines: string[] = [];
    const fileCounts = new Map<string, number>();
    const filesWithMatch = new Set<string>();
    let totalMatches = 0;
    let scanned = 0;
    let truncated = false;

    for (const file of files) {
      if (ctx.signal.aborted) break;
      if (scanned >= MAX_FILES_SCANNED) {
        truncated = true;
        break;
      }
      scanned++;

      let content: string;
      try {
        const buf = await fs.readFile(file);
        if (buf.length > MAX_FILE_BYTES) continue;
        if (looksBinary(buf)) continue;
        content = buf.toString('utf8');
      } catch {
        continue;
      }

      const fileLines = content.split('\n');
      let matchCount = 0;

      for (let i = 0; i < fileLines.length; i++) {
        if (regex.test(fileLines[i]!)) {
          matchCount++;
          totalMatches++;
          if (mode === 'content') {
            if (lines.length < MAX_RESULT_LINES) {
              lines.push(`${relative(ctx.cwd, file)}:${i + 1}:${fileLines[i]}`);
            } else {
              truncated = true;
            }
          }
        }
      }

      if (matchCount > 0) {
        filesWithMatch.add(file);
        fileCounts.set(file, matchCount);
      }
    }

    if (totalMatches === 0) {
      return `No matches for /${input.pattern}/ in ${scanned} file${scanned === 1 ? '' : 's'}`;
    }

    if (mode === 'files_with_matches') {
      const list = [...filesWithMatch].map((f) => relative(ctx.cwd, f)).sort();
      return `[${list.length} file${list.length === 1 ? '' : 's'} with matches]\n${list.join('\n')}`;
    }
    if (mode === 'count') {
      const entries = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([f, c]) => `${c}\t${relative(ctx.cwd, f)}`);
      return `[${totalMatches} matches across ${entries.length} files]\n${entries.join('\n')}`;
    }

    const header =
      `[${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ${filesWithMatch.size} file` +
      `${filesWithMatch.size === 1 ? '' : 's'}, scanned ${scanned}${truncated ? ', truncated' : ''}]`;
    return [header, ...lines].join('\n');
  },
};

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
