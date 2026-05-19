import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import type { Message, CrowcoderConfig } from './types.js';
import type { Tool } from './tools/types.js';
import { ALL_TOOLS, getToolByName } from './tools/index.js';
import { streamChat } from './api.js';
import { checkPermission } from './permissions.js';
import { buildSystemPrompt } from './system-prompt.js';
import { runHooks } from './hooks.js';
import { scanToolCall, printSecurityWarning } from './security.js';
import { trackUsage } from './cost-tracker.js';
import { shouldCompact, compactMessages, quickCompact, DEFAULT_COMPACTION } from './compaction.js';
import type { Mode } from './modes.js';
import { theme, sym, printToolRun, printToolResult, printThinkingOpen, printThinkingText, printThinkingClose, printCost, printApiError } from './theme.js';

export interface QueryContext {
  config: CrowcoderConfig;
  messages: Message[];
  cwd: string;
  rl: readline.Interface;
  sessionId: string;
  mode: Mode;
}

/**
 * Suppress terminal echo while the model is streaming.
 *
 * Without this, keystrokes the user types mid-stream get echoed to stdout
 * (by the terminal driver in cooked mode) and interleave with the model's
 * output — e.g. "hel" appearing on the cost line.
 *
 * We put stdin in raw mode so the OS stops echoing, attach a transient
 * data listener that swallows keystrokes (preserving Ctrl+C → process exit),
 * and restore both on completion. Type-ahead is intentionally discarded;
 * the next `❯ ` prompt starts clean.
 */
function suppressInputDuringStream(): { restore: () => void } {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return { restore: () => {} };
  }
  const wasRaw = stdin.isRaw;
  const handler = (chunk: Buffer): void => {
    // 0x03 = Ctrl+C. Restore cooked mode before exiting so the shell behaves.
    if (chunk[0] === 0x03) {
      try { stdin.setRawMode(false); } catch { /* noop */ }
      process.exit(0);
    }
    // Anything else: discard silently. User has no visible feedback while
    // streaming, but that's better than scrambled output.
  };
  try { stdin.setRawMode(true); } catch { /* noop */ }
  stdin.on('data', handler);
  stdin.resume();
  return {
    restore: (): void => {
      stdin.removeListener('data', handler);
      try { stdin.setRawMode(wasRaw); } catch { /* noop */ }
    },
  };
}

/**
 * Validate tool arguments against the tool's JSON schema
 */
function validateToolArguments(tool: Tool, input: Record<string, unknown>): { valid: boolean; error?: string } {
  const schema = tool.parameters as unknown as Record<string, unknown>;
  const required = (schema.required as string[]) || [];
  const properties = (schema.properties as Record<string, unknown>) || {};

  // Check required parameters exist
  for (const param of required) {
    if (!(param in input)) {
      return { valid: false, error: `Missing required parameter: ${param}` };
    }
  }

  // Basic type checking for parameters that are specified
  for (const [key, value] of Object.entries(input)) {
    if (key in properties) {
      const propSchema = (properties[key] as Record<string, unknown>) || {};
      const expectedType = propSchema.type as string;

      if (expectedType === 'string' && typeof value !== 'string') {
        return { valid: false, error: `Parameter ${key} must be a string` };
      }
      if (expectedType === 'number' && typeof value !== 'number') {
        return { valid: false, error: `Parameter ${key} must be a number` };
      }
      if (expectedType === 'boolean' && typeof value !== 'boolean') {
        return { valid: false, error: `Parameter ${key} must be a boolean` };
      }
      if (expectedType === 'object' && typeof value !== 'object') {
        return { valid: false, error: `Parameter ${key} must be an object` };
      }
    }
  }

  return { valid: true };
}

/**
 * Main query loop: sends messages to the API, handles tool calls, loops until done.
 */
export async function runQuery(ctx: QueryContext): Promise<void> {
  const maxTurns = 50;
  let turns = 0;

  // Auto-compact if context is getting large
  if (shouldCompact(ctx.messages, DEFAULT_COMPACTION)) {
    console.log(theme.dim(`  ${sym.running} auto-compacting conversation context...`));
    ctx.messages = await compactMessages(ctx.messages, ctx.config);
  } else {
    // Quick compact: truncate oversized tool results
    ctx.messages = quickCompact(ctx.messages);
  }

  while (turns < maxTurns) {
    turns++;

    // Get the last user message for context-aware system prompt
    const lastUserMsg = ctx.messages.filter((m) => m.role === 'user').pop();
    const userQuery = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : undefined;

    // Build full messages array with system prompt
    const systemPrompt = buildSystemPrompt(ctx.config, ctx.cwd, ctx.mode, userQuery);
    const apiMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...ctx.messages,
    ];

    let fullText = '';
    let toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] | undefined;
    let hasOutput = false;
    let thinkingActive = false;
    let leadingTrimmed = false;        // strip leading whitespace from the model's first text chunk
    let lastCharWasNewline = false;    // collapse 3+ consecutive newlines down to 2
    let consecutiveNewlines = 0;

    const turnStart = Date.now();

    function writeStreamText(chunk: string): void {
      // Trim leading whitespace until the first non-whitespace character so
      // the model can't produce big vertical gaps before its real reply.
      let text = chunk;
      if (!leadingTrimmed) {
        text = text.replace(/^[\s\n]+/, '');
        if (text.length === 0) return; // entire chunk was leading whitespace
        leadingTrimmed = true;
      }
      // Collapse runs of 3+ newlines into 2 so the body of the response is
      // dense but still has paragraph breaks where the model intended them.
      let out = '';
      for (const ch of text) {
        if (ch === '\n') {
          consecutiveNewlines++;
          if (consecutiveNewlines <= 2) out += ch;
        } else {
          consecutiveNewlines = 0;
          out += ch;
        }
      }
      if (out.length === 0) return;
      lastCharWasNewline = out.endsWith('\n');
      process.stdout.write(theme.primary(out));
      fullText += out;
    }

    // Suppress terminal echo while we stream so mid-stream keystrokes
    // don't interleave with the model's output. Restored in `finally`.
    const inputGuard = suppressInputDuringStream();

    try {
      for await (const event of streamChat(ctx.config, apiMessages, ALL_TOOLS)) {
        if (event.type === 'thinking' && event.content) {
          if (ctx.config.showThinking) {
            if (!thinkingActive) {
              printThinkingOpen();
              thinkingActive = true;
            }
            printThinkingText(event.content);
          }
        } else if (event.type === 'text' && event.content) {
          if (thinkingActive) {
            printThinkingClose();
            thinkingActive = false;
          }
          if (!hasOutput) {
            hasOutput = true;
          }
          writeStreamText(event.content);
        } else if (event.type === 'tool_call') {
          toolCalls = event.toolCalls;
        } else if (event.type === 'done') {
          if (event.usage) {
            const u = event.usage;
            const { cost, warning } = trackUsage(
              ctx.sessionId,
              ctx.config.model,
              u.prompt,
              u.completion,
            );
            // Single newline separator if we just streamed text, then the
            // compact telemetry line.
            if (hasOutput && !lastCharWasNewline) process.stdout.write('\n');
            printCost(u.prompt, u.completion, cost, warning, Date.now() - turnStart);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Always close the streaming line first so the error doesn't glue to text.
      if (hasOutput && !lastCharWasNewline) process.stdout.write('\n');
      printApiError(msg, {
        baseURL: ctx.config.baseURL,
        provider: ctx.config.provider,
        model: ctx.config.model,
      });
      ctx.messages.push({ role: 'assistant', content: `[API error: ${msg}]` });
      inputGuard.restore();
      break;
    }
    inputGuard.restore();

    if (hasOutput && !lastCharWasNewline) {
      process.stdout.write('\n');
    }

    // Save assistant message
    const assistantMsg: Message = { role: 'assistant', content: fullText || null };
    if (toolCalls && toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls;
    }
    ctx.messages.push(assistantMsg);

    // If no tool calls, we're done
    if (!toolCalls || toolCalls.length === 0) break;

    // Execute tool calls
    const toolResults = await executeToolCalls(toolCalls, ctx);
    ctx.messages.push(...toolResults);
  }

  if (turns >= maxTurns) {
    console.log(theme.warning(`\n  ${sym.warn} reached max turns limit`));
  }
}

async function executeToolCalls(
  toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[],
  ctx: QueryContext,
): Promise<Message[]> {
  const results: Message[] = [];

  for (const tc of toolCalls) {
    const toolName = tc.function.name;
    const tool = getToolByName(toolName);

    if (!tool) {
      // Free models routinely hallucinate tool names (web_search_exa,
      // google_search, etc.). Telling the model exactly what IS available lets
      // it self-correct on the next iteration instead of giving up.
      const valid = ALL_TOOLS.map((t) => t.name).join(', ');
      console.log(theme.error(`  ${sym.error} Unknown tool: ${toolName} (valid: ${valid})`));
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content:
          `Error: tool "${toolName}" does not exist. Available tools: ${valid}. ` +
          `Retry with one of these exact names. Do not invent tool names — if you ` +
          `need a capability not in this list, work around it using the tools that exist ` +
          `(e.g. use web_search for discovery, web_fetch for a known URL, bash for shell-only operations).`,
      });
      continue;
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(tc.function.arguments);
    } catch {
      console.log(theme.error(`  ${sym.error} Invalid tool arguments for ${toolName}`));
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: 'Error: could not parse tool arguments as JSON',
      });
      continue;
    }

    // Validate arguments against tool's JSON schema
    const validation = validateToolArguments(tool, input);
    if (!validation.valid) {
      console.log(theme.error(`  ${sym.error} Invalid tool arguments for ${toolName}: ${validation.error}`));
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: `Error: ${validation.error}`,
      });
      continue;
    }

    // ── Security scan ─────────────────────────────────────
    const secResult = scanToolCall(toolName, input);
    if (secResult.threats.length > 0) {
      printSecurityWarning(secResult);
    }
    if (secResult.blocked) {
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: `BLOCKED by security scanner: ${secResult.threats.join('; ')}`,
      });
      continue;
    }

    // ── Pre-tool hook ─────────────────────────────────────
    const preHook = await runHooks({
      event: 'PreToolUse',
      toolName,
      toolInput: input,
      sessionId: ctx.sessionId,
      cwd: ctx.cwd,
    });
    if (!preHook.allowed) {
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: `Blocked by hook: ${preHook.message || 'denied'}`,
      });
      continue;
    }

    // ── Permission check ──────────────────────────────────
    const allowed = await checkPermission(tool, input, ctx.config, ctx.rl);
    if (!allowed) {
      console.log(theme.warning(`  ${sym.warn} Denied: ${toolName}`));
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: 'Permission denied by user.',
      });
      continue;
    }

    // ── Execute ───────────────────────────────────────────
    printToolRun(toolName, formatArgs(tool, input));

    let result;
    if (ctx.config.dryRun) {
      console.log(theme.warning(`  ${sym.pending} [DRY RUN] Would execute: ${toolName}`));
      console.log(theme.warning(`           Arguments: ${JSON.stringify(input).slice(0, 100)}`));
      result = {
        isError: false,
        output: `[DRY RUN] Tool execution skipped`,
      };
    } else {
      const startTime = Date.now();
      result = await tool.call(input, ctx.cwd);
      const elapsed = Date.now() - startTime;
      printToolResult(!result.isError, elapsed, result.output);
    }

    // ── Post-tool hook ────────────────────────────────────
    await runHooks({
      event: 'PostToolUse',
      toolName,
      toolInput: input,
      toolOutput: result.output.slice(0, 1000),
      sessionId: ctx.sessionId,
      cwd: ctx.cwd,
    });

    results.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: result.output,
    });
  }

  return results;
}

function formatArgs(tool: Tool, input: Record<string, unknown>): string {
  switch (tool.name) {
    case 'bash':
      return `$ ${input.command}`;
    case 'read_file':
      return String(input.file_path);
    case 'write_file':
      return String(input.file_path);
    case 'edit_file':
      return String(input.file_path);
    case 'grep':
      return `/${input.pattern}/${input.path ? ` in ${input.path}` : ''}`;
    case 'glob':
      return String(input.pattern);
    case 'list_dir':
      return String(input.path || '.');
    case 'web_fetch':
      return String(input.url);
    default:
      return JSON.stringify(input).slice(0, 80);
  }
}
