import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamChat, resetClient } from '../src/api.js';
import { runQuery } from '../src/query.js';
import type { CawdexConfig, Message } from '../src/types.js';

vi.mock('../src/api.js', () => ({
  streamChat: vi.fn(),
  resetClient: vi.fn(),
}));

function config(): CawdexConfig {
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
  const originalTimeout = process.env.CAWDEX_FIRST_TOKEN_TIMEOUT_MS;
  const originalNonInteractive = process.env.CAWDEX_NON_INTERACTIVE;
  const originalAllowFlaky = process.env.CAWDEX_ALLOW_FLAKY_MODELS;

  beforeEach(() => {
    vi.mocked(streamChat).mockReset();
    vi.mocked(resetClient).mockReset();
    process.env.CAWDEX_FIRST_TOKEN_TIMEOUT_MS = '1';
    process.env.CAWDEX_NON_INTERACTIVE = '0';
    delete process.env.CAWDEX_ALLOW_FLAKY_MODELS;
  });

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.CAWDEX_FIRST_TOKEN_TIMEOUT_MS;
    } else {
      process.env.CAWDEX_FIRST_TOKEN_TIMEOUT_MS = originalTimeout;
    }
    if (originalNonInteractive === undefined) {
      delete process.env.CAWDEX_NON_INTERACTIVE;
    } else {
      process.env.CAWDEX_NON_INTERACTIVE = originalNonInteractive;
    }
    if (originalAllowFlaky === undefined) {
      delete process.env.CAWDEX_ALLOW_FLAKY_MODELS;
    } else {
      process.env.CAWDEX_ALLOW_FLAKY_MODELS = originalAllowFlaky;
    }
  });

  it('preemptively switches known-stuck OpenRouter preview models to the fallback before the API call', async () => {
    vi.mocked(streamChat).mockImplementation(async function* (
      cfg: CawdexConfig,
    ) {
      yield { type: 'text', content: `model=${cfg.model}` };
      yield { type: 'done' };
    });

    const cfg = config();
    const messages: Message[] = [{ role: 'user', content: 'Say hi' }];
    const cwd = mkdtempSync(join(tmpdir(), 'cawdex-query-flaky-preflight-'));
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
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamChat).mock.calls[0][0].model).toBe('openrouter/free');
    expect(ctx.messages.at(-1)).toEqual({ role: 'assistant', content: 'model=openrouter/free' });
  });

  it('retries with the fallback model when the primary model never sends a first stream event', async () => {
    process.env.CAWDEX_ALLOW_FLAKY_MODELS = '1';

    vi.mocked(streamChat).mockImplementation(async function* (
      cfg: CawdexConfig,
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
    const cwd = mkdtempSync(join(tmpdir(), 'cawdex-query-liveness-'));
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

  it('treats global F5 cancellation as a user cancellation instead of a provider failure', async () => {
    process.env.CAWDEX_FIRST_TOKEN_TIMEOUT_MS = '0';

    vi.mocked(streamChat).mockImplementation(async function* (
      _cfg: CawdexConfig,
      _messages: Message[],
      _tools: unknown[],
      signal?: AbortSignal,
    ) {
      const cancel = (globalThis as { __turnCancelCurrent?: () => void }).__turnCancelCurrent;
      expect(typeof cancel).toBe('function');
      cancel?.();
      expect(signal?.aborted).toBe(true);
      throw new Error('aborted');
    });

    const cfg = config();
    cfg.model = 'openrouter/free';
    cfg.fallbackModel = undefined;
    const messages: Message[] = [{ role: 'user', content: 'Say hi' }];
    const cwd = mkdtempSync(join(tmpdir(), 'cawdex-query-global-cancel-'));
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

    expect(resetClient).not.toHaveBeenCalled();
    expect(ctx.messages.at(-1)?.role).toBe('assistant');
    expect(String(ctx.messages.at(-1)?.content)).toContain('[interrupted by user steer');
    expect((globalThis as { __turnCancelCurrent?: unknown }).__turnCancelCurrent).toBeNull();
  });
});
