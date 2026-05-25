import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CrowcoderConfig } from './types.js';

// State dir names. The legacy name shipped under the "Crowcoder" brand;
// new installs use ".compact-agent". Resolution priority for CONFIG_DIR:
//
//   1. $COMPACT_AGENT_HOME    — explicit override (tests / sandboxes)
//   2. $CROWCODER_HOME        — legacy alias, still honored
//   3. ~/.compact-agent       — new default
//
// A one-shot migration runs the first time loadConfig() executes after an
// upgrade: if the new dir doesn't exist but the legacy ~/.crowcoder does,
// it gets renamed in place so existing users keep their config, sessions,
// skills, memory etc. without any manual step.
export const CONFIG_DIR_NAME = '.compact-agent';
export const LEGACY_CONFIG_DIR_NAME = '.crowcoder';

// Resolve the config dir LAZILY (every call) instead of caching at
// module-load time. The cached form prevented tests + sandboxed runs
// from overriding via COMPACT_AGENT_HOME after the first import: the
// first module to load would freeze the path at the user's real
// home, and all subsequent overrides were ignored. The resolution
// is cheap (env lookup + one join) so calling per access has no
// observable cost on the hot path.
function resolveConfigDir(): string {
  return (
    process.env.COMPACT_AGENT_HOME ||
    process.env.CROWCODER_HOME ||
    join(homedir(), CONFIG_DIR_NAME)
  );
}

function resolveConfigFile(): string {
  return join(resolveConfigDir(), 'config.json');
}

// Tracks whether we've already attempted the legacy-dir migration this
// process. Migration is idempotent (existsSync guard) but we still cache
// the decision so loadConfig() can be called repeatedly without re-stat'ing.
let _legacyMigrationChecked = false;

/**
 * One-shot rename of ~/.crowcoder → ~/.compact-agent for users upgrading
 * across the rebrand. Runs lazily from loadConfig() so tests that point
 * COMPACT_AGENT_HOME at a temp dir don't trigger it.
 *
 * Skipped if:
 *   - The new dir already exists (already migrated, or fresh install).
 *   - The legacy dir doesn't exist (fresh install — nothing to migrate).
 *   - CONFIG_DIR is overridden via env (tests / sandboxes).
 *
 * Strategy: prefer `rename` (atomic on same filesystem). If that fails
 * (e.g. EXDEV cross-device link), fall back to recursive copy + remove.
 * On any error, log a warning and proceed — the user's data is untouched
 * and they can rename manually.
 */
function migrateLegacyHomeDir(): void {
  if (_legacyMigrationChecked) return;
  _legacyMigrationChecked = true;

  // Env override → don't touch the user's real home dir.
  if (process.env.COMPACT_AGENT_HOME || process.env.CROWCODER_HOME) return;

  const newDir = join(homedir(), CONFIG_DIR_NAME);
  const legacyDir = join(homedir(), LEGACY_CONFIG_DIR_NAME);

  if (existsSync(newDir) || !existsSync(legacyDir)) return;

  try {
    renameSync(legacyDir, newDir);
    console.warn(
      `Note: migrated ~/${LEGACY_CONFIG_DIR_NAME} → ~/${CONFIG_DIR_NAME} (rebrand from Crowcoder to compact-agent).`,
    );
  } catch {
    // rename failed — most likely cross-device or permission. Fall back
    // to copy + remove. cpSync with recursive lands on Node 16.7+.
    try {
      cpSync(legacyDir, newDir, { recursive: true });
      rmSync(legacyDir, { recursive: true, force: true });
      console.warn(
        `Note: migrated ~/${LEGACY_CONFIG_DIR_NAME} → ~/${CONFIG_DIR_NAME} (copy mode).`,
      );
    } catch (err) {
      console.warn(
        `Warning: could not auto-migrate ~/${LEGACY_CONFIG_DIR_NAME} → ~/${CONFIG_DIR_NAME}: ${err instanceof Error ? err.message : err}. Move it manually if you want to keep your existing state.`,
      );
    }
  }
}

/**
 * Resolve the per-project state dir (codemap cache, project memory,
 * package-manager pref). Prefers `<cwd>/.compact-agent`; falls back to
 * the legacy `<cwd>/.crowcoder` only if it exists and the new one
 * doesn't. Project dirs are NOT auto-renamed — they often live inside
 * repos and migrating them silently could surprise teammates / CI.
 */
export function getProjectStateDir(cwd: string): string {
  const newDir = join(cwd, CONFIG_DIR_NAME);
  const legacyDir = join(cwd, LEGACY_CONFIG_DIR_NAME);
  if (!existsSync(newDir) && existsSync(legacyDir)) return legacyDir;
  return newDir;
}

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
  // Sandbox config. Default off: most workflows don't want the
  // restrictions, and the execpolicy intent gate from 1.19.0 already
  // catches the highest-risk commands. Users opt in via /sandbox standard
  // or /sandbox strict.
  sandbox: {
    level: 'off',
  },
  // MemPalace persistent memory. ON by default — it's a featured capability,
  // zero overhead until something is written, and the agent only uses the
  // tools when it sees a durable fact worth keeping. User can opt out during
  // the setup wizard or anytime via /memory disable.
  memory: {
    enabled: true,
    globalScope: true,
    projectScope: true,
  },
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
  return resolveConfigDir();
}

/**
 * Same as getConfigDir() but exported under a clearer name for
 * other modules that want the home-dir state root. Used by
 * sessions, debug log, gateguard state, etc.
 */
export function getHomeStateDir(): string {
  return resolveConfigDir();
}

export function loadConfig(): CrowcoderConfig {
  // Try to migrate legacy ~/.crowcoder → ~/.compact-agent before reading.
  migrateLegacyHomeDir();
  const configFile = resolveConfigFile();
  if (!existsSync(configFile)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configFile, 'utf-8');
    const loaded = JSON.parse(raw);
    const config = { ...DEFAULT_CONFIG, ...loaded };
    validateConfig(config);
    return config;
  } catch (err) {
    console.warn(`Warning: Failed to load config: ${err instanceof Error ? err.message : err}`);
    return { ...DEFAULT_CONFIG };
  }
}

// Track which fields we've already warned about this process. loadConfig()
// is called both from configExists() and from main(), and each invocation
// validates — so without this set we'd print "Warning: Unexpected config
// field: X" twice on every startup. Per-process is the right scope; cross-
// process spam would require persisting the set to disk which isn't worth
// the complexity for a defensive log message.
const _alreadyWarnedFields = new Set<string>();

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
  const expectedFields = new Set(['apiKey', 'apiKeys', 'baseURL', 'model', 'fallbackModel', 'provider', 'maxTokens', 'maxTurns', 'temperature', 'permissionMode', 'alwaysAllowedTools', 'dryRun', 'theme', 'palette', 'showThinking', 'voice', 'memory', 'sandbox']);
  for (const key in config) {
    if (!expectedFields.has(key) && !_alreadyWarnedFields.has(key)) {
      _alreadyWarnedFields.add(key);
      console.warn(`Warning: Unexpected config field: ${key}`);
    }
  }
}

export function saveConfig(config: CrowcoderConfig): void {
  mkdirSync(resolveConfigDir(), { recursive: true });
  writeFileSync(resolveConfigFile(), JSON.stringify(config, null, 2), 'utf-8');
}

export function configExists(): boolean {
  const cfg = loadConfig();
  return !!(cfg.apiKey || !requiresKey(cfg));
}

function requiresKey(cfg: CrowcoderConfig): boolean {
  // Local providers don't need API keys
  return !cfg.baseURL.includes('localhost') && !cfg.baseURL.includes('127.0.0.1');
}
