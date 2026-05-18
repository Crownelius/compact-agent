import type { Tool } from './types.js';
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool } from './edit.js';
import { GrepTool } from './grep.js';
import { GlobTool } from './glob.js';
import { WebFetchTool } from './web-fetch.js';
import { WebSearchTool } from './web-search.js';
import { ListDirTool } from './list-dir.js';
import { StitchTool } from './stitch.js';
import { stitchConfigured } from '../stitch.js';

// Stitch is only listed in the tool registry when configured — otherwise
// free models hallucinate calls to it and waste turns on auth errors.
const OPTIONAL_TOOLS: Tool[] = [];
if (stitchConfigured()) OPTIONAL_TOOLS.push(StitchTool);

export const ALL_TOOLS: Tool[] = [
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GrepTool,
  GlobTool,
  ListDirTool,
  WebFetchTool,
  WebSearchTool,
  ...OPTIONAL_TOOLS,
];

export function getToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.name);
}

export function getToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export type { Tool, ToolResult } from './types.js';
