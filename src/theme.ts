/**
 * TUI theme — Crowcoder terminal styling.
 *
 * Inspired by Gemini CLI and Claude Code design patterns:
 *   - Semantic color tokens (not raw hex everywhere)
 *   - Unicode symbols for status indicators
 *   - Clean typography with proper contrast
 *   - 8 swappable palettes sourced from popular community themes
 *
 * The active palette is a module-level mutable record. setPalette() rebuilds
 * every chalk-bound token in the exported `theme` object in place, so any
 * code holding a reference to `theme.brand`, `theme.dim`, etc. picks up the
 * new colors on the next call — no re-import or restart required.
 *
 * Palettes intentionally share the same 13 named slots (cyan / magenta /
 * yellow + 5 neutrals + dimmed variants). Theme authors map their colors
 * into those slots; UI code reads only the semantic tokens. This trades a
 * small loss of fidelity (a Dracula "purple" gets stored in the `cyanLight`
 * slot because that's where the accent goes) for a single uniform API.
 */
import chalk from 'chalk';

// ── Palette catalog ─────────────────────────────────────
// All palettes use the same 13 slots so UI code can treat them uniformly.
// Slot meanings:
//   cyan / cyanLight / cyanDim   — primary accent + variants
//   magenta / magentaDim          — destructive / error accent
//   yellow / yellowDim            — warning / command accent
//   key                            — background-ish neutral for badge text
//   white / light / mid / gray / darkGray — text hierarchy, light → dark
export interface ColorPalette {
  cyan: string; cyanLight: string; cyanDim: string;
  magenta: string; magentaDim: string;
  yellow: string; yellowDim: string;
  key: string;
  white: string; light: string; mid: string; gray: string; darkGray: string;
}

export type PaletteId =
  | 'compact-cmyk'
  | 'dracula'
  | 'nord'
  | 'solarized-dark'
  | 'gruvbox'
  | 'tokyo-night'
  | 'catppuccin'
  | 'high-contrast';

export interface PaletteMeta {
  id: PaletteId;
  name: string;
  source: string;
  description: string;
}

export const PALETTES: Record<PaletteId, ColorPalette> = {
  // Default. The original Compact Agent CMYK theme.
  'compact-cmyk': {
    cyan: '#00BCD4', cyanLight: '#4DD0E1', cyanDim: '#00838F',
    magenta: '#E91E63', magentaDim: '#AD1457',
    yellow: '#FFEB3B', yellowDim: '#F9A825',
    key: '#212121',
    white: '#ECEFF1', light: '#CFD8DC', mid: '#B0BEC5', gray: '#90A4AE', darkGray: '#607D8B',
  },
  // draculatheme.com — most-installed VS Code theme on earth
  'dracula': {
    cyan: '#8be9fd', cyanLight: '#bd93f9', cyanDim: '#6272a4',
    magenta: '#ff79c6', magentaDim: '#bd93f9',
    yellow: '#f1fa8c', yellowDim: '#ffb86c',
    key: '#282a36',
    white: '#f8f8f2', light: '#f8f8f2', mid: '#bbbbbb', gray: '#6272a4', darkGray: '#44475a',
  },
  // nordtheme.com — cool arctic palette
  'nord': {
    cyan: '#88c0d0', cyanLight: '#8fbcbb', cyanDim: '#5e81ac',
    magenta: '#b48ead', magentaDim: '#d08770',
    yellow: '#ebcb8b', yellowDim: '#d08770',
    key: '#2e3440',
    white: '#eceff4', light: '#d8dee9', mid: '#a3be8c', gray: '#81a1c1', darkGray: '#4c566a',
  },
  // ethanschoonover.com/solarized — designed for prolonged terminal reading
  'solarized-dark': {
    cyan: '#2aa198', cyanLight: '#268bd2', cyanDim: '#073642',
    magenta: '#d33682', magentaDim: '#6c71c4',
    yellow: '#b58900', yellowDim: '#cb4b16',
    key: '#002b36',
    white: '#fdf6e3', light: '#eee8d5', mid: '#93a1a1', gray: '#839496', darkGray: '#586e75',
  },
  // morhetz/gruvbox — warm earthy retro
  'gruvbox': {
    cyan: '#83a598', cyanLight: '#8ec07c', cyanDim: '#458588',
    magenta: '#d3869b', magentaDim: '#b16286',
    yellow: '#fabd2f', yellowDim: '#fe8019',
    key: '#282828',
    white: '#ebdbb2', light: '#d5c4a1', mid: '#bdae93', gray: '#a89984', darkGray: '#665c54',
  },
  // enkia.github.io/tokyo-night — high-saturation modern dark
  'tokyo-night': {
    cyan: '#7dcfff', cyanLight: '#7aa2f7', cyanDim: '#414868',
    magenta: '#bb9af7', magentaDim: '#ff007c',
    yellow: '#e0af68', yellowDim: '#ff9e64',
    key: '#1a1b26',
    white: '#c0caf5', light: '#a9b1d6', mid: '#9aa5ce', gray: '#565f89', darkGray: '#414868',
  },
  // catppuccin.com — pastel "mocha" variant
  'catppuccin': {
    cyan: '#94e2d5', cyanLight: '#89dceb', cyanDim: '#74c7ec',
    magenta: '#f5c2e7', magentaDim: '#cba6f7',
    yellow: '#f9e2af', yellowDim: '#fab387',
    key: '#1e1e2e',
    white: '#cdd6f4', light: '#bac2de', mid: '#a6adc8', gray: '#9399b2', darkGray: '#6c7086',
  },
  // Pure-saturation accessibility palette for users with low vision who
  // still see some color. Maximum contrast against terminal black.
  'high-contrast': {
    cyan: '#00ffff', cyanLight: '#80ffff', cyanDim: '#008080',
    magenta: '#ff00ff', magentaDim: '#800080',
    yellow: '#ffff00', yellowDim: '#cccc00',
    key: '#000000',
    white: '#ffffff', light: '#ffffff', mid: '#cccccc', gray: '#aaaaaa', darkGray: '#888888',
  },
};

export const PALETTE_META: Record<PaletteId, PaletteMeta> = {
  'compact-cmyk':   { id: 'compact-cmyk',   name: 'Compact CMYK (default)', source: 'in-house',            description: 'Cyan/Magenta/Yellow on dark — the original.' },
  'dracula':        { id: 'dracula',        name: 'Dracula',                source: 'draculatheme.com',     description: 'Purple/pink/cyan — the most popular dark theme.' },
  'nord':           { id: 'nord',           name: 'Nord',                   source: 'nordtheme.com',        description: 'Cool arctic blues + soft greens.' },
  'solarized-dark': { id: 'solarized-dark', name: 'Solarized Dark',         source: 'ethanschoonover.com',  description: 'Designed for prolonged terminal reading.' },
  'gruvbox':        { id: 'gruvbox',        name: 'Gruvbox Dark',           source: 'github.com/morhetz',   description: 'Warm earthy retro tones.' },
  'tokyo-night':    { id: 'tokyo-night',    name: 'Tokyo Night',            source: 'enkia.github.io',      description: 'High-saturation modern dark.' },
  'catppuccin':     { id: 'catppuccin',     name: 'Catppuccin Mocha',       source: 'catppuccin.com',       description: 'Pastel pinks + blues.' },
  'high-contrast':  { id: 'high-contrast',  name: 'High Contrast (a11y)',   source: 'WCAG-friendly',        description: 'Pure saturated colors. For low-vision users.' },
};

// Active palette — mutable. Starts on the default; index.ts calls
// setPalette() with the user's choice during startup.
let palette: ColorPalette = PALETTES['compact-cmyk'];
let activePaletteId: PaletteId = 'compact-cmyk';

export function getPaletteId(): PaletteId { return activePaletteId; }
export function listPalettes(): PaletteMeta[] { return Object.values(PALETTE_META); }
export function isPaletteId(s: string): s is PaletteId { return s in PALETTES; }

// ── Symbols (matching Gemini/Claude patterns) ───────────
export const sym = {
  crow:      '◆',           // Brand mark (filled diamond)
  prompt:    '❯',           // User input prompt
  assistant: '✦',           // Assistant message prefix
  success:   '✓',           // Tool success
  error:     '✗',           // Tool error
  pending:   '○',           // Tool pending
  running:   '●',           // Tool running
  thinking:  '∴',           // Thinking indicator
  warn:      '⚠',           // Warning
  arrow:     '→',           // Flow indicator
  bullet:    '▸',           // List item
  divider:   '─',           // Horizontal rule char
};

// ── Theme (semantic color tokens) ───────────────────────
// `theme` is a mutable object — setPalette() reassigns every property in
// place. UI callers (which look up theme.brand, theme.dim, etc. at call
// time) automatically pick up the new palette without re-imports.
type ChalkFn = (s: string) => string;
type BadgeFn = (s: string) => string;
interface Theme {
  brand: ChalkFn; brandBold: ChalkFn; brandDim: ChalkFn;
  success: ChalkFn; warning: ChalkFn; error: ChalkFn; info: ChalkFn;
  primary: ChalkFn; secondary: ChalkFn; dim: ChalkFn; muted: ChalkFn; bright: ChalkFn; italic: ChalkFn;
  header: ChalkFn; subheader: ChalkFn; command: ChalkFn; cost: ChalkFn; link: ChalkFn;
  prompt: ChalkFn; assistant: ChalkFn; user: ChalkFn;
  toolName: ChalkFn; toolArgs: ChalkFn; toolStatus: ChalkFn; toolError: ChalkFn; toolTime: ChalkFn;
  thinkBorder: ChalkFn; thinkText: ChalkFn; thinkLabel: ChalkFn;
  modeBadge: BadgeFn; secBadge: BadgeFn;
}

/**
 * Build a fresh Theme object for the currently active palette. Called by
 * setPalette() at runtime and once at module load for the default.
 */
function buildTheme(p: ColorPalette): Theme {
  return {
    brand:       chalk.hex(p.cyan),
    brandBold:   chalk.hex(p.cyan).bold,
    brandDim:    chalk.hex(p.cyanDim),

    success:     chalk.hex(p.cyanLight),
    warning:     chalk.hex(p.yellow),
    error:       chalk.hex(p.magenta),
    info:        chalk.hex(p.cyanLight),

    primary:     chalk.hex(p.white),
    secondary:   chalk.hex(p.mid),
    dim:         chalk.hex(p.gray),
    muted:       chalk.hex(p.darkGray),
    bright:      chalk.hex(p.white).bold,
    italic:      chalk.hex(p.mid).italic,

    header:      chalk.hex(p.cyan).bold,
    subheader:   chalk.hex(p.cyanLight),
    command:     chalk.hex(p.yellow),
    cost:        chalk.hex(p.gray),
    link:        chalk.hex(p.cyanLight).underline,

    prompt:      chalk.hex(p.cyan).bold,
    assistant:   chalk.hex(p.cyanLight).bold,
    user:        chalk.hex(p.white),

    toolName:    chalk.hex(p.cyan).bold,
    toolArgs:    chalk.hex(p.mid),
    toolStatus:  chalk.hex(p.cyanLight),
    toolError:   chalk.hex(p.magenta),
    toolTime:    chalk.hex(p.gray),

    thinkBorder: chalk.hex(p.darkGray),
    thinkText:   chalk.hex(p.gray).italic,
    thinkLabel:  chalk.hex(p.darkGray).italic,

    modeBadge: (mode: string): string => {
      const colors: Record<string, ChalkFn> = {
        dev:       chalk.bgHex(p.cyan).hex(p.key),
        review:    chalk.bgHex(p.cyanDim).hex(p.white),
        tdd:       chalk.bgHex(p.magenta).hex(p.white),
        research:  chalk.bgHex(p.yellow).hex(p.key),
        plan:      chalk.bgHex(p.yellowDim).hex(p.key),
        debug:     chalk.bgHex(p.magentaDim).hex(p.white),
        architect: chalk.bgHex(p.cyanLight).hex(p.key),
        hermes:    chalk.bgHex(p.magenta).hex(p.white),
        design:    chalk.bgHex(p.yellowDim).hex(p.key),
      };
      return (colors[mode] || chalk.bgGray.white)(` ${mode.toUpperCase()} `);
    },

    secBadge: (level: string): string => {
      const colors: Record<string, ChalkFn> = {
        critical: chalk.bgHex(p.magenta).hex(p.white).bold,
        high:     chalk.hex(p.magenta).bold,
        medium:   chalk.hex(p.yellow),
        low:      chalk.hex(p.gray),
        safe:     chalk.hex(p.cyan),
      };
      return (colors[level] || chalk.white)(level.toUpperCase());
    },
  };
}

export const theme: Theme = buildTheme(palette);

/**
 * Switch the active palette. Mutates the exported `theme` object in place
 * so existing callers don't need to re-import. Returns true if the palette
 * was found and applied; false if id was unknown.
 */
export function setPalette(id: string): boolean {
  if (!isPaletteId(id)) return false;
  palette = PALETTES[id];
  activePaletteId = id;
  Object.assign(theme, buildTheme(palette));
  return true;
}

// ── Banner (single unified startup display) ────────────
export function printBanner(
  provider: string,
  model: string,
  mode: string,
  permissionMode: string,
  sessionId: string,
  toolNames: string[],
): void {
  const b = theme.brandBold;
  const d = theme.dim;
  const s = theme.secondary;
  const w = theme.bright;

  console.log('');
  console.log(b(`  ${sym.crow}  C O M P A C T   A G E N T`));
  console.log(d('     A dense, feature-rich AI coding agent'));
  console.log('');
  console.log(d('  ' + sym.divider.repeat(40)));
  console.log(s('  Provider  ') + w(provider) + s('  ') + d('│') + s('  Model  ') + w(model));
  console.log(s('  Mode      ') + theme.modeBadge(mode) + s('     ') + d('│') + s('  Perms  ') + w(permissionMode));
  console.log(s('  Session   ') + d(sessionId.slice(0, 12)));
  console.log(d('  ' + sym.divider.repeat(40)));
  console.log(s('  Tools: ') + d(toolNames.join(', ')));
  console.log('');
  console.log(d('  Type ') + theme.command('/help') + d(' for commands  ') + d('•') + d('  Ctrl+C to exit'));
  console.log('');
}

// ── Duration formatter ─────────────────────────────────
// Human-readable elapsed time for session + chain timers.
// Examples: 5s · 1m 23s · 2h 5m · 1d 4h
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// printSplash kept as a no-op for API compatibility — ASCII art was removed
// per user request. Existing callers don't need to be updated, but ideally
// would be (see src/index.ts for the canonical call site).
export function printSplash(): void { /* removed */ }

// ── Screen-reader output dispatch ───────────────────────
// When accessibility.screenReader is enabled, every console.log / stderr
// line passes through applyScreenReader first. We install this as a
// runtime stdout/stderr patch rather than rewriting every call site —
// otherwise we'd have to touch 200+ console.log lines across the codebase.
//
// The patch is idempotent: calling installScreenReaderDispatch() twice
// won't double-wrap. Calling uninstallScreenReaderDispatch() restores
// the original write functions.
type WriteFn = typeof process.stdout.write;
interface StreamPatchState {
  original: WriteFn;
  transform: (s: string) => string;
}
const _streamState = new WeakMap<NodeJS.WriteStream, StreamPatchState>();

export function installScreenReaderDispatch(transform: (s: string) => string): void {
  for (const stream of [process.stdout, process.stderr] as NodeJS.WriteStream[]) {
    if (_streamState.has(stream)) continue;
    const original = stream.write.bind(stream) as WriteFn;
    _streamState.set(stream, { original, transform });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stream as any).write = function patchedWrite(this: NodeJS.WriteStream, chunk: any, encodingOrCb?: any, cb?: any): boolean {
      try {
        if (typeof chunk === 'string') chunk = transform(chunk);
        else if (Buffer.isBuffer(chunk)) chunk = transform(chunk.toString('utf-8'));
      } catch { /* fall through to original */ }
      // eslint-disable-next-line prefer-rest-params
      return original(chunk, encodingOrCb, cb);
    };
  }
}

export function uninstallScreenReaderDispatch(): void {
  for (const stream of [process.stdout, process.stderr] as NodeJS.WriteStream[]) {
    const state = _streamState.get(stream);
    if (!state) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stream as any).write = state.original;
    _streamState.delete(stream);
  }
}

// ── Section Header ──────────────────────────────────────
export function printSection(title: string): void {
  console.log('');
  console.log(theme.header(`  ${sym.divider}${sym.divider} ${title} ${sym.divider.repeat(Math.max(2, 36 - title.length))}`));
}

// ── Key-Value Pair ──────────────────────────────────────
export function printKV(key: string, value: string, indent = 2): void {
  const padding = ' '.repeat(indent);
  console.log(padding + theme.secondary(key.padEnd(14)) + theme.bright(value));
}

// ── Tool Execution Display ──────────────────────────────
// Args are condensed to a single line, truncated to 80 chars to keep the
// vertical footprint low.
export function printToolRun(name: string, args: string): void {
  const compactArgs = args.replace(/\s+/g, ' ').trim();
  const display = compactArgs.length > 80 ? compactArgs.slice(0, 77) + '...' : compactArgs;
  console.log(
    theme.toolName(`  ${sym.running} ${name}`) +
    (display ? theme.toolArgs(` ${display}`) : ''),
  );
}

// Result is always a single line: icon + elapsed + first non-empty line of
// output (max 120 chars). No more multi-line previews — they bloat the
// transcript and obscure the next action.
export function printToolResult(success: boolean, elapsed: number, output: string): void {
  const icon = success ? theme.toolStatus(sym.success) : theme.toolError(sym.error);
  const time = theme.toolTime(`${(elapsed / 1000).toFixed(1)}s`);
  const firstLine = (output.split('\n').find((l) => l.trim().length > 0) || '').trim();
  const preview = firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
  const tail = output.length > preview.length + 10
    ? theme.dim(`  +${output.length - preview.length}b`)
    : '';
  console.log(`  ${icon} ${time}  ${theme.dim(preview)}${tail}`);
}

// ── Thinking Display ────────────────────────────────────
// Inline streaming with a left border, no surrounding blank lines.
// Toggle visibility with /thinking.
export function printThinkingOpen(): void {
  console.log(theme.thinkBorder('  │ ') + theme.thinkLabel(`${sym.thinking} thinking`));
}

export function printThinkingText(text: string): void {
  // Add the border prefix only after newlines within the chunk — NOT at
  // the start. printThinkingOpen() already wrote the first-line prefix.
  // Adding `'  │ '` to every chunk produced "| word | word | word" output
  // when the model streamed thinking token-by-token, because each token
  // arrived as its own writeStream call and each got a fresh prefix.
  const prefixed = text.replace(/\n(?!$)/g, '\n' + theme.thinkBorder('  │ '));
  process.stdout.write(theme.thinkText(prefixed));
}

export function printThinkingClose(): void {
  process.stdout.write('\n');
}

// ── Cost / telemetry line ─────────────────────────────────
// One compact status line per model turn: tokens + cost + elapsed time.
// No leading blank — caller is responsible for line state (newline as
// needed before this is printed).
export function printCost(
  prompt: number,
  completion: number,
  cost: number,
  warning?: string,
  elapsedMs?: number,
): void {
  const fmt = (n: number) => (n > 999 ? `${(n / 1000).toFixed(1)}K` : String(n));
  const p = fmt(prompt);
  const c = fmt(completion);
  const t = typeof elapsedMs === 'number'
    ? `  ${theme.toolTime((elapsedMs / 1000).toFixed(1) + 's')}`
    : '';
  console.log(
    theme.cost(`  ${p}${sym.arrow}${c} tokens  $${cost.toFixed(4)}`) + t,
  );
  if (warning) {
    console.log(theme.warning(`  ${sym.warn} ${warning}`));
  }
}

// ── API error formatter ─────────────────────────────────
/**
 * Pattern-match an API error message + status into a specific category,
 * with provider-aware diagnosis and a one-line fix. Returns the best
 * matching pattern, or a generic fallback.
 */
export interface ApiErrorContext {
  baseURL?: string;
  provider?: string;
  model?: string;
}

export interface CategorizedError {
  category: string;          // short label like "rate-limit-free", "context-overflow"
  status?: number;           // 401/404/429/etc.
  provider: string;          // detected provider name
  title: string;             // one-line headline (becomes the badge body)
  why: string;               // explanation of what happened
  fix: string;               // single concrete next step
  docs?: string;             // optional doc URL
  severity: 'auth' | 'quota' | 'model' | 'context' | 'content' | 'network' | 'server' | 'unknown';
}

function detectProvider(message: string, ctx: ApiErrorContext): string {
  const m = message.toLowerCase();
  if (ctx.provider) return ctx.provider;
  const base = (ctx.baseURL || '').toLowerCase();
  if (base.includes('openrouter') || m.includes('openrouter')) return 'OpenRouter';
  if (base.includes('openai.com')) return 'OpenAI';
  if (base.includes('anthropic.com') || m.includes('anthropic')) return 'Anthropic';
  if (base.includes('deepseek')) return 'DeepSeek';
  if (base.includes('googleapis') || m.includes('google')) return 'Google';
  if (base.includes('bigmodel.cn') || m.includes('zhipu')) return 'GLM';
  if (base.includes('11434')) return 'Ollama';
  if (base.includes('1234')) return 'LM Studio';
  return 'API';
}

function extractStatus(message: string): number | undefined {
  // Common shapes:
  //   "API Error: 404 Ring-..."
  //   "Request failed with status code 401"
  //   "404 Not Found - GET https://..."
  //   "HTTP 502"
  const direct = message.match(/\b(?:status(?:\s+code)?\s*[:=]?\s*|HTTP\s+|API\s+Error:\s*|^)([1-5]\d{2})\b/i);
  if (direct) return parseInt(direct[1], 10);
  // Bare 3-digit code at the start of the message
  const bare = message.match(/^\s*([1-5]\d{2})\b/);
  if (bare) return parseInt(bare[1], 10);
  return undefined;
}

function extractUrl(message: string): string | undefined {
  const m = message.match(/https?:\/\/[^\s)>"']+/);
  return m ? m[0] : undefined;
}

export function categorizeApiError(message: string, ctx: ApiErrorContext = {}): CategorizedError {
  const provider = detectProvider(message, ctx);
  const status = extractStatus(message);
  const lower = message.toLowerCase();

  // ── Most specific patterns first ───────────────────────

  // Free-tier per-minute rate limit (OpenRouter signature)
  if ((status === 429 || lower.includes('rate limit')) && /free[-_\s]*models?[-_\s]*per[-_\s]*min/.test(lower)) {
    return {
      category: 'rate-limit-free-per-min', status, provider, severity: 'quota',
      title: 'Free-tier rate limit (20 RPM)',
      why: `${provider}'s free models cap at ~20 requests per minute.`,
      fix: 'Wait ~60s, OR switch to a paid model with /model, OR add credits to your account.',
      docs: 'https://openrouter.ai/docs/limits',
    };
  }

  // Free-tier daily limit
  if (status === 429 && /(daily|free[-_\s]*models?[-_\s]*per[-_\s]*day|day-limit)/.test(lower)) {
    return {
      category: 'rate-limit-free-per-day', status, provider, severity: 'quota',
      title: 'Free-tier daily limit reached',
      why: `${provider}'s free tier caps daily request count (typically 50–200/day).`,
      fix: 'Wait until the limit resets (UTC midnight), switch models with /model, or upgrade your plan.',
      docs: 'https://openrouter.ai/docs/limits',
    };
  }

  // Generic rate limit
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      category: 'rate-limit', status: status ?? 429, provider, severity: 'quota',
      title: 'Rate limited',
      why: `${provider} rejected the request because you're sending them too fast.`,
      fix: 'Wait a few seconds and retry, OR switch to a less-loaded model with /model.',
    };
  }

  // Model deprecated / migrated to paid (OpenRouter "transitioned to a paid model")
  if (/(no longer (available|free)|transitioned to|has been removed|deprecated|sunset)/.test(lower)) {
    return {
      category: 'model-deprecated', status: status ?? 404, provider, severity: 'model',
      title: 'Model deprecated or moved',
      why: 'The upstream provider removed or paywalled this model.',
      fix: 'Pick another model with /model <name>, or run /config to switch provider.',
      docs: extractUrl(message),
    };
  }

  // Model not found
  if (status === 404 || /(model[^\n]*not (found|exist)|no such model|unknown model|engine not found)/.test(lower)) {
    return {
      category: 'model-not-found', status: status ?? 404, provider, severity: 'model',
      title: 'Model not found',
      why: `${provider} doesn't recognize "${ctx.model || 'the configured model'}".`,
      fix: 'Check the spelling with /models, or pick a different one with /model <name>.',
    };
  }

  // Auth failures
  if (status === 401 || /(unauthorized|invalid (api )?key|invalid token|authentication failed|incorrect api key)/.test(lower)) {
    return {
      category: 'auth-bad-key', status: status ?? 401, provider, severity: 'auth',
      title: 'Authentication failed',
      why: `${provider} rejected the API key. It's missing, malformed, or revoked.`,
      fix: 'Re-set your key with /config. Check ~/.crowcoder/config.json if /config doesn\'t catch it.',
    };
  }

  // Forbidden - 2FA / restricted
  if (status === 403 && /(two[-_\s]*factor|2fa|otp|second[-_\s]*factor)/.test(lower)) {
    return {
      category: 'auth-2fa', status, provider, severity: 'auth',
      title: '2FA required',
      why: `${provider} requires a one-time code for this account/action.`,
      fix: 'For npm: use `npm publish --otp=<code>`. For account access: complete 2FA in the web UI.',
    };
  }

  // Forbidden - generic permission
  if (status === 403 || lower.includes('forbidden') || lower.includes('permission denied')) {
    return {
      category: 'auth-forbidden', status: status ?? 403, provider, severity: 'auth',
      title: 'Access denied',
      why: `${provider} accepted your key but won't allow this specific action (e.g. model access, geo restriction).`,
      fix: 'Check account permissions in the provider\'s web UI, or try a different model with /model.',
    };
  }

  // Payment / out of credits
  if (status === 402 || /(insufficient[_\s]*(credit|quota|funds)|payment[_\s]*required|out of credit|billing|low balance)/.test(lower)) {
    return {
      category: 'no-credit', status: status ?? 402, provider, severity: 'quota',
      title: 'Out of credits',
      why: `Your ${provider} account doesn't have enough credit/quota for this call.`,
      fix: 'Top up credits in the provider\'s web UI, or switch to a free model with /model.',
    };
  }

  // Context length overflow
  if (/(context[_\s]*length|maximum context|too many tokens|max[_\s]*tokens.*exceed|reduce.*tokens|input is too long)/.test(lower)) {
    return {
      category: 'context-overflow', status, provider, severity: 'context',
      title: 'Context length exceeded',
      why: 'The conversation + system prompt + tools is bigger than the model\'s context window.',
      fix: 'Run /clear to drop history, /history to check size, or switch to a higher-context model with /model.',
    };
  }

  // Content moderation
  if (/(content[_\s]*filter|content[_\s]*policy|safety[_\s]*(filter|guidelines)|blocked by (moderation|safety)|moderation[_\s]*blocked)/.test(lower)) {
    return {
      category: 'content-filter', status, provider, severity: 'content',
      title: 'Content filtered',
      why: `${provider}'s moderation blocked the request.`,
      fix: 'Rephrase the prompt to avoid the trigger, or try a less-restrictive model with /model.',
    };
  }

  // Provider overloaded
  if ((status === 503 || status === 502) || /(overloaded|temporarily unavailable|capacity|try again later)/.test(lower)) {
    return {
      category: 'provider-overloaded', status: status ?? 503, provider, severity: 'server',
      title: `${provider} overloaded`,
      why: 'The upstream provider is at capacity or experiencing an outage.',
      fix: 'Wait 30s and retry, OR switch to a different model with /model, OR check provider status page.',
    };
  }

  // Network errors
  if (/ECONNREFUSED/i.test(message)) {
    const isLocal = /:11434|:1234|localhost|127\.0\.0\.1/.test(ctx.baseURL || '');
    return {
      category: 'network-refused', provider, severity: 'network',
      title: 'Connection refused',
      why: isLocal
        ? `Nothing's listening at ${ctx.baseURL || 'the local URL'}. Is Ollama/LM Studio running?`
        : `${provider} refused the connection — likely a firewall, proxy, or DNS issue.`,
      fix: isLocal
        ? 'Start the local server (`ollama serve` or open LM Studio), then retry.'
        : 'Check internet/proxy/firewall, then retry. /config to switch provider if persistent.',
    };
  }
  if (/ENOTFOUND/i.test(message)) {
    return {
      category: 'network-dns', provider, severity: 'network',
      title: 'DNS lookup failed',
      why: `Couldn't resolve the hostname for ${ctx.baseURL || provider}.`,
      fix: 'Check your network connection and DNS. Verify the baseURL in /provider.',
    };
  }
  if (/(ETIMEDOUT|timeout|timed out)/i.test(message)) {
    return {
      category: 'network-timeout', provider, severity: 'network',
      title: 'Request timed out',
      why: `${provider} didn't respond in time. Could be slow network or a stuck request.`,
      fix: 'Retry. If persistent, try a different model with /model or check your connection.',
    };
  }
  if (/fetch failed/i.test(message)) {
    return {
      category: 'network-generic', provider, severity: 'network',
      title: 'Network request failed',
      why: 'The HTTP call couldn\'t reach the provider.',
      fix: 'Check connectivity, retry. /provider to inspect the current baseURL.',
    };
  }

  // Bad request — usually malformed parameters
  if (status === 400 || /(bad request|invalid[_\s]*(parameter|argument|request|input))/.test(lower)) {
    return {
      category: 'bad-request', status: status ?? 400, provider, severity: 'unknown',
      title: 'Bad request',
      why: 'The provider rejected the request shape. Often a model/tool param mismatch.',
      fix: 'Try /clear to reset state. If it keeps happening, switch model with /model.',
    };
  }

  // 5xx server errors
  if (status && status >= 500) {
    return {
      category: 'server-error', status, provider, severity: 'server',
      title: `${provider} server error (${status})`,
      why: 'The provider had an internal failure. Not your fault.',
      fix: 'Retry in 30s. If persistent, check the provider\'s status page or switch with /model.',
    };
  }

  // Cryptic short error from the provider (e.g. owl-alpha returning just
  // "ERROR" or "Provider returned error" with no detail). These are almost
  // always a sign the model itself is broken on the provider's end.
  if (lower.length < 80 && /^(error|provider returned error|request failed)\.?$/i.test(lower.trim())) {
    return {
      category: 'unknown', status, provider, severity: 'unknown',
      title: `${provider} returned an empty / cryptic error`,
      why: 'The model returned no detail — usually means the model itself is broken or deprecated on the provider\'s end.',
      fix: `Switch with /model <name>. Common reliable choices: anthropic/claude-sonnet-4, deepseek-chat, google/gemini-2.5-flash. Set /fallback <model> to auto-retry on the next failure.`,
    };
  }

  // Default
  return {
    category: 'unknown', status, provider, severity: 'unknown',
    title: 'Request failed',
    why: 'The provider returned an error not matching any known pattern.',
    fix: 'Try /clear and retry. Report the full message at https://github.com/Crownelius/Crowcoder/issues if it persists.',
  };
}

function severityColor(severity: CategorizedError['severity']): (s: string) => string {
  switch (severity) {
    case 'auth':    return theme.error;
    case 'quota':   return theme.warning;
    case 'model':   return theme.warning;
    case 'context': return theme.cost;     // blue-ish, recoverable
    case 'content': return theme.warning;
    case 'network': return theme.dim;
    case 'server':  return theme.error;
    default:        return theme.error;
  }
}

/**
 * Render an API error with structured diagnosis.
 *
 *   ✗ API error  [429 · OpenRouter · rate-limit-free-per-min]
 *
 *     Free-tier rate limit (20 RPM)
 *
 *     OpenRouter's free models cap at ~20 requests per minute.
 *     → Wait ~60s, OR switch to a paid model with /model, OR add credits.
 *     · https://openrouter.ai/docs/limits
 *
 *     raw: 429 Rate limit exceeded: free-models-per-min.
 */
export function printApiError(message: string, ctx: ApiErrorContext = {}): void {
  const e = categorizeApiError(message, ctx);
  const color = severityColor(e.severity);
  const tagParts: string[] = [];
  if (e.status) tagParts.push(String(e.status));
  tagParts.push(e.provider);
  tagParts.push(e.category);
  const tag = ` [${tagParts.join(' · ')}]`;

  console.log('');
  console.log(theme.error(`  ${sym.error} API error`) + color(tag));
  console.log('');
  console.log(color(`    ${e.title}`));
  console.log('');
  console.log(theme.dim(`    ${e.why}`));
  console.log(theme.warning(`    → ${e.fix}`));
  if (e.docs) console.log(theme.dim(`    · ${e.docs}`));
  // Raw upstream message, dimmed, for forensics. Strip leading/trailing
  // whitespace and any HTTP URL we already surfaced.
  const raw = message.replace(/\s+/g, ' ').trim();
  if (raw && raw.length < 400) {
    console.log('');
    console.log(theme.dim(`    raw: ${raw}`));
  }
  console.log('');
}

// ── Security Display ────────────────────────────────────
export function printSecurityBadge(level: string, threats: string[], blocked: boolean): void {
  console.log(`  ${sym.warn} Security: ${theme.secBadge(level)}`);
  for (const t of threats) {
    console.log(theme.warning(`    ${sym.bullet} ${t}`));
  }
  if (blocked) {
    console.log(chalk.bgHex(palette.magenta).white(`    BLOCKED ${sym.divider} this operation was prevented`));
  }
}

// ── Divider ─────────────────────────────────────────────
export function printDivider(): void {
  console.log(theme.muted('  ' + sym.divider.repeat(38)));
}

// ── Spinner ─────────────────────────────────────────────
export function spinner(text: string): string {
  return theme.dim(`  ${sym.running} ${text}`);
}
