import { BashTool } from './BashTool.js';
import { EditTool } from './EditTool.js';
import { GlobTool } from './GlobTool.js';
import { GrepTool } from './GrepTool.js';
import { ReadTool } from './ReadTool.js';
import type { Tool } from './Tool.js';
import { WriteTool } from './WriteTool.js';

export const builtinTools: Tool[] = [
  ReadTool as Tool,
  WriteTool as Tool,
  EditTool as Tool,
  BashTool as Tool,
  GlobTool as Tool,
  GrepTool as Tool,
];
