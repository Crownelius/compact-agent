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
import { theme, sym, printToolRun, printToolResult, printThinkingOpen, printThinkingText, printThinkingClose, printCost, printApiError, formatDuration } from './theme.js';
import {
  isVoiceEnabled, getTtsConfig, getAccessibilityConfig,
  speakAssistantResponse, speak, speakUserEcho,
} from './voice.js';
import { isLikelyDestructive, describeDestructive, countWords, summarize } from './accessibility.js';
import { audioCue } from './audio.js';
import { setStatus } from './status.js';

export interface QueryContext {
  config: CrowcoderConfig;
  messages: Message[];
  cwd: string;
  rl: readline.Interface;
  sessionId: string;
  mode: Mode;
}

/**
 * Suppress input during streaming.
 *
 * The previous version only set raw mode and added a passive 'data' swallow
 * listener — but readline's Interface registers its own 'keypress' listener
 * that fires in parallel. That listener does TWO things we don't want:
 *   1. Echoes every typed character back to stdout (readline does the echo
 *      itself in raw mode, since the terminal can't), polluting the streamed
 *      response text
 *   2. Buffers characters into its internal line state, so when the next
 *      `rl.question()` runs the user finds their mid-stream typing already
 *      sitting in the prompt
 *
 * So we surgically detach readline's keypress listener for the duration of
 * the stream and reattach it on restore. The tagged F-key handler from
 * index.ts (carrying __crowcoderHotkey__) is preserved so F1–F10 still
 * work during streaming.
 *
 * We also add a 'data' listener purely so Ctrl+C still exits cleanly while
 * readline is detached.
 */
type TaggedListener = ((...args: unknown[]) => void) & { __crowcoderHotkey__?: boolean };

function suppressInputDuringStream(): { restore: () => void } {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return { restore: () => {} };
  }
  const wasRaw = stdin.isRaw;

  // Snapshot the keypress listeners that aren't ours. Those are what we
  // need to detach to stop readline from echoing + buffering. Slice to
  // protect against the array mutating mid-iteration.
  const allKeypressListeners = stdin.listeners('keypress').slice() as TaggedListener[];
  const detachedListeners = allKeypressListeners.filter(
    (l) => !l.__crowcoderHotkey__,
  );
  for (const l of detachedListeners) {
    stdin.removeListener('keypress', l);
  }

  // Swallow data — Ctrl+C still exits, everything else is discarded so
  // it can't bubble up to anything we missed.
  const dataHandler = (chunk: Buffer): void => {
    if (chunk[0] === 0x03) {
      try { stdin.setRawMode(false); } catch { /* noop */ }
      process.exit(0);
    }
  };
  try { stdin.setRawMode(true); } catch { /* noop */ }
  stdin.on('data', dataHandler);
  stdin.resume();

  return {
    restore: (): void => {
      stdin.removeListener('data', dataHandler);
      // Re-attach readline's keypress listeners in the original order.
      for (const l of detachedListeners) {
        stdin.on('keypress', l);
      }
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
  // Track total wall time for this response chain (user message →
  // assistant ending without a tool call). Printed once when the loop exits.
  const chainStart = Date.now();

  // ── Voice: echo the user's input in the user-echo voice ────
  // Run async without awaiting — we don't want to block the API call on
  // ElevenLabs latency. The echo will play while the model is thinking.
  if (isVoiceEnabled(ctx.config) && getTtsConfig(ctx.config).echoUser) {
    const lastUser = [...ctx.messages].reverse().find((m) => m.role === 'user');
    const text = typeof lastUser?.content === 'string' ? lastUser.content : '';
    if (text) speakUserEcho(text, ctx.config).catch(() => { /* noop */ });
  }

  // Track the accumulated assistant text across the whole chain so we can
  // TTS it (or its summary) once the chain ends. We collect text from every
  // assistant turn, but the final TTS pass only fires after the no-tool-call
  // exit so tool descriptions aren't read out.
  let accumulatedAssistantText = '';

  // Auto-compact if context is getting large
  if (shouldCompact(ctx.messages, DEFAULT_COMPACTION)) {
    console.log(theme.dim(`  ${sym.running} auto-compacting conversation context...`));
    setStatus({ state: 'compacting' });
    ctx.messages = await compactMessages(ctx.messages, ctx.config);
  } else {
    // Quick compact: truncate oversized tool results
    ctx.messages = quickCompact(ctx.messages);
  }

  // Tell the status singleton who we are. This is what F2 ("where am I?")
  // speaks back to the user. Updated once per chain — model/provider/mode
  // can't change mid-chain.
  setStatus({
    model: ctx.config.model,
    provider: ctx.config.provider,
    mode: ctx.mode,
    permissionMode: ctx.config.permissionMode,
  });

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

    // We're about to wait on the API; tell the status singleton so a blind
    // user pressing F1 hears "calling claude-sonnet-4, 6 seconds elapsed"
    // instead of a stale "idle".
    setStatus({ state: 'streaming' });

    try {
      for await (const event of streamChat(ctx.config, apiMessages, ALL_TOOLS)) {
        if (event.type === 'thinking' && event.content) {
          // showThinking defaults to true; only off when explicitly disabled.
          if (ctx.config.showThinking !== false) {
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
            // First token arrived; promote status so F1 reports "receiving"
            // rather than the still-waiting "streaming" message.
            setStatus({ state: 'responding' });
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
      // Voice: announce errors aloud for screen-reader users
      if (isVoiceEnabled(ctx.config) && getAccessibilityConfig(ctx.config).announceErrors) {
        const tts = getTtsConfig(ctx.config);
        if (tts.apiKey) {
          // Keep it terse — one short sentence — to avoid burning quota on
          // long stack traces. The error pretty-printer already showed the
          // categorized version to the screen-reader.
          speak(`API error: ${msg.slice(0, 120)}`, ctx.config, { voiceId: tts.assistantVoiceId }).catch(() => { /* noop */ });
        }
        if (getAccessibilityConfig(ctx.config).audioCues) {
          audioCue('error').catch(() => { /* noop */ });
        }
      }
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

    // Accumulate visible assistant text for chain-end TTS. We don't TTS
    // mid-chain because the model often emits short bridging sentences
    // between tool calls — speaking each one is noisy and slow.
    if (fullText) accumulatedAssistantText += (accumulatedAssistantText ? '\n\n' : '') + fullText;

    // If no tool calls, we're done
    if (!toolCalls || toolCalls.length === 0) break;

    // Execute tool calls — executeToolCalls itself flips per-tool state
    const toolResults = await executeToolCalls(toolCalls, ctx);
    ctx.messages.push(...toolResults);
  }

  // Chain ended; back to idle so F1 reports the correct state.
  setStatus({ state: 'idle' });

  // ── Voice: read the assistant's final response ────────────
  // Off the hot path — fire-and-forget so the next prompt appears
  // immediately. The playback runs in background; F2 pauses, F4 skips.
  if (isVoiceEnabled(ctx.config) && accumulatedAssistantText.trim()) {
    const tts = getTtsConfig(ctx.config);
    if (tts.apiKey) {
      const a = getAccessibilityConfig(ctx.config);
      let toRead = accumulatedAssistantText;
      // If the response is long, abbreviate via cheap heuristic summary so
      // blind users aren't forced to listen to 800 words. They can press
      // F3 (replay) on chunks or ask "give me the full version" verbally.
      const words = countWords(toRead);
      if (words >= a.longResponseThreshold) {
        toRead = summarize(toRead, a.longResponseThreshold);
      }
      // Register an abort controller + last-chunk + last-full-response
      // globally so the hotkey handler in index.ts can cancel / replay.
      // - __voiceLastChunk drives PGUP "replay last chunk"
      // - __voiceLastFullResponse drives F3 "read full" + F4 "read summary"
      const g = globalThis as {
        __voicePlaybackCtl?: AbortController | null;
        __voiceLastChunk?: string | null;
        __voiceLastFullResponse?: string | null;
      };
      const ctl = new AbortController();
      g.__voicePlaybackCtl = ctl;
      g.__voiceLastChunk = toRead;
      g.__voiceLastFullResponse = accumulatedAssistantText;
      speakAssistantResponse(toRead, ctx.config, ctl.signal).catch(() => { /* noop */ });
    }
  }

  if (turns >= maxTurns) {
    console.log(theme.warning(`\n  ${sym.warn} reached max turns limit`));
  }

  // Chain-elapsed summary. One line per response chain (user msg → assistant
  // ending without a tool call), printed regardless of how many tool-call
  // iterations the chain took. Lets the user see how long that whole
  // exchange took, separate from per-turn cost timings.
  const chainMs = Date.now() - chainStart;
  // Only show if there was meaningful work — multi-second chains. Sub-second
  // chains (slash command rejects, instant returns) don't need a chain line.
  if (chainMs > 1500) {
    console.log(theme.dim(`  chain ${formatDuration(chainMs)} · ${turns} ${turns === 1 ? 'turn' : 'turns'}`));
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

    // ── Accessibility: TTS-announce destructive actions ───
    // Plays before the permission prompt so a blind user hears WHAT they're
    // approving in addition to the visual prompt. Only fires for tools
    // flagged destructive AND when voice + askBeforeDestructive are on.
    if (isVoiceEnabled(ctx.config) && getAccessibilityConfig(ctx.config).askBeforeDestructive) {
      if (isLikelyDestructive(toolName, input)) {
        const tts = getTtsConfig(ctx.config);
        if (tts.apiKey) {
          const blurb = describeDestructive(toolName, input);
          await speak(blurb, ctx.config, { voiceId: tts.assistantVoiceId }).catch(() => false);
        }
      }
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
    // Update status for F1 status hotkey — include a short arg snippet so
    // the speaker can hear "executing bash, list directory, 4 seconds
    // elapsed" instead of just "tool".
    setStatus({ state: 'tool-call', detail: `${toolName}: ${formatArgs(tool, input).slice(0, 60)}` });

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
