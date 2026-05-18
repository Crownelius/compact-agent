/**
 * Stitch integration — Google's AI UI/UX design + code generation tool.
 *
 * Ports gemini-cli-extensions/stitch into compact-agent. Two surfaces:
 *
 *   1. A `stitch` tool (src/tools/stitch.ts) that the LLM can call to hit
 *      the Stitch MCP server at stitch.googleapis.com/mcp via JSON-RPC.
 *
 *   2. A `/stitch <query>` slash command (wired in src/index.ts) that
 *      injects a system-prompt addition copied from the upstream
 *      gemini-extension commands/stitch.toml — intent routing between
 *      "enhance a prompt" and "use the assistant" modes.
 *
 * Auth: API key only, stored at ~/.crowcoder/stitch.json. ADC auth
 * (Google Cloud) would require gcloud + the OAuth dance — out of scope
 * for now. Get a key from https://stitch.withgoogle.com/ → profile menu
 * → Stitch Settings → API Keys → Create Key.
 *
 * Bypass the config file via STITCH_API_KEY env var.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { getConfigDir } from './config.js';

const STITCH_MCP_URL = 'https://stitch.googleapis.com/mcp';
const STITCH_CONFIG_FILE = join(getConfigDir(), 'stitch.json');

// ── Config ──────────────────────────────────────────────
export interface StitchConfig {
  apiKey: string;
  configuredAt: string;
}

export function loadStitchConfig(): StitchConfig | null {
  const envKey = process.env.STITCH_API_KEY;
  if (envKey) {
    return { apiKey: envKey, configuredAt: '(from STITCH_API_KEY env)' };
  }
  if (!existsSync(STITCH_CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STITCH_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveStitchConfig(apiKey: string): void {
  mkdirSync(getConfigDir(), { recursive: true });
  const cfg: StitchConfig = {
    apiKey,
    configuredAt: new Date().toISOString(),
  };
  writeFileSync(STITCH_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function stitchConfigured(): boolean {
  return loadStitchConfig() !== null;
}

// ── Minimal MCP JSON-RPC client ─────────────────────────
/**
 * Call the Stitch MCP server. MCP uses JSON-RPC 2.0 over HTTP. We support
 * the two methods we need:
 *
 *   tools/list   →  enumerate available tools
 *   tools/call   →  invoke a tool by name with args
 *
 * The server returns either `{ result: ... }` or `{ error: { code, message } }`.
 */
export interface McpRpcRequest {
  method: 'tools/list' | 'tools/call' | string;
  params?: Record<string, unknown>;
}

export interface McpRpcResponse {
  ok: boolean;
  result?: unknown;
  error?: { code?: number; message: string };
  status?: number;
}

export async function callStitchMcp(req: McpRpcRequest): Promise<McpRpcResponse> {
  const cfg = loadStitchConfig();
  if (!cfg) {
    return {
      ok: false,
      error: { message: 'Stitch not configured. Run /stitch-config to set an API key, or set STITCH_API_KEY in your env.' },
    };
  }

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: req.method,
    params: req.params ?? {},
  };

  try {
    const resp = await fetch(STITCH_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Goog-Api-Key': cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: {
          message: parsed?.error?.message || `HTTP ${resp.status}: ${text.slice(0, 200)}`,
          code: parsed?.error?.code,
        },
      };
    }

    if (parsed?.error) {
      return { ok: false, status: resp.status, error: parsed.error };
    }

    return { ok: true, status: resp.status, result: parsed?.result ?? parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { message: `Network error: ${msg}` } };
  }
}

/**
 * /stitch-tools — inject a prompt that drives the agent to call tools/list
 * and pretty-print the catalog. Routes through the standard LLM tool loop
 * (async via runQuery) so we don't need to make handleSlashCommand async.
 */
export function buildStitchToolsPrompt(): string {
  return `# Stitch — list available MCP tools

Call the \`stitch\` tool with:

\`\`\`json
{ "method": "tools/list" }
\`\`\`

The response will be \`{ tools: [{ name, description, inputSchema }, ...] }\`.

Then render the catalog as a clean Markdown table with columns:
- **name** (exact string the user types)
- **description** (first line, trimmed)
- **required args** (comma-separated list from inputSchema.required, or "—")

If the call fails (non-ok response), report the HTTP status and error
message verbatim and suggest:
  - Check the API key is valid (\`/stitch-status\`)
  - Re-set it via \`/stitch-config <api-key>\`
  - Confirm internet reachability

Do not invoke any tools other than \`stitch\`. Do not edit any files.`;
}

// ── Status ──────────────────────────────────────────────
export function printStitchStatus(): void {
  const cfg = loadStitchConfig();
  console.log(chalk.cyan('\n  Stitch integration'));
  if (!cfg) {
    console.log(chalk.yellow('    not configured'));
    console.log(chalk.dim('    Configure with /stitch-config <api-key>'));
    console.log(chalk.dim('    Or: $env:STITCH_API_KEY = "..." (PowerShell)'));
    console.log(chalk.dim('         export STITCH_API_KEY="..." (POSIX)'));
    console.log(chalk.dim('    Get a key: https://stitch.withgoogle.com/ → Stitch Settings → API Keys'));
    console.log();
    return;
  }
  const masked = cfg.apiKey.length > 8
    ? cfg.apiKey.slice(0, 4) + '...' + cfg.apiKey.slice(-4)
    : '***';
  console.log(chalk.dim(`    api key:       ${masked}`));
  console.log(chalk.dim(`    configured at: ${cfg.configuredAt}`));
  console.log(chalk.dim(`    server:        ${STITCH_MCP_URL}`));
  console.log(chalk.dim(`\n    Try: /stitch list my projects`));
  console.log(chalk.dim(`         /stitch generate a landing page for a podcast about productivity`));
  console.log(chalk.dim(`         /stitch enhance: dark dashboard with sidebar nav and 3 charts`));
  console.log();
}

// ── Prompt builder (ports gemini-extension/commands/stitch.toml) ─────
/**
 * Returns the prompt body for /stitch <query>. The model is given an intent
 * router (enhance vs assistant) and instructions to call the `stitch` tool
 * for any operations that need the MCP server.
 */
export function buildStitchPrompt(query: string): string {
  const safeQuery = query.replace(/`/g, '\\`');
  return `# Stitch Intelligent Interface

You are the Stitch interface inside Compact Agent. Stitch is Google's AI
UI/UX design and code generation tool (https://stitch.withgoogle.com/).
You can call the Stitch MCP server via the \`stitch\` tool with parameters:

  { "method": "tools/list" }                            — list available tools
  { "method": "tools/call",
    "name": "<tool-name>",
    "arguments": { ... } }                              — invoke a tool

Common tool names you may encounter (discover the real list via
\`tools/list\` if a call fails): \`list_projects\`, \`get_project\`,
\`list_screens\`, \`download_asset\`, \`generate_screen_from_text\`.

The user's query is: "${safeQuery}"

## Intent classification

Analyze the query. Does the user want to **Enhance / Improve** a design
prompt?

* **YES** (triggers: "enhance", "refine", "make this better", "improve my prompt"):
  Go to PROTOCOL A.
* **NO** (triggers: "help", "list projects", "show screens", "generate a UI for X",
  or general chat about Stitch):
  Go to PROTOCOL B.

## PROTOCOL A: ENHANCE

1. Call \`web_fetch\` on https://discuss.ai.google.dev/t/stitch-prompt-guide/83844
   and read the Stitch Effective Prompting Guide. Absorb its prompting
   philosophy and structural templates.
2. Generate a \`snake_case\` filename based on the topic (e.g. \`podcast_landing_page.md\`).
3. Rewrite the user's raw intent (the query above, minus the "enhance"
   trigger word) into a polished prompt document following the guide.
4. Call \`write_file\` to save the enhanced content to the calculated
   filename in the current working directory.
5. Reply: "✨ Enhanced prompt saved to \`[filename]\` using the Stitch
   Effective Prompting Guide."

## PROTOCOL B: ASSISTANT

1. If the user asks what you can do: explain that you are an interface to
   Stitch — Google's AI tool that generates UI designs from text prompts
   and images, iterates on designs quickly, and exports HTML + Tailwind
   CSS code.

2. **For any operation that needs Stitch data, ALWAYS follow this two-step
   discover-then-call flow** to handle tool-name drift between docs and
   the live server:

   **Step 2a — discover** (call this first if you haven't this session):
   \`\`\`json
   { "method": "tools/list" }
   \`\`\`
   The response shape is \`{ tools: [{ name, description, inputSchema }, ...] }\`.
   Note the exact tool names and required arguments.

   **Step 2b — call**:
   \`\`\`json
   { "method": "tools/call",
     "name": "<exact-name-from-step-2a>",
     "arguments": { "<arg>": "<value>", ... } }
   \`\`\`

3. Likely tool names (verify via tools/list — exact strings may differ):
   - \`list_projects\` — args: usually none. Returns project list.
   - \`get_project\` — args: \`project_id\`.
   - \`list_screens\` — args: \`project_id\`. Returns screens.
   - \`download_asset\` — args: \`screen_id\`, possibly \`format\` (image/html).
   - \`generate_screen_from_text\` — args: \`prompt\` (required),
     \`model\` (optional: \`gemini-3-flash\` default, or \`gemini-3-pro\`).

4. Domain model: a user has **projects**; each project has many **screens**;
   each screen has an **image** + a full HTML/Tailwind document. When the
   user says "design", they usually mean a single screen or a full project.

5. Error handling: if a tool call returns "tool not found" or "unknown
   tool", re-run \`tools/list\` and pick the closest matching name.
   Don't guess.

6. Respond conversationally with the result of any tool call. For lists,
   show ids + names in a table. For generated screens, share the screen
   id + a brief description; if the user wants the code, call
   \`download_asset\` with the appropriate format.`;
}

// ── Re-exports ──────────────────────────────────────────
export { STITCH_MCP_URL, STITCH_CONFIG_FILE };
