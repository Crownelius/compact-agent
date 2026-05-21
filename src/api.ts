import OpenAI from 'openai';
import type { CrowcoderConfig, Message } from './types.js';
import type { Tool } from './tools/types.js';
import { withRetry } from './retry.js';

let client: OpenAI | null = null;
let lastConfigHash = '';

function configHash(config: CrowcoderConfig): string {
  return `${config.baseURL}:${config.apiKey}`;
}

export function getClient(config: CrowcoderConfig): OpenAI {
  const hash = configHash(config);
  if (!client || hash !== lastConfigHash) {
    const isAnthropic = config.baseURL.includes('anthropic.com');

    client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseURL,
      ...(isAnthropic ? {
        defaultHeaders: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
      } : {}),
    });
    lastConfigHash = hash;
  }
  return client;
}

export function resetClient(): void {
  client = null;
  lastConfigHash = '';
}

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
  const api = getClient(config);
  const toolDefs = toolsToFunctions(tools);

  // Bail early if the caller already cancelled before we even started
  if (signal?.aborted) throw new Error('Aborted before stream start');

  const stream = await withRetry(
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
