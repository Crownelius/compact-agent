import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CrowcoderConfig } from './types.js';

// CROWCODER_HOME lets tests / sandboxed runs point at a temp config dir
// instead of clobbering the user's real ~/.crowcoder/config.json. Default
// is the real home dir so production behavior is unchanged.
const CONFIG_DIR = process.env.CROWCODER_HOME || join(homedir(), '.crowcoder');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: CrowcoderConfig = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  // When the primary model returns a cryptic/empty provider error
  // (common for free / experimental OpenRouter models like owl-alpha
  // returning literally "ERROR"), runQuery retries ONCE with this
  // fallback. anthropic/claude-sonnet-4 is paid but rarely fails this
  // way — chosen as a safe escape hatch, not a default model.
  fallbackModel: 'anthropic/claude-sonnet-4',
  provider: 'OpenRouter',
  maxTokens: 8192,
  temperature: 0.3,
  permissionMode: 'ask',
  // Default color palette. Users switch with /palette <name>; available
  // palettes are listed via /palettes. compact-cmyk is the original look.
  palette: 'compact-cmyk',
  // Thinking / reasoning shown by default — gives users live "the model isn't
  // dead" feedback during long turns. Toggle off with /thinking.
  showThinking: true,
  // Voice / accessibility is OFF by default. ffmpeg is optional. Users opt in
  // via `/voice on` (and set the two API keys via `/voice config`). The
  // sub-blocks define what becomes active once enabled; this just primes them
  // with reasonable defaults so first use Just Works.
  voice: {
    enabled: false,
    stt: {
      // apiKey unset — falls back to top-level apiKey for OpenAI-compatible
      // providers. Whisper specifically requires a real OpenAI key; users
      // configure a separate one via /voice config when their main provider
      // isn't OpenAI.
      baseURL: 'https://api.openai.com/v1',
      model: 'whisper-1',
      dictationKey: 'F5',
      autoSubmit: false,
    },
    tts: {
      // apiKey unset — no fallback (ElevenLabs is a distinct provider). User
      // must run /voice config to provide it.
      baseURL: 'https://api.elevenlabs.io/v1',
      model: 'eleven_turbo_v2_5',
      // Rachel + Domi — both available on every ElevenLabs free tier; using
      // two distinct presets gives instant blind-accessibility benefit
      // (assistant ≠ user voice).
      assistantVoiceId: '21m00Tcm4TlvDq8ikWAM',
      userVoiceId: 'AZnzlk1XvdvUeBnXmlld',
      echoUser: true,
      skipCode: true,
      speed: 1.0,
      stability: 0.5,
      similarityBoost: 0.75,
    },
    accessibility: {
      // screenReader OFF by default — it's lossy for sighted users (no ANSI
      // means no syntax highlight). Blind users turn it on via /accessibility
      // screenReader on.
      screenReader: false,
      audioCues: true,
      announceErrors: true,
      announceModeSwitches: true,
      askBeforeDestructive: true,
      longResponseThreshold: 300,
    },
  },
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
  const expectedFields = new Set(['apiKey', 'baseURL', 'model', 'fallbackModel', 'provider', 'maxTokens', 'temperature', 'permissionMode', 'dryRun', 'theme', 'palette', 'showThinking', 'voice']);
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
