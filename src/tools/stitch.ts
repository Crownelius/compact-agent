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
    'Google Stitch MCP server (stitch.googleapis.com/mcp). 12 tools across 4 categories: ' +
    'Project Management (create_project, get_project, list_projects), ' +
    'Screen Management (list_screens, get_screen), ' +
    'AI Generation (generate_screen_from_text, edit_screens, generate_variants), ' +
    'Design Systems (create_design_system, update_design_system, list_design_systems, apply_design_system). ' +
    'AI Generation calls take a few minutes — do not retry on connection errors; poll with get_screen instead. ' +
    'Requires STITCH_API_KEY or `/stitch-config` setup.',
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        description: 'JSON-RPC method. "tools/call" to invoke a tool (default). "tools/list" to re-enumerate the catalog if you hit a tool-not-found error.',
      },
      name: {
        type: 'string',
        description: 'For "tools/call": the exact tool name (e.g. "list_projects", "generate_screen_from_text", "edit_screens"). See description for the full 12-tool catalog.',
      },
      arguments: {
        type: 'object',
        description: 'For "tools/call": tool-specific arguments. Examples: get_project → { name: "projects/{id}" }; list_screens → { projectId: "<id>" }; generate_screen_from_text → { projectId, prompt, deviceType?: "MOBILE"|"DESKTOP"|"TABLET"|"AGNOSTIC", modelId?: "GEMINI_3_PRO"|"GEMINI_3_FLASH" }.',
      },
    },
    required: ['method'],
  },
  isReadOnly: false,
  // Marked destructive because the tool covers AI Generation (generate_screen_
  // from_text, edit_screens, generate_variants) and Design System mutations
  // (create/update/apply). Permission gating in permissions.ts will prompt
  // under /perm ask, auto-approve in /perm yolo.
  isDestructive: true,

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
