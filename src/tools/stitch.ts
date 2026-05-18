/**
 * stitch tool — calls the Google Stitch MCP server.
 *
 * The LLM uses this to manage UI/UX design projects on Stitch:
 *   - List the user's projects
 *   - Read screens within a project
 *   - Download assets (images, HTML)
 *   - Generate a new screen from a text prompt
 *
 * Auth: API key from ~/.crowcoder/stitch.json or STITCH_API_KEY env var.
 * Configure with `/stitch-config <key>` inside the REPL.
 */
import type { Tool, ToolResult } from './types.js';
import { callStitchMcp, stitchConfigured } from '../stitch.js';

export const StitchTool: Tool = {
  name: 'stitch',
  description:
    'Call the Google Stitch MCP server (stitch.googleapis.com/mcp) for UI/UX design management. ' +
    'Methods: "tools/list" (enumerate available tools — call this first if unsure) and "tools/call" ' +
    '(invoke a named tool with arguments). Common tool names: list_projects, get_project, list_screens, ' +
    'download_asset, generate_screen_from_text. Requires STITCH_API_KEY or `/stitch-config` setup.',
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        description: 'JSON-RPC method. Either "tools/list" to enumerate available tools, or "tools/call" to invoke one.',
      },
      name: {
        type: 'string',
        description: 'For "tools/call": the tool name (e.g. "list_projects", "generate_screen_from_text"). Ignored for "tools/list".',
      },
      arguments: {
        type: 'object',
        description: 'For "tools/call": the tool arguments. e.g. for generate_screen_from_text: { "prompt": "...", "model": "gemini-3-flash" }. Defaults to {}.',
      },
    },
    required: ['method'],
  },
  isReadOnly: false, // generate_screen_from_text creates assets on Stitch
  isDestructive: false,

  async call(input): Promise<ToolResult> {
    if (!stitchConfigured()) {
      return {
        output: 'Stitch is not configured. Run `/stitch-config <api-key>` in the REPL, or set STITCH_API_KEY in your environment. Get a key from https://stitch.withgoogle.com/ → Stitch Settings → API Keys.',
        isError: true,
      };
    }

    const method = String(input.method || '').trim();
    if (!method) {
      return { output: 'stitch: missing required parameter "method"', isError: true };
    }
    if (method !== 'tools/list' && method !== 'tools/call') {
      return {
        output: `stitch: unsupported method "${method}". Use "tools/list" or "tools/call".`,
        isError: true,
      };
    }

    let params: Record<string, unknown> = {};
    if (method === 'tools/call') {
      const name = String(input.name || '').trim();
      if (!name) {
        return {
          output: 'stitch: "tools/call" requires a "name" parameter. Run with method="tools/list" first to discover available tools.',
          isError: true,
        };
      }
      params = {
        name,
        arguments: (input.arguments as Record<string, unknown>) || {},
      };
    }

    const resp = await callStitchMcp({ method, params });
    if (!resp.ok) {
      return {
        output: `stitch error${resp.status ? ` (HTTP ${resp.status})` : ''}: ${resp.error?.message || 'unknown error'}`,
        isError: true,
      };
    }

    // Truncate huge payloads (Stitch can return image bytes / large HTML)
    const formatted = typeof resp.result === 'string'
      ? resp.result
      : JSON.stringify(resp.result, null, 2);
    const MAX = 100_000;
    const output = formatted.length > MAX
      ? formatted.slice(0, MAX) + `\n…[truncated ${formatted.length - MAX} bytes]`
      : formatted;

    return { output, isError: false };
  },
};
