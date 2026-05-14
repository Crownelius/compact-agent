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
import { theme, sym, printToolRun, printToolResult, printThinkingOpen, printThinkingText, printThinkingClose, printCost } from './theme.js';

export interface QueryContext {
  config: CrowcoderConfig;
  messages: Message[];
  cwd: string;
  rl: readline.Interface;
  sessionId: string;
  mode: Mode;
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

    try {
      for await (const event of streamChat(ctx.config, apiMessages, ALL_TOOLS)) {
        if (event.type === 'thinking' && event.content) {
          // Show thinking tokens if the toggle is enabled
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
            process.stdout.write('\n');
            hasOutput = true;
          }
          process.stdout.write(theme.primary(event.content));
          fullText += event.content;
        } else if (event.type === 'tool_call') {
          toolCalls = event.toolCalls;
        } else if (event.type === 'done') {
          // Track usage and cost
          if (event.usage) {
            const u = event.usage;
            const { cost, warning } = trackUsage(
              ctx.sessionId,
              ctx.config.model,
              u.prompt,
              u.completion,
            );
            printCost(u.prompt, u.completion, cost, warning);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(theme.error(`\n  ${sym.error} API Error: ${msg}`));
      ctx.messages.push({ role: 'assistant', content: `[API error: ${msg}]` });
      break;
    }

    if (hasOutput) {
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
      console.log(theme.error(`  ${sym.error} Unknown tool: ${toolName}`));
      results.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: `Error: unknown tool "${toolName}"`,
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
