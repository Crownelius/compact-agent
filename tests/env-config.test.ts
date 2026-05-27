import { afterEach, describe, expect, it } from 'vitest';
import { applyRuntimeConfigOverrides, loadConfigFromEnv } from '../src/config.js';
import type { VentipusConfig } from '../src/types.js';
import { PROVIDERS } from '../src/types.js';

const ENV_KEYS = [
  'VENTIPUS_PROVIDER',
  'VENTIPUS_PROVIDER',
  'VENTIPUS_API_KEY',
  'VENTIPUS_API_KEY',
  'VENTIPUS_BASE_URL',
  'VENTIPUS_BASE_URL',
  'VENTIPUS_MODEL',
  'VENTIPUS_MODEL_OVERRIDE',
  'VENTIPUS_MODEL',
  'VENTIPUS_FALLBACK_MODEL',
  'VENTIPUS_FALLBACK_MODEL_OVERRIDE',
  'VENTIPUS_MAX_TOKENS',
  'VENTIPUS_MAX_TOKENS_OVERRIDE',
  'VENTIPUS_CONTEXT_WINDOW_TOKENS',
  'VENTIPUS_CONTEXT_WINDOW_TOKENS_OVERRIDE',
  'VENTIPUS_MAX_TURNS',
  'VENTIPUS_MAX_TURNS_OVERRIDE',
  'VENTIPUS_TEMPERATURE',
  'VENTIPUS_TEMPERATURE_OVERRIDE',
  'VENTIPUS_PERMISSION',
  'VENTIPUS_MEMORY',
  'VENTIPUS_THEME',
  'VENTIPUS_SHOW_THINKING',
  'VENTIPUS_BASE_URL_OVERRIDE',
  'VENTIPUS_API_KEY_OVERRIDE',
  'VENTIPUS_API_KEY_ENV',
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

  it('lets ventipus env override provider, model, and runtime knobs', () => {
    clearEnv();
    process.env.VENTIPUS_PROVIDER = 'deepseek';
    process.env.VENTIPUS_API_KEY = 'sk-test-deepseek';
    process.env.VENTIPUS_MODEL = 'deepseek-reasoner';
    process.env.VENTIPUS_MAX_TURNS = '42';
    process.env.VENTIPUS_PERMISSION = 'yolo';
    process.env.VENTIPUS_MEMORY = '0';
    process.env.VENTIPUS_SHOW_THINKING = '0';

    const cfg = loadConfigFromEnv();
    expect(cfg?.provider).toBe(PROVIDERS.deepseek.name);
    expect(cfg?.apiKey).toBe('sk-test-deepseek');
    expect(cfg?.model).toBe('deepseek-reasoner');
    expect(cfg?.maxTurns).toBe(42);
    expect(cfg?.permissionMode).toBe('yolo');
    expect(cfg?.memory?.enabled).toBe(false);
    expect(cfg?.showThinking).toBe(false);
  });

  it('supports local custom OpenAI-compatible endpoints without an API key', () => {
    clearEnv();
    process.env.VENTIPUS_BASE_URL = 'http://127.0.0.1:1234/v1';
    process.env.VENTIPUS_MODEL = 'local-model';
    const cfg = loadConfigFromEnv();
    expect(cfg?.provider).toBe(PROVIDERS.custom.name);
    expect(cfg?.apiKey).toBe('');
    expect(cfg?.baseURL).toBe('http://127.0.0.1:1234/v1');
    expect(cfg?.model).toBe('local-model');
  });
});

describe('runtime config overrides', () => {
  const baseConfig: VentipusConfig = {
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
    process.env.VENTIPUS_MODEL_OVERRIDE = 'new-model';
    process.env.VENTIPUS_BASE_URL_OVERRIDE = 'https://new.example/v1';
    process.env.VENTIPUS_MAX_TURNS_OVERRIDE = '12';
    process.env.VENTIPUS_TEMPERATURE_OVERRIDE = '0.1';
    process.env.VENTIPUS_CONTEXT_WINDOW_TOKENS_OVERRIDE = '64000';

    const cfg = applyRuntimeConfigOverrides(baseConfig);

    expect(baseConfig.model).toBe('old-model');
    expect(cfg.model).toBe('new-model');
    expect(cfg.baseURL).toBe('https://new.example/v1');
    expect(cfg.maxTurns).toBe(12);
    expect(cfg.temperature).toBe(0.1);
    expect(cfg.contextWindowTokens).toBe(64000);
  });

  it('can source a per-run API key from a named environment variable', () => {
    clearEnv();
    process.env.KBENCH_TEST_KEY = 'sk-test-runtime';
    process.env.VENTIPUS_API_KEY_ENV = 'KBENCH_TEST_KEY';
    const cfg = applyRuntimeConfigOverrides(baseConfig);
    expect(cfg.apiKey).toBe('sk-test-runtime');
    delete process.env.KBENCH_TEST_KEY;
  });
});
