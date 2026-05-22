import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import type { Message, CrowcoderConfig } from './types.js';
import type { Tool } from './tools/types.js';
import { ALL_TOOLS, getToolByName } from './tools/index.js';
import { streamChat, resetClient } from './api.js';
import { checkPermission } from './permissions.js';
import { buildSystemPrompt } from './system-prompt.js';
import { runHooks } from './hooks.js';
import { scanToolCall, printSecurityWarning } from './security.js';
import { trackUsage } from './cost-tracker.js';
import { shouldCompact, compactMessages, quickCompact, DEFAULT_COMPACTION } from './compaction.js';
import type { Mode } from './modes.js';
import { theme, sym, printToolRun, printToolResult, printThinkingOpen, printThinkingText, printThinkingClose, printCost, printApiError, formatDuration, categorizeApiError } from './theme.js';
import {
  isVoiceEnabled, getTtsConfig, getAccessibilityConfig,
  speakAssistantResponse, speak, speakUserEcho,
} from './voice.js';
import { isLikelyDestructive, describeDestructive, countWords, summarize } from './accessibility.js';
import { audioCue } from './audio.js';
import { setStatus } from './status.js';
import { collapseCompletedTurns } from './turn-context.js';
import * as liveQueue from './live-queue.js';

// Per-session set: once we've told the user "this model didn't emit
// reasoning tokens" we don't repeat it on every turn. Cleared per process,
// not persisted — restart, see hint again. Keyed by sessionId so different
// sessions get fresh hints.
const _thinkingHintShownForSession = new Set<string>();

export interface QueryContext {
  config: CrowcoderConfig;
  messages: Message[];
  cwd: string;
  rl: readline.Interface;
  sessionId: string;
  mode: Mode;
}

/**
 * Suppress input during agent work — model streaming AND tool execution.
 *
 * Earlier versions only suppressed during the `for await streamChat()`
 * phase, leaving a gap during tool execution where the user's typing
 * leaked through inline with tool output (e.g. "sdsds" appearing between
 * web_fetch calls). Now the guard spans the entire runQuery, and
 * executeToolCalls calls `pause()` / `resume()` around the permission
 * prompt so rl.question() can read Y/n input cleanly.
 *
 * Mechanism: detach every 'keypress' listener on stdin that isn't tagged
 * with __crowcoderHotkey__ (the F-key listener from index.ts). That stops
 * readline from echoing typed chars or buffering them into its next-line
 * state, while keeping F1–F10 status hotkeys live.
 *
 * Returned shape:
 *   pause()   — re-attach readline listeners so permission prompts work
 *   resume()  — detach again to re-suppress
 *   restore() — final cleanup: re-attach, drop data listener, restore raw mode
 */
type TaggedListener = ((...args: unknown[]) => void) & { __crowcoderHotkey__?: boolean };

export interface InputGuard {
  pause(): void;
  resume(): void;
  /** Return whatever the user typed during streaming, then clear the buffer. */
  drainQueuedInput(): string;
  /**
   * Register a callback invoked when the user presses Ctrl+G (Steer).
   * The handler is responsible for aborting the active stream / chain
   * and treating the queued buffer as the next user message.
   */
  onSteer(handler: () => void): void;
  restore(): void;
}

function startInputSuppression(screenReader: boolean = false): InputGuard {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return {
      pause: () => { /* noop */ },
      resume: () => { /* noop */ },
      drainQueuedInput: () => '',
      onSteer: () => { /* noop */ },
      restore: () => { /* noop */ },
    };
  }
  const wasRaw = stdin.isRaw;

  // Live queue display — bottom-anchored input box that shows what the
  // user has typed into the queue. Activate immediately so the box is
  // present from the start of streaming, even when empty. Skip entirely
  // in screen-reader mode: NVDA / JAWS read every cursor move as fresh
  // content, which makes a live-updating widget far worse than silent.
  const liveBoxActive = !screenReader && liveQueue.activate();

  // Steer (Ctrl+G mid-stream cancel). Caller registers a handler via
  // onSteer(); we invoke it when 0x07 (BEL / Ctrl+G) arrives during
  // suppression. The handler is responsible for aborting the active
  // stream — we just route the signal.
  let steerHandler: (() => void) | null = null;

  // Snapshot non-tagged keypress listeners. These are the ones we toggle
  // on suppress/unsuppress; the tagged hotkey listener (F1–F10) stays
  // attached unconditionally so status keys work during streaming and
  // tool execution alike.
  const allKeypressListeners = stdin.listeners('keypress').slice() as TaggedListener[];
  const togglableListeners = allKeypressListeners.filter((l) => !l.__crowcoderHotkey__);

  let detached = false;

  function suppress(): void {
    if (detached) return;
    for (const l of togglableListeners) stdin.removeListener('keypress', l);
    detached = true;
  }
  function unsuppress(): void {
    if (!detached) return;
    for (const l of togglableListeners) stdin.on('keypress', l);
    detached = false;
  }

  // Queued-input buffer (Codex audit "queued_user_messages"). Instead of
  // dropping typed chars during streaming, collect printable ones so we
  // can pre-fill them into the NEXT prompt when the chain ends. The user
  // can keep typing their next request while the current one's still
  // working — it appears at the prompt ready to send or edit.
  //
  // Heuristic to avoid garbage from terminal escapes: only collect
  // printable ASCII (0x20-0x7E) and Enter (0x0D). Drop everything else
  // — including arrow keys, backspace, Ctrl combos — because we can't
  // tell where a multi-byte escape starts vs ends without a full state
  // machine. Backspace within the queued buffer is the main loss; users
  // can clean up at the prompt anyway.
  const queued: number[] = [];

  const dataHandler = (chunk: Buffer): void => {
    if (chunk[0] === 0x03) {
      try { stdin.setRawMode(false); } catch { /* noop */ }
      liveQueue.deactivate();
      process.exit(0);
    }
    // Ctrl+G (BEL, 0x07) → Steer trigger. Fires the registered handler
    // which aborts the active stream + uses the queued buffer as the
    // next user turn. Doesn't append the 0x07 itself to the queue.
    if (chunk[0] === 0x07 && detached) {
      if (steerHandler) {
        try { steerHandler(); } catch { /* never break input on a steer error */ }
      }
      return;
    }
    // Esc (0x1B) → Steer trigger, but only for a BARE Esc (chunk of
    // exactly one byte). Multi-byte chunks starting with 0x1B are ANSI
    // escape sequences for arrow keys / function keys / Alt+letter, and
    // arrive in raw mode as one contiguous chunk on every supported
    // terminal (xterm, iTerm, Windows Terminal, Alacritty, Kitty). The
    // length heuristic distinguishes them without a 50ms debounce.
    //
    // Esc and Ctrl+G are now aliases — Esc matches Claude Code + Codex
    // muscle memory, Ctrl+G is kept for existing users.
    if (chunk[0] === 0x1B && chunk.length === 1 && detached) {
      if (steerHandler) {
        try { steerHandler(); } catch { /* never break input on a steer error */ }
      }
      return;
    }
    if (!detached) return;          // only collect while we're suppressing
    // Drop chunks that look like escape sequences (start with 0x1B)
    // — those are arrow keys, function keys, etc. Already handled by
    // the keypress emitter for tagged hotkeys; for us they're garbage.
    if (chunk[0] === 0x1B) return;
    let mutated = false;
    for (const byte of chunk) {
      // Backspace (0x08) or DEL (0x7F) → erase last char from queue
      if (byte === 0x08 || byte === 0x7F) {
        if (queued.length > 0) {
          queued.pop();
          mutated = true;
        }
        continue;
      }
      // Printable ASCII or CR/LF → append
      if ((byte >= 0x20 && byte < 0x7F) || byte === 0x0A || byte === 0x0D) {
        queued.push(byte);
        mutated = true;
      }
    }
    // Cap to avoid runaway accumulation if the user holds down a key
    if (queued.length > 4096) queued.splice(0, queued.length - 4096);
    // Refresh the live box with current buffer contents so the user
    // sees their typing in real time. Done lazily — only when mutated
    // — to avoid drawing on every random byte.
    if (mutated && liveBoxActive) {
      liveQueue.update(Buffer.from(queued).toString('utf-8').replace(/\r\n?/g, '\n'));
    }
  };
  try { stdin.setRawMode(true); } catch { /* noop */ }
  stdin.on('data', dataHandler);
  stdin.resume();

  // Start suppressed — typing during model streaming is the default-block case
  suppress();

  return {
    pause: unsuppress,    // pause suppression = allow typing (for permission prompts)
    resume: suppress,     // resume suppression = block typing again
    drainQueuedInput: (): string => {
      const text = Buffer.from(queued).toString('utf-8');
      queued.length = 0;
      // Normalize CR-only or CR-LF to LF, strip trailing whitespace
      return text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    },
    onSteer: (handler: () => void): void => {
      steerHandler = handler;
    },
    restore: () => {
      unsuppress();       // ensure listeners are back before we leave
      stdin.removeListener('data', dataHandler);
      try { stdin.setRawMode(wasRaw); } catch { /* noop */ }
      // Tear down the live queue box + restore default scroll region.
      // Idempotent; safe to call even if activation was skipped.
      liveQueue.deactivate();
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

  // Auto-fallback: when the primary model returns a cryptic / unknown
  // provider error (common for free experimental models like
  // openrouter/owl-alpha which returns literally "ERROR" or "Provider
  // returned error"), we transparently retry the SAME turn once with the
  // user's configured fallbackModel. After we use it, this latches so we
  // don't bounce back and forth between failing models in a single chain.
  let usedFallbackModel = false;

  // Tracks whether ANY reasoning tokens arrived across the entire chain.
  // Used at chain-end to print a one-time "/thinking is ON but this model
  // doesn't emit reasoning" hint. Hoisted to chain scope (not per-turn)
  // because we only care about "in this whole exchange did we see any
  // reasoning at all".
  let sawAnyThinking = false;

  // Skill-graduation telemetry. The Hermes audit's deterministic rule
  // for "this work was worth remembering" — the model is a bad judge of
  // its own complexity, so the dispatcher counts and decides. Thresholds:
  //   - 5+ tool calls in this chain   → complex task
  //   - any tool errored then recovered → learned-from-failure
  // Only used to inform a chain-end suggestion in hermes mode; we don't
  // auto-create skills (which would burn an extra LLM call). We surface
  // the opportunity with a one-line nudge so the user can /skill-create
  // or /learn if they want.
  const chainStats: ChainStats = {
    toolCallCount: 0,
    sawToolError: false,
    sawToolRecovery: false,
  };

  // Input suppression spans the entire chain: model streaming AND tool
  // execution. executeToolCalls calls inputGuard.pause()/resume() around
  // permission prompts so rl.question() can still read user input. Final
  // teardown happens in the finally block at the bottom of runQuery so
  // the guard is always cleaned up even if something throws unexpectedly.
  //
  // Pass the screen-reader flag through — when on, suppressInputDuringStream
  // skips the live queue box (NVDA/JAWS would re-read every cursor move
  // as new text, drowning the actual response).
  const isScreenReader = ctx.config.voice?.accessibility?.screenReader === true;
  const inputGuard = startInputSuppression(isScreenReader);
  try {

  // Turn-boundary collapse runs BEFORE compaction. Every completed prior
  // turn becomes [user, "<final text>\n[Completed: used X, Y]"] — the
  // model no longer sees stale tool_calls that it might mistake for
  // pending work (the "I'll handle BOTH requests" / "all THREE requests"
  // bug). The current turn (latest user message forward) is left intact
  // because its tool_calls and tool messages are still in flight.
  ctx.messages = collapseCompletedTurns(ctx.messages);

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

    // (inputGuard is now lifted to runQuery scope — see above. It spans
    // both streaming and tool execution, with pause/resume around the
    // permission prompts inside executeToolCalls.)

    // We're about to wait on the API; tell the status singleton so a blind
    // user pressing F1 hears "calling claude-sonnet-4, 6 seconds elapsed"
    // instead of a stale "idle".
    setStatus({ state: 'streaming' });

    // Steer support — Ctrl+G during streaming aborts the API call and
    // treats the queued buffer as the next user message (with a marker
    // so the model knows the prior turn was interrupted). The handler
    // is wired through InputGuard.onSteer; we create a fresh
    // AbortController per turn and pass it to streamChat.
    const streamAbort = new AbortController();
    let wasSteered = false;
    inputGuard.onSteer(() => {
      wasSteered = true;
      try { streamAbort.abort(); } catch { /* noop */ }
    });
    // Expose the per-turn abort controller on globalThis so the F-row
    // hotkey listener (src/index.ts) can soft-cancel the current turn
    // without going through Ctrl+C / SIGINT. Cleared in the finally
    // block so a stale controller can't be aborted between turns.
    (globalThis as { __turnAbortCtl?: AbortController | null }).__turnAbortCtl = streamAbort;

    // Pre-token indicator — print a dim "waiting" line inside the live-
    // queue scroll region so the user sees that something IS happening
    // before the first model token arrives. Without this, a slow or
    // hung model (like openrouter/owl-alpha returning ERROR after a
    // long timeout) leaves nothing visible between the prompt and the
    // queue box, making the whole REPL look frozen.
    //
    // Skipped in screen-reader mode (NVDA / JAWS would announce the
    // line and then announce every subsequent token as "after the
    // waiting line", which is noisier than helpful).
    let firstTokenSeen = false;
    const isScreenReader = ctx.config.voice?.accessibility?.screenReader === true;
    if (!isScreenReader) {
      console.log(chalk.dim('  ⏳ waiting for model response…'));
    }
    // 30-second slow-model warning. If no token has arrived by 30s,
    // tell the user explicitly that the model is taking longer than
    // usual and how to bail out. Cleared as soon as ANY event arrives.
    const slowTimer = setTimeout(() => {
      if (!firstTokenSeen) {
        console.log(chalk.yellow(
          `  ⏳ model is taking longer than 30s. Shift+F5 cancels, Ctrl+C exits. Often means the model returned no tokens (try /model <other> if this hangs).`,
        ));
      }
    }, 30_000);

    try {
      for await (const event of streamChat(ctx.config, apiMessages, ALL_TOOLS, streamAbort.signal)) {
        // First event of any kind — model is alive. Cancel the slow-
        // model warning timer; subsequent events are normal streaming.
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          clearTimeout(slowTimer);
        }
        if (event.type === 'thinking' && event.content) {
          sawAnyThinking = true;
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
      // Stream threw before any token arrived — clear the slow-model
      // timer so its 30s callback doesn't fire after the error is
      // already on stdout (would look like a false positive).
      clearTimeout(slowTimer);
      const msg = err instanceof Error ? err.message : String(err);
      // Always close the streaming line first so the error doesn't glue to text.
      if (hasOutput && !lastCharWasNewline) process.stdout.write('\n');

      // ── Steer path (graceful — not an error) ──────────────
      // If the user pressed Ctrl+G during streaming, the AbortController
      // fired and the OpenAI SDK threw something like "Request was
      // aborted" or our own "Aborted before stream start". Treat as a
      // controlled end-of-turn: save partial assistant text, push the
      // queued buffer as the next user message, continue the chain.
      const aborted = wasSteered || /abort|cancel/i.test(msg);
      if (wasSteered || (aborted && streamAbort.signal.aborted)) {
        console.log(theme.warning('  ⮌ steered — taking your queued input as the next turn'));
        // Save whatever the model managed to emit before the abort
        if (fullText.trim()) {
          accumulatedAssistantText += (accumulatedAssistantText ? '\n\n' : '') + fullText + '\n[interrupted by user steer]';
          ctx.messages.push({ role: 'assistant', content: fullText + '\n[interrupted by user steer]' });
        }
        // Drain the queue and push as the next user turn with a marker.
        const steerText = inputGuard.drainQueuedInput().trim();
        if (steerText) {
          ctx.messages.push({
            role: 'user',
            content: `[steer mid-turn] ${steerText}`,
          });
          // Don't break — continue the while loop so the new user turn
          // gets processed in the next iteration. turns-- because the
          // steer doesn't count against the max-turn budget.
          turns--;
          continue;
        }
        // No steer text (user hit Ctrl+G but typed nothing) — just end the chain.
        break;
      }

      // ── Auto-fallback path ─────────────────────────────────
      // Categorize the error. If it's "unknown" (the provider returned a
      // cryptic empty error like "ERROR" or "Provider returned error" that
      // matches no specific pattern) AND we have a fallbackModel configured
      // AND we haven't already used it, swap models and silently retry the
      // same turn. This rescues users from broken free models without them
      // having to manually /clear and /model switch.
      const cat = categorizeApiError(msg, {
        baseURL: ctx.config.baseURL,
        provider: ctx.config.provider,
        model: ctx.config.model,
      });
      const canFallback =
        cat.category === 'unknown'
        && ctx.config.fallbackModel
        && ctx.config.fallbackModel !== ctx.config.model
        && !usedFallbackModel;
      if (canFallback) {
        usedFallbackModel = true;
        const failedModel = ctx.config.model;
        const fallback = ctx.config.fallbackModel as string;
        ctx.config.model = fallback;
        resetClient();
        console.log(theme.warning(
          `  ${sym.warn} ${failedModel} returned a cryptic provider error — retrying once with fallback model ${fallback}.`,
        ));
        console.log(theme.dim('    (configure a different fallback with: /fallback <model-id>)'));
        turns--;  // this retry doesn't burn a turn slot from the max-turns budget
        continue;
      }

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
      break;
    }

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
    // and uses inputGuard.pause()/resume() around each permission prompt
    // so rl.question() can read user input even though suppression is on
    // for the rest of the chain. chainStats is mutated by side effect so
    // we can surface a skill-graduation hint at chain end.
    const toolResults = await executeToolCalls(toolCalls, ctx, inputGuard, chainStats);
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

  // /thinking visibility hint. If the user has thinking enabled but the
  // model didn't emit any reasoning tokens this turn AND we haven't
  // already shown the hint for this session, explain why nothing showed.
  // Most users hit this with general-purpose models (gpt-4o, claude-sonnet
  // without `thinking: enabled`, owl-alpha, etc.) — only reasoning models
  // (DeepSeek-R1, Claude with extended thinking, o1, etc.) actually emit
  // reasoning over the API.
  const showThinking = ctx.config.showThinking !== false;
  if (showThinking && !sawAnyThinking && !_thinkingHintShownForSession.has(ctx.sessionId)) {
    _thinkingHintShownForSession.add(ctx.sessionId);
    console.log(theme.dim(`  [hint] /thinking is ON, but ${ctx.config.model} didn't emit reasoning tokens.`));
    console.log(theme.dim(`         Reasoning models (DeepSeek-R1, o1, Claude with extended thinking) emit them; most general-purpose models don't.`));
    console.log(theme.dim(`         Hide this hint with /thinking (toggles off).`));
  }

  // ── Skill graduation hint (Hermes audit, M2 item 2) ─────────
  // Deterministic "this work was worth remembering" trigger. The model
  // is a bad judge of its own complexity (Hermes audit's exact wording);
  // we count instead. Fires at most once per chain in hermes mode, and
  // only when a clear threshold was crossed:
  //
  //   - 5+ tool calls   → complex multi-step task
  //   - error+recovery  → the agent learned a workaround
  //
  // We don't auto-execute /skill-create (it would burn another LLM call
  // and might extract noise); we surface the opportunity so the user can
  // decide. Outside hermes mode, this is silent — keeps the noise floor
  // low for regular dev/review/debug sessions.
  if (ctx.mode === 'hermes') {
    const complex = chainStats.toolCallCount >= 5;
    const learnedFromFailure = chainStats.sawToolError && chainStats.sawToolRecovery;
    if (complex || learnedFromFailure) {
      const reason = complex && learnedFromFailure
        ? `${chainStats.toolCallCount} tools, recovered from at least one error`
        : complex
          ? `${chainStats.toolCallCount} tools — complex enough that a learned pattern might save time next time`
          : `recovered from a tool error — the working path is worth banking`;
      console.log(theme.dim(`  [hermes] graduation candidate: ${reason}.`));
      console.log(theme.dim(`           Run /skill-create or /learn to bank it. Skip if it was one-off.`));
    }
  }
  } finally {
    // Drain any queued user input typed during streaming. Stash on
    // globalThis for the REPL loop in index.ts to pick up — it'll
    // pre-fill the next prompt or auto-submit if the user pressed
    // Enter mid-stream.
    const queued = inputGuard.drainQueuedInput();
    if (queued.trim()) {
      (globalThis as { __crowcoderQueuedInput?: string }).__crowcoderQueuedInput = queued;
    }
    inputGuard.restore();
    // Clear the per-turn abort controller pointer so a stale handle
    // can't be aborted between turns by Shift+F5 (soft-cancel).
    (globalThis as { __turnAbortCtl?: AbortController | null }).__turnAbortCtl = null;
  }
}

/**
 * Chain-scope counters threaded through executeToolCalls so runQuery can
 * surface "this looked complex enough to extract a skill" hints at chain
 * end. The Hermes audit's deterministic skill-graduation triggers:
 *   - 5+ tool calls in the chain         → complex task
 *   - a tool error followed by a success → learned-from-failure
 * Counted as side-effects, not returned, so the existing call sites
 * don't have to thread tuples back up.
 */
interface ChainStats {
  toolCallCount: number;
  sawToolError: boolean;
  sawToolRecovery: boolean;
}

async function executeToolCalls(
  toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[],
  ctx: QueryContext,
  inputGuard: InputGuard,
  chainStats?: ChainStats,
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
    // Pause input suppression so rl.question() can read the user's
    // Y/n/always response — without this, readline's keypress listener is
    // detached and the prompt would hang forever. Re-suppress immediately
    // after so any typing during the next tool's execution is blocked.
    inputGuard.pause();
    let allowed: boolean;
    try {
      allowed = await checkPermission(tool, input, ctx.config, ctx.rl);
    } finally {
      inputGuard.resume();
    }
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

    // Stash last-tool-call info so the Shift+F3 hotkey (src/index.ts) can
    // re-announce "what did the model just do." Truncate the preview to
    // keep TTS readouts short and avoid pinning huge buffers in memory.
    (globalThis as { __lastToolCall?: {
      name: string; argsPreview: string; outputPreview: string; isError: boolean;
    } | null }).__lastToolCall = {
      name: toolName,
      argsPreview: formatArgs(tool, input).slice(0, 80),
      outputPreview: String(result.output ?? '').slice(0, 160),
      isError: !!result.isError,
    };

    // Chain stats — bump the counter on every successful execution path
    // we got here through (denied / blocked tool calls hit `continue`
    // above and don't reach this point). Recovery = success-after-error
    // within the same chain.
    if (chainStats) {
      chainStats.toolCallCount++;
      if (result.isError) {
        chainStats.sawToolError = true;
      } else if (chainStats.sawToolError) {
        chainStats.sawToolRecovery = true;
      }
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
