#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, '../dist/index.js');
const source = resolve(here, '../src/index.ts');

if (existsSync(built)) {
  await import(built);
} else if (existsSync(source)) {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport(source, import.meta.url);
} else {
  console.error('deepseek-code: no built output and no source. Run `npm run build` or `npm run dev`.');
  process.exit(1);
}
