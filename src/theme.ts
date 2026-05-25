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

    // Thinking display uses the brand accent (same as the banner
    // title) so the "currently happening" line reads as the most
    // recent action. Per user spec — no animation, just static
    // brand-cyan styling on the thinking section. Final assistant
    // text streams in terminal default (white) for contrast.
    thinkBorder: chalk.hex(p.cyanDim),
    thinkText:   chalk.hex(p.cyan).italic,
    thinkLabel:  chalk.hex(p.cyan),

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
//
// Layout (per the user-supplied mock):
//
//   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀         ← heavy top bar
//   ◆  C O M P A C T   A G E N T                    ← brand line
//        A dense, feature-rich AI coding agent      ← tagline
//                                                   ← blank
//     ────────────────────────────────────────      ← thin divider
//     Provider  X  │  Model  Y                      ← provider/model row
//     Mode      M  │  Perms  P                      ← mode/perms row
//     Session   abc                                ◆ ← session row, right-aligned brand mark
//                                                   ← blank
//   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀         ← heavy bottom bar
//
// Design notes:
//   - The ▀ char (U+2580 UPPER HALF BLOCK) renders as a solid bar at
//     the top of the row, giving more visual weight than the previous
//     ─ thin rule. Side-by-side it forms a "framed window" feel.
//   - Brand line has NO leading indent — it sits flush against the
//     top bar's left edge to read as a header rather than indented body.
//   - Right-aligned ◆ on the Session row mirrors the brand mark on the
//     left of the title — a visual "bookend" within the frame.
//   - Tools list + /help hint removed: they bloated the banner without
//     adding signal (users find tools via `/tools`, help via `/help`).
//   - Width: 39 cells of border. Wide enough to fit the longest sane
//     content row (Session prefix + 22-char session id + right-aligned
//     ◆) in a standard 80-col terminal, narrow enough to look like a
//     widget rather than spanning the whole screen.
export function printBanner(
  provider: string,
  model: string,
  mode: string,
  permissionMode: string,
  sessionId: string,
  _toolNames: string[], // kept in signature for backward compat; intentionally unused
): void {
  void _toolNames;
  const b = theme.brandBold;
  const d = theme.dim;
  const s = theme.secondary;
  const w = theme.bright;
  const brand = theme.brand;

  // Width budget: the heavy bars are 39 cells. The inner content
  // is indented 2 cells so the right edge "feels" aligned with the
  // bar. Compute the inner width for right-aligning the brand mark
  // on the session row.
  const BAR_WIDTH = 39;
  const heavyBar = '▀'.repeat(BAR_WIDTH);

  // ── render ──
  console.log('');
  console.log(brand(heavyBar));
  console.log(b(`${sym.crow}  C O M P A C T   A G E N T`));
  console.log(d('     A dense, feature-rich AI coding agent'));
  console.log('');
  console.log(d('  ' + sym.divider.repeat(BAR_WIDTH - 2)));
  console.log(s('  Provider  ') + w(provider) + s('  ') + d('│') + s('  Model  ') + w(model));
  console.log(s('  Mode      ') + theme.modeBadge(mode) + s('     ') + d('│') + s('  Perms  ') + w(permissionMode));
  // Session row: prefix + id, then padded to the right edge with a
  // brand-mark bookend. Strip ANSI from the prefix string for the
  // visible-length math (chalk wraps in escape codes which inflate
  // .length without contributing visible cells).
  const sessText = sessionId.slice(0, 12);
  const sessLeft = s('  Session   ') + d(sessText);
  const sessLeftVisible = '  Session   ' + sessText;     // for length math only
  const padding = Math.max(1, BAR_WIDTH - sessLeftVisible.length - 1);
  console.log(sessLeft + ' '.repeat(padding) + brand(sym.crow));
  console.log('');
  console.log(brand(heavyBar));
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
//
// Two-phase render: "run" paints a boot animation in-place then
// starts a Braille spinner that keeps ticking while the tool executes;
// "result" stops the spinner and animates a short settle into the
// final ✓/✗ + elapsed + preview line.
//
// Layout footprint: ONE LINE per tool call. The run line is in-place
// (no \n) while the tool is running; the result phase paints over the
// SAME row and only THEN commits with a newline. Compared to the
// previous two-line render (run on row N, result on row N+1) this
// halves the vertical footprint and the in-place rewrite reads as
// "the tool is morphing from running → done" rather than "two
// distinct events".
//
// Module-level _toolSpinner tracks the active spinner across the
// run→result handoff. Tools run sequentially in query.ts so single-
// track state is fine.
let _toolSpinner: import('./animations.js').Spinner | null = null;

export async function printToolRun(name: string, args: string): Promise<void> {
  const compactArgs = args.replace(/\s+/g, ' ').trim();
  const display = compactArgs.length > 80 ? compactArgs.slice(0, 77) + '...' : compactArgs;
  const argsSuffix = display ? theme.toolArgs(` ${display}`) : '';

  // Lazy-import animations so this module stays loadable from sync
  // contexts (CLI startup) that might not need animation infra.
  const anims = await import('./animations.js');

  // Boot animation — 3 frames of "powering up" before the persistent
  // spinner takes over. Total ~150ms; barely perceptible but reads as
  // intentional motion rather than a static "tool name appeared".
  const bootFrames = [
    `  ${theme.dim(anims.POWER_UP[0])}`,
    `  ${theme.dim(anims.POWER_UP[1])} ${theme.toolName(name)}`,
    `  ${theme.toolStatus(anims.POWER_UP[2])} ${theme.toolName(name)}${argsSuffix}`,
  ];
  await anims.playFrames(bootFrames, 50);

  // Persistent spinner. {S} placeholder gets each rotating Braille
  // frame swapped in. The line stays in-place (no \n) so the result
  // phase can overwrite it.
  const prefix = `  ${theme.toolStatus('{S}')} ${theme.toolName(name)}${argsSuffix}`;
  _toolSpinner = anims.startSpinner(prefix);
}

export async function printToolResult(success: boolean, elapsed: number, output: string): Promise<void> {
  const anims = await import('./animations.js');

  // Tear down the run-phase spinner. We don't commit yet — the
  // settle animation will overwrite the line and then commit.
  if (_toolSpinner) {
    _toolSpinner.stop();
    _toolSpinner = null;
  }

  const icon = success ? theme.toolStatus(sym.success) : theme.toolError(sym.error);
  const time = theme.toolTime(`${(elapsed / 1000).toFixed(1)}s`);
  const firstLine = (output.split('\n').find((l) => l.trim().length > 0) || '').trim();
  const preview = firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
  const tail = output.length > preview.length + 10
    ? theme.dim(`  +${output.length - preview.length}b`)
    : '';
  const finalLine = `  ${icon} ${time}  ${theme.dim(preview)}${tail}`;

  // Settle animation — a short "morphing" sequence from the spinner
  // glyph through arc states into the final icon. Reads as "the
  // spinner settled into a result" rather than "the spinner
  // disappeared and a new icon appeared".
  const arc = success ? anims.ARC_SPINNER : ['◐', '◑']; // shorter for error path
  const settleFrames = [
    `  ${theme.dim(arc[0])}`,
    `  ${theme.dim(arc[1 % arc.length])}  ${theme.dim(time)}`,
    finalLine,
  ];
  await anims.playFrames(settleFrames, 40);
  anims.commitFrame();
}

// ── Thinking Display ────────────────────────────────────
// Live streaming with a left border during the thinking phase, then
// collapses to a one-liner "tab" when the section closes. The full
// buffered text stays available via expandLastThinking() (wired to
// /think) so the user can re-expand any time after collapse.
//
// Why collapse: long reasoning traces (DeepSeek-R1, Claude extended
// thinking, o1) can run 100+ lines per turn. Leaving them sprawled
// in the transcript pushes the actual answer off-screen and makes
// the conversation hard to scan. Collapsing to a single line
// preserves the "I saw it think" affordance while keeping the
// transcript scannable.
//
// Module-level state is fine here because thinking is single-track —
// the model emits at most one thinking section at a time, and
// printThinkingOpen/Close are called from a single async loop in
// query.ts. If we ever stream multiple concurrent reasoning streams
// (multi-agent swarms etc), refactor to a returned handle.
let _thinkingBuffer = '';
let _thinkingStartMs = 0;
let _thinkingActive = false;

// Live spinner state. While thinking text streams below the header,
// a setInterval ticks every ~90ms and repaints the glyph on the
// header row by:
//   1. Saving the cursor (mid-stream position somewhere below)
//   2. Cursor-up by _thinkingRowsBelow lines + \r to col 0
//   3. Writing the header line with the next Braille frame
//   4. Restoring cursor to the streaming position
//
// _thinkingRowsBelow is incremented in printThinkingText proportional
// to newlines added — that's the offset from header row to current
// stream cursor. When the header scrolls out of the addressable area
// (rows-below >= termRows - 3) the spinner stops itself: cursor-up
// past the visible top doesn't land anywhere useful, and we'd waste
// CPU repainting offscreen.
let _thinkingSpinnerInterval: NodeJS.Timeout | null = null;
let _thinkingRowsBelow = 0;
let _thinkingSpinnerFrame = 0;
const _THINKING_SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function _tickThinkingSpinner(): void {
  const frame = _THINKING_SPIN[_thinkingSpinnerFrame % _THINKING_SPIN.length];
  _thinkingSpinnerFrame++;
  const headerLine =
    theme.thinkBorder('  │ ') + theme.thinkLabel(`${frame} thinking`);

  if (_thinkingRowsBelow === 0) {
    // Still on the header row (no text streamed yet) — just \r and
    // repaint. No cursor save/restore needed.
    process.stdout.write('\r' + headerLine);
    return;
  }

  const termRows = process.stdout.rows || 24;
  if (_thinkingRowsBelow > termRows - 3) {
    // Header scrolled out of the addressable area — stop ticking.
    if (_thinkingSpinnerInterval) {
      clearInterval(_thinkingSpinnerInterval);
      _thinkingSpinnerInterval = null;
    }
    return;
  }

  // Save current cursor, jump up to header row, repaint, restore.
  // Using DECSC/DECRC here is safe-ish because no scroll happens
  // between save and restore (no writes that push content past the
  // viewport bottom) — just one set of writes targeting an earlier
  // row in the visible buffer.
  process.stdout.write('\x1b7');
  process.stdout.write(`\x1b[${_thinkingRowsBelow}A\r`);
  process.stdout.write(headerLine);
  process.stdout.write('\x1b8');
}

function _startThinkingSpinner(): void {
  if (_thinkingSpinnerInterval) return;
  _thinkingRowsBelow = 0;
  _thinkingSpinnerFrame = 0;
  // Only spin in a TTY where ANSI codes work. In CI / piped output we
  // leave the header static — the spinner ticks would just emit
  // garbage control sequences.
  if (!process.stdout.isTTY) return;
  _thinkingSpinnerInterval = setInterval(_tickThinkingSpinner, 90);
  if (typeof _thinkingSpinnerInterval.unref === 'function') {
    _thinkingSpinnerInterval.unref();
  }
}

function _stopThinkingSpinner(): void {
  if (_thinkingSpinnerInterval) {
    clearInterval(_thinkingSpinnerInterval);
    _thinkingSpinnerInterval = null;
  }
}

export async function printThinkingOpen(): Promise<void> {
  _thinkingBuffer = '';
  _thinkingStartMs = Date.now();
  _thinkingActive = true;
  // Static header — no boot animation, no live spinner. The whole
  // thinking section sits in brand-cyan so the user can scan it as
  // "currently happening" without flicker. Spec from user: "take
  // away the thinking animation and just color the most recent
  // action with the title color." The header settles immediately.
  console.log(theme.thinkBorder('  │ ') + theme.thinkLabel(`${sym.thinking} thinking`));
}

export function printThinkingText(text: string): void {
  _thinkingBuffer += text;
  // Add the border prefix only after newlines within the chunk — NOT at
  // the start. printThinkingOpen() already wrote the first-line prefix.
  // Adding `'  │ '` to every chunk produced "| word | word | word" output
  // when the model streamed thinking token-by-token, because each token
  // arrived as its own writeStream call and each got a fresh prefix.
  const prefixed = text.replace(/\n(?!$)/g, '\n' + theme.thinkBorder('  │ '));
  process.stdout.write(theme.thinkText(prefixed));
  // Track newline count so the spinner can address the header row
  // via cursor-up from the current stream position.
  const newlines = (text.match(/\n/g) || []).length;
  _thinkingRowsBelow += newlines;
}

/**
 * Close the thinking section.
 *
 * By default, COLLAPSES the streamed content into a one-liner — uses
 * ANSI cursor-up + clear-to-end-of-screen to erase the panel we just
 * printed, then writes a compact "▶ thinking · N tokens · /think to
 * expand" footer in its place. The full buffer is stashed on
 * globalThis so /think can re-print it later.
 *
 * Pass `{ collapse: false }` to skip the collapse and leave the
 * expanded panel on screen (used by expandLastThinking()).
 *
 * Safety: if the thinking output is taller than the terminal can
 * reliably address with cursor-up (more rows than the terminal has,
 * or terminal-width-wrapped lines we can't count precisely), we skip
 * the collapse and just print the footer below. The user still gets
 * the count + elapsed; the panel stays where it is.
 */
export async function printThinkingClose(opts: { collapse?: boolean } = {}): Promise<void> {
  // Spinner is no longer started on open, but call the stop helper
  // anyway so any in-flight tick from a previous version of the
  // module (rare during hot-reload) is cleared.
  _stopThinkingSpinner();
  process.stdout.write('\n');
  if (!_thinkingActive) return;
  _thinkingActive = false;

  // Stash for /think to re-expand on demand. Even when we don't
  // collapse, this lets the user re-read the thinking later via the
  // slash command without scrolling back.
  (globalThis as { __crowcoderLastThinking?: string }).__crowcoderLastThinking = _thinkingBuffer;

  const collapse = opts.collapse !== false;
  if (!collapse || _thinkingBuffer.length === 0) return;

  // Approximate the physical row count of what we just printed.
  // Layout: 1 row for the open header + (rows per text line) + 1 row
  // for the close \n we just wrote. Each "text line" (segment between
  // \n in the buffer) wraps to ceil((4 + line.length) / termCols)
  // physical rows because the border prefix is 4 visible chars.
  const termCols = process.stdout.columns || 80;
  const termRows = process.stdout.rows || 24;
  const lines = _thinkingBuffer.split('\n');
  let approxRows = 1; // open header
  for (const ln of lines) {
    approxRows += Math.max(1, Math.ceil((4 + ln.length) / termCols));
  }
  approxRows += 1; // trailing close \n

  const tokens = _approxTokens(_thinkingBuffer);
  const elapsed = _thinkingElapsed();

  // Bail on collapse if the panel ran taller than the terminal can
  // address — cursor-up past the top doesn't go anywhere useful and
  // we'd corrupt the surrounding output. Leave the panel as-is and
  // just print the footer (still buffered for /think).
  if (approxRows >= termRows - 2) {
    console.log(
      theme.thinkBorder('  ▶ ') +
      theme.thinkLabel('thinking') +
      theme.dim(` · ${tokens}t · ${elapsed}s · /think to re-read`)
    );
    return;
  }

  // Static collapse — no fold-down animation. Cursor-up to the open
  // header row, clear from there to end of screen, write the
  // collapsed one-liner footer. Matches the "no thinking animation"
  // spec while preserving the collapse-to-summary behavior.
  process.stdout.write(`\r\x1b[${approxRows}A\x1b[J`);
  console.log(
    theme.thinkBorder('  ▶ ') +
    theme.thinkLabel('thinking') +
    theme.dim(` · ${tokens}t · ${elapsed}s · /think to expand`)
  );
}

function _approxTokens(text: string): number {
  // ~4 chars per token is the common heuristic across English-heavy
  // tokenizers. Good enough for a one-liner footer; the actual count
  // shows up in /usage from the API's reported usage.
  return Math.max(1, Math.round(text.length / 4));
}

function _thinkingElapsed(): string {
  return ((Date.now() - _thinkingStartMs) / 1000).toFixed(1);
}

/**
 * Re-print the most recent thinking block (the one /think collapses)
 * in expanded form. Returns false if there's no thinking buffered for
 * this session yet — the slash command uses that to print a "no
 * thinking captured yet" message instead.
 */
export function expandLastThinking(): boolean {
  const text = (globalThis as { __crowcoderLastThinking?: string }).__crowcoderLastThinking;
  if (!text) return false;
  // Pass collapse: false so the printThinkingClose at the end doesn't
  // try to ANSI-up + clear the expansion we just rendered.
  console.log(theme.thinkBorder('  │ ') + theme.thinkLabel(`${sym.thinking} thinking (expanded · most recent)`));
  const prefixed = text.replace(/\n(?!$)/g, '\n' + theme.thinkBorder('  │ '));
  process.stdout.write(theme.thinkText(prefixed));
  if (!text.endsWith('\n')) process.stdout.write('\n');
  return true;
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
      fix: 'Re-set your key with /config. Check ~/.compact-agent/config.json if /config doesn\'t catch it.',
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
    fix: 'Try /clear and retry. Report the full message at https://github.com/Crownelius/compact-agent/issues if it persists.',
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
