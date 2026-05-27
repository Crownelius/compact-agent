import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamChat, resetClient } from '../src/api.js';
import { runQuery } from '../src/query.js';
import type { VentipusConfig, Message } from '../src/types.js';

vi.mock('../src/api.js', () => ({
  streamChat: vi.fn(),
  resetClient: vi.fn(),
}));

function config(): VentipusConfig {
  return {
    apiKey: 'sk-test',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openrouter/owl-alpha',
    fallbackModel: 'openrouter/free',
    provider: 'OpenRouter (Any Model)',
    permissionMode: 'yolo',
    maxTokens: 128,
    temperature: 0.3,
    showThinking: false,
  };
}

describe('runQuery provider liveness recovery', () => {
  const originalTimeout = process.env.VENTIPUS_FIRST_TOKEN_TIMEOUT_MS;
  const originalNonInteractive = process.env.VENTIPUS_NON_INTERACTIVE;

  beforeEach(() => {
    vi.mocked(streamChat).mockReset();
    vi.mocked(resetClient).mockReset();
    process.env.VENTIPUS_FIRST_TOKEN_TIMEOUT_MS = '1';
    process.env.VENTIPUS_NON_INTERACTIVE = '0';
  });

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.VENTIPUS_FIRST_TOKEN_TIMEOUT_MS;
    } else {
      process.env.VENTIPUS_FIRST_TOKEN_TIMEOUT_MS = originalTimeout;
    }
    if (originalNonInteractive === undefined) {
      delete process.env.VENTIPUS_NON_INTERACTIVE;
    } else {
      process.env.VENTIPUS_NON_INTERACTIVE = originalNonInteractive;
    }
  });

  it('retries with the fallback model when the primary model never sends a first stream event', async () => {
    vi.mocked(streamChat).mockImplementation(async function* (
      cfg: VentipusConfig,
      _messages: Message[],
      _tools: unknown[],
      signal?: AbortSignal,
    ) {
      if (cfg.model === 'openrouter/owl-alpha') {
        while (!signal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        throw new Error('aborted');
      }
      yield { type: 'text', content: 'fallback response' };
      yield { type: 'done' };
    });

    const cfg = config();
    const messages: Message[] = [{ role: 'user', content: 'Say hi' }];
    const cwd = mkdtempSync(join(tmpdir(), 'ventipus-query-liveness-'));
    const ctx = {
      config: cfg,
      messages,
      cwd,
      rl: {} as never,
      sessionId: 'test-session',
      mode: 'dev' as const,
    };
    try {
      await runQuery(ctx);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }

    expect(cfg.model).toBe('openrouter/free');
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(streamChat).toHaveBeenCalledTimes(2);
    expect(ctx.messages.at(-1)).toEqual({ role: 'assistant', content: 'fallback response' });
  });
});
