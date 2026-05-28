import { afterEach, describe, expect, it } from 'vitest';
import { applyRuntimeConfigOverrides, loadConfigFromEnv } from '../src/config.js';
import type { CawdexConfig } from '../src/types.js';
import { PROVIDERS } from '../src/types.js';

const ENV_KEYS = [
  'CAWDEX_PROVIDER',
  'CAWDEX_API_KEY',
  'CAWDEX_BASE_URL',
  'CAWDEX_MODEL',
  'CAWDEX_MODEL_OVERRIDE',
  'CAWDEX_FALLBACK_MODEL',
  'CAWDEX_FALLBACK_MODEL_OVERRIDE',
  'CAWDEX_MAX_TOKENS',
  'CAWDEX_MAX_TOKENS_OVERRIDE',
  'CAWDEX_CONTEXT_WINDOW_TOKENS',
  'CAWDEX_CONTEXT_WINDOW_TOKENS_OVERRIDE',
  'CAWDEX_MAX_TURNS',
  'CAWDEX_MAX_TURNS_OVERRIDE',
  'CAWDEX_TEMPERATURE',
  'CAWDEX_TEMPERATURE_OVERRIDE',
  'CAWDEX_PERMISSION',
  'CAWDEX_MEMORY',
  'CAWDEX_THEME',
  'CAWDEX_SHOW_THINKING',
  'CAWDEX_BASE_URL_OVERRIDE',
  'CAWDEX_API_KEY_OVERRIDE',
  'CAWDEX_API_KEY_ENV',
  'CAWDEX_PROVIDER',
  'CAWDEX_PROVIDER',
  'CAWDEX_API_KEY',
  'CAWDEX_API_KEY',
  'CAWDEX_BASE_URL',
  'CAWDEX_BASE_URL',
  'CAWDEX_MODEL',
  'CAWDEX_MODEL_OVERRIDE',
  'CAWDEX_MODEL',
  'CAWDEX_FALLBACK_MODEL',
  'CAWDEX_FALLBACK_MODEL_OVERRIDE',
  'CAWDEX_MAX_TOKENS',
  'CAWDEX_MAX_TOKENS_OVERRIDE',
  'CAWDEX_CONTEXT_WINDOW_TOKENS',
  'CAWDEX_CONTEXT_WINDOW_TOKENS_OVERRIDE',
  'CAWDEX_MAX_TURNS',
  'CAWDEX_MAX_TURNS_OVERRIDE',
  'CAWDEX_TEMPERATURE',
  'CAWDEX_TEMPERATURE_OVERRIDE',
  'CAWDEX_PERMISSION',
  'CAWDEX_MEMORY',
  'CAWDEX_THEME',
  'CAWDEX_SHOW_THINKING',
  'CAWDEX_BASE_URL_OVERRIDE',
  'CAWDEX_API_KEY_OVERRIDE',
  'CAWDEX_API_KEY_ENV',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'NVIDIA_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GLM_API_KEY',
  'ZHIPUAI_API_KEY',
  'OLLAMA_BASE_URL',
];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  clearEnv();
});

describe('environment config bootstrap', () => {
  it('returns null when no config environment is present', () => {
    clearEnv();
    expect(loadConfigFromEnv()).toBeNull();
  });

  it('builds an OpenRouter config from provider API key env', () => {
    clearEnv();
    process.env.OPENROUTER_API_KEY = 'sk-test-openrouter';
    const cfg = loadConfigFromEnv();
    expect(cfg).toMatchObject({
      apiKey: 'sk-test-openrouter',
      provider: PROVIDERS.openrouter.name,
      baseURL: PROVIDERS.openrouter.baseURL,
      model: 'openrouter/free',
      fallbackModel: 'openrouter/free',
    });
  });

  it('lets cawdex env override provider, model, and runtime knobs', () => {
    clearEnv();
    process.env.CAWDEX_PROVIDER = 'deepseek';
    process.env.CAWDEX_API_KEY = 'sk-test-deepseek';
    process.env.CAWDEX_MODEL = 'deepseek-reasoner';
    process.env.CAWDEX_MAX_TURNS = '42';
    process.env.CAWDEX_PERMISSION = 'yolo';
    process.env.CAWDEX_MEMORY = '0';
    process.env.CAWDEX_SHOW_THINKING = '0';

    const cfg = loadConfigFromEnv();
    expect(cfg?.provider).toBe(PROVIDERS.deepseek.name);
    expect(cfg?.apiKey).toBe('sk-test-deepseek');
    expect(cfg?.model).toBe('deepseek-reasoner');
    expect(cfg?.maxTurns).toBe(42);
    expect(cfg?.permissionMode).toBe('yolo');
    expect(cfg?.memory?.enabled).toBe(false);
    expect(cfg?.showThinking).toBe(false);
  });

  it('accepts cawdex env aliases for provider, model, and runtime knobs', () => {
    clearEnv();
    process.env.CAWDEX_PROVIDER = 'deepseek';
    process.env.CAWDEX_API_KEY = 'sk-test-cawdex-deepseek';
    process.env.CAWDEX_MODEL = 'deepseek-coder';
    process.env.CAWDEX_MAX_TURNS = '7';
    process.env.CAWDEX_PERMISSION = 'auto';
    process.env.CAWDEX_MEMORY = 'false';
    process.env.CAWDEX_SHOW_THINKING = 'false';

    const cfg = loadConfigFromEnv();
    expect(cfg?.provider).toBe(PROVIDERS.deepseek.name);
    expect(cfg?.apiKey).toBe('sk-test-cawdex-deepseek');
    expect(cfg?.model).toBe('deepseek-coder');
    expect(cfg?.maxTurns).toBe(7);
    expect(cfg?.permissionMode).toBe('auto');
    expect(cfg?.memory?.enabled).toBe(false);
    expect(cfg?.showThinking).toBe(false);
  });

  it('supports local custom OpenAI-compatible endpoints without an API key', () => {
    clearEnv();
    process.env.CAWDEX_BASE_URL = 'http://127.0.0.1:1234/v1';
    process.env.CAWDEX_MODEL = 'local-model';
    const cfg = loadConfigFromEnv();
    expect(cfg?.provider).toBe(PROVIDERS.custom.name);
    expect(cfg?.apiKey).toBe('');
    expect(cfg?.baseURL).toBe('http://127.0.0.1:1234/v1');
    expect(cfg?.model).toBe('local-model');
  });
});

describe('runtime config overrides', () => {
  const baseConfig: CawdexConfig = {
    apiKey: 'old-key',
    baseURL: 'https://old.example/v1',
    model: 'old-model',
    provider: 'OpenRouter',
    maxTokens: 8192,
    temperature: 0.3,
    permissionMode: 'ask',
  };

  it('applies non-mutating CLI/env overrides to an existing config', () => {
    clearEnv();
    process.env.CAWDEX_MODEL_OVERRIDE = 'new-model';
    process.env.CAWDEX_BASE_URL_OVERRIDE = 'https://new.example/v1';
    process.env.CAWDEX_MAX_TURNS_OVERRIDE = '12';
    process.env.CAWDEX_TEMPERATURE_OVERRIDE = '0.1';
    process.env.CAWDEX_CONTEXT_WINDOW_TOKENS_OVERRIDE = '64000';

    const cfg = applyRuntimeConfigOverrides(baseConfig);

    expect(baseConfig.model).toBe('old-model');
    expect(cfg.model).toBe('new-model');
    expect(cfg.baseURL).toBe('https://new.example/v1');
    expect(cfg.maxTurns).toBe(12);
    expect(cfg.temperature).toBe(0.1);
    expect(cfg.contextWindowTokens).toBe(64000);
  });

  it('applies cawdex runtime override aliases to an existing config', () => {
    clearEnv();
    process.env.CAWDEX_MODEL_OVERRIDE = 'new-cawdex-model';
    process.env.CAWDEX_BASE_URL_OVERRIDE = 'https://cawdex.example/v1';
    process.env.CAWDEX_MAX_TURNS_OVERRIDE = '5';
    process.env.CAWDEX_TEMPERATURE_OVERRIDE = '0.2';

    const cfg = applyRuntimeConfigOverrides(baseConfig);

    expect(cfg.model).toBe('new-cawdex-model');
    expect(cfg.baseURL).toBe('https://cawdex.example/v1');
    expect(cfg.maxTurns).toBe(5);
    expect(cfg.temperature).toBe(0.2);
  });

  it('can source a per-run API key from a named environment variable', () => {
    clearEnv();
    process.env.KBENCH_TEST_KEY = 'sk-test-runtime';
    process.env.CAWDEX_API_KEY_ENV = 'KBENCH_TEST_KEY';
    const cfg = applyRuntimeConfigOverrides(baseConfig);
    expect(cfg.apiKey).toBe('sk-test-runtime');
    delete process.env.KBENCH_TEST_KEY;
  });
});
