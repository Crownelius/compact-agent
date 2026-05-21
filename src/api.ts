import OpenAI from 'openai';
import type { CrowcoderConfig, Message } from './types.js';
import type { Tool } from './tools/types.js';
import { withRetry } from './retry.js';
import { setPool, pickKey, reportFailure, reportSuccess, poolSize } from './key-rotation.js';

let client: OpenAI | null = null;
let lastConfigHash = '';
let lastClientKey = '';   // which key the current client was built with

function configHash(config: CrowcoderConfig): string {
  // The client cache key depends on the CURRENT pool key, not the config
  // apiKey, so a rotation picks a fresh client without re-checking config.
  const poolKeys = (config.apiKeys || []).join(',');
  return `${config.baseURL}:${config.apiKey}:${poolKeys}`;
}

/**
 * Sync the rotation pool with the latest config. Called from getClient
 * on every request so /config or env-var changes flow through.
 */
function syncPool(config: CrowcoderConfig): void {
  setPool(config.apiKey, config.apiKeys || []);
}

export function getClient(config: CrowcoderConfig): OpenAI {
  syncPool(config);
  // Pick the current key from the pool (round-robin, skipping cool keys).
  // Falls back to config.apiKey when the pool is empty or all keys are
  // cool — the original request will fail with a clear error in that
  // case, which is the right behavior.
  const activeKey = pickKey() || config.apiKey;
  const hash = configHash(config);
  if (!client || hash !== lastConfigHash || activeKey !== lastClientKey) {
    const isAnthropic = config.baseURL.includes('anthropic.com');

    client = new OpenAI({
      apiKey: activeKey || 'not-needed',
      baseURL: config.baseURL,
      ...(isAnthropic ? {
        defaultHeaders: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
        },
      } : {}),
    });
    lastConfigHash = hash;
    lastClientKey = activeKey;
  }
  return client;
}

/**
 * Same as getClient but explicitly reports the active key in use, so
 * callers (streamChat) can attribute success/failure back to the
 * specific key for rotation health-tracking.
 */
export function getClientWithKey(config: CrowcoderConfig): { client: OpenAI; activeKey: string } {
  const c = getClient(config);
  return { client: c, activeKey: lastClientKey };
}

export function resetClient(): void {
  client = null;
  lastConfigHash = '';
  lastClientKey = '';
}

/** Re-export so callers (index.ts /keys) can introspect pool status. */
export { reportFailure, reportSuccess, poolSize } from './key-rotation.js';

export function toolsToFunctions(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }));
}

export async function* streamChat(
  config: CrowcoderConfig,
  messages: Message[],
  tools: Tool[],
  signal?: AbortSignal,
): AsyncGenerator<{
  type: 'text' | 'thinking' | 'tool_call' | 'done';
  content?: string;
  toolCalls?: OpenAI.Chat.ChatCompletionMessageFunctionToolCall[];
  usage?: { prompt: number; completion: number; total: number };
}> {
  // Capture the active key so we can attribute success/failure to it
  // for the rotation health tracker. Multi-key users (multiple OpenRouter
  // accounts) get automatic round-robin when a key 429s or exhausts quota.
  const { client: api, activeKey } = getClientWithKey(config);
  const toolDefs = toolsToFunctions(tools);

  // Bail early if the caller already cancelled before we even started
  if (signal?.aborted) throw new Error('Aborted before stream start');

  let stream;
  try {
    stream = await withRetry(
      () =>
        api.chat.completions.create({
          model: config.model,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          stream: true,
          // OpenAI SDK supports cancellation via signal; pass it through
          // so the underlying fetch can be aborted on Steer.
        }, signal ? { signal } : undefined),
      { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 },
    );
  } catch (err) {
    // Hand the failure to the rotation pool so subsequent calls skip
    // this key for the cool-down window. Re-throw so the outer error
    // handling (auto-fallback model, error UI) still fires.
    if (activeKey && poolSize() > 1) reportFailure(activeKey, err);
    throw err;
  }
  // If we get this far, the request was at least accepted — record success.
  // (We don't wait for completion; mid-stream errors are vanishingly rare
  // for OpenAI-compatible APIs vs upfront 4xx/5xx).
  if (activeKey && poolSize() > 1) reportSuccess(activeKey);

  let currentText = '';
  const toolCallAccumulator: Map<number, {
    id: string;
    function: { name: string; arguments: string };
  }> = new Map();

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    // Reasoning/thinking content (DeepSeek, OpenRouter reasoning models, etc.)
    // The field is `reasoning_content` on some providers, or nested in delta
    const deltaAny = delta as Record<string, unknown>;
    const reasoning = deltaAny.reasoning_content || deltaAny.thinking || deltaAny.reasoning;
    if (reasoning && typeof reasoning === 'string') {
      yield { type: 'thinking', content: reasoning };
    }

    // Text content
    if (delta.content) {
      currentText += delta.content;
      yield { type: 'text', content: delta.content };
    }

    // Tool calls (streamed incrementally)
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!toolCallAccumulator.has(idx)) {
          toolCallAccumulator.set(idx, {
            id: tc.id || '',
            function: { name: '', arguments: '' },
          });
        }
        const acc = toolCallAccumulator.get(idx)!;
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.function.name += tc.function.name;
        if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
      }
    }

    // Check for finish
    const finishReason = chunk.choices?.[0]?.finish_reason;
    if (finishReason) {
      if (toolCallAccumulator.size > 0) {
        const toolCalls: OpenAI.Chat.ChatCompletionMessageFunctionToolCall[] = [];
        for (const [, tc] of toolCallAccumulator) {
          toolCalls.push({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments },
          });
        }
        yield { type: 'tool_call', toolCalls };
      }

      yield {
        type: 'done',
        usage: chunk.usage
          ? {
              prompt: chunk.usage.prompt_tokens,
              completion: chunk.usage.completion_tokens,
              total: chunk.usage.total_tokens,
            }
          : undefined,
      };
    }
  }
}
