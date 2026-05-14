import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CrowcoderConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.crowcoder');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: CrowcoderConfig = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  provider: 'OpenRouter',
  maxTokens: 8192,
  temperature: 0.3,
  permissionMode: 'ask',
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function loadConfig(): CrowcoderConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const loaded = JSON.parse(raw);
    const config = { ...DEFAULT_CONFIG, ...loaded };
    validateConfig(config);
    return config;
  } catch (err) {
    console.warn(`Warning: Failed to load config: ${err instanceof Error ? err.message : err}`);
    return { ...DEFAULT_CONFIG };
  }
}

function validateConfig(config: CrowcoderConfig): void {
  // Validate baseURL
  if (config.baseURL && typeof config.baseURL === 'string') {
    try {
      new URL(config.baseURL);
    } catch {
      console.warn(`Warning: Invalid baseURL: ${config.baseURL}`);
      config.baseURL = DEFAULT_CONFIG.baseURL;
    }
  }

  // Validate model
  if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
    console.warn('Warning: Invalid model name, using default');
    config.model = DEFAULT_CONFIG.model;
  }

  // Validate permissionMode
  const validModes: CrowcoderConfig['permissionMode'][] = ['ask', 'auto', 'yolo'];
  if (!validModes.includes(config.permissionMode)) {
    console.warn(`Warning: Invalid permissionMode: ${config.permissionMode}, using 'ask'`);
    config.permissionMode = 'ask';
  }

  // Warn on unexpected fields
  const expectedFields = new Set(['apiKey', 'baseURL', 'model', 'provider', 'maxTokens', 'temperature', 'permissionMode', 'dryRun', 'theme', 'showThinking']);
  for (const key in config) {
    if (!expectedFields.has(key)) {
      console.warn(`Warning: Unexpected config field: ${key}`);
    }
  }
}

export function saveConfig(config: CrowcoderConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function configExists(): boolean {
  const cfg = loadConfig();
  return !!(cfg.apiKey || !requiresKey(cfg));
}

function requiresKey(cfg: CrowcoderConfig): boolean {
  // Local providers don't need API keys
  return !cfg.baseURL.includes('localhost') && !cfg.baseURL.includes('127.0.0.1');
}
