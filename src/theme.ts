/**
 * TUI theme — Crowcoder terminal styling.
 *
 * Inspired by Gemini CLI and Claude Code design patterns:
 *   - Semantic color tokens (not raw hex everywhere)
 *   - Unicode symbols for status indicators
 *   - Clean typography with proper contrast
 *   - CMYK base palette
 */
import chalk from 'chalk';

// ── CMYK Base Palette ───────────────────────────────────
const palette = {
  // Primary CMYK
  cyan:        '#00BCD4',
  cyanLight:   '#4DD0E1',
  cyanDim:     '#00838F',
  magenta:     '#E91E63',
  magentaDim:  '#AD1457',
  yellow:      '#FFEB3B',
  yellowDim:   '#F9A825',
  key:         '#212121',

  // Neutrals (high contrast for dark terminals)
  white:       '#ECEFF1',
  light:       '#CFD8DC',
  mid:         '#B0BEC5',
  gray:        '#90A4AE',
  darkGray:    '#607D8B',
};

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
export const theme = {
  // ── Brand ──
  brand:       chalk.hex(palette.cyan),
  brandBold:   chalk.hex(palette.cyan).bold,
  brandDim:    chalk.hex(palette.cyanDim),

  // ── Semantic Status ──
  success:     chalk.hex('#4DD0E1'),
  warning:     chalk.hex(palette.yellow),
  error:       chalk.hex(palette.magenta),
  info:        chalk.hex(palette.cyanLight),

  // ── Text Hierarchy ──
  primary:     chalk.hex(palette.white),
  secondary:   chalk.hex(palette.mid),
  dim:         chalk.hex(palette.gray),
  muted:       chalk.hex(palette.darkGray),
  bright:      chalk.white.bold,
  italic:      chalk.hex(palette.mid).italic,

  // ── UI Elements ──
  header:      chalk.hex(palette.cyan).bold,
  subheader:   chalk.hex(palette.cyanLight),
  command:     chalk.hex(palette.yellow),
  cost:        chalk.hex(palette.gray),
  link:        chalk.hex(palette.cyanLight).underline,

  // ── Prompt & Messages ──
  prompt:      chalk.hex(palette.cyan).bold,
  assistant:   chalk.hex(palette.cyanLight).bold,
  user:        chalk.hex(palette.white),

  // ── Tool Calls ──
  toolName:    chalk.hex(palette.cyan).bold,
  toolArgs:    chalk.hex(palette.mid),
  toolStatus:  chalk.hex('#4DD0E1'),
  toolError:   chalk.hex(palette.magenta),
  toolTime:    chalk.hex(palette.gray),

  // ── Thinking ──
  thinkBorder: chalk.hex(palette.darkGray),
  thinkText:   chalk.hex(palette.gray).italic,
  thinkLabel:  chalk.hex(palette.darkGray).italic,

  // ── Mode Badges ──
  modeBadge: (mode: string): string => {
    const colors: Record<string, typeof chalk> = {
      dev:       chalk.bgHex(palette.cyan).hex(palette.key),
      review:    chalk.bgHex(palette.cyanDim).hex(palette.white),
      tdd:       chalk.bgHex(palette.magenta).hex(palette.white),
      research:  chalk.bgHex(palette.yellow).hex(palette.key),
      plan:      chalk.bgHex(palette.yellowDim).hex(palette.key),
      debug:     chalk.bgHex(palette.magentaDim).hex(palette.white),
      architect: chalk.bgHex(palette.cyanLight).hex(palette.key),
    };
    return (colors[mode] || chalk.bgGray.white)(` ${mode.toUpperCase()} `);
  },

  // ── Security Badges ──
  secBadge: (level: string): string => {
    const colors: Record<string, typeof chalk> = {
      critical: chalk.bgHex(palette.magenta).white.bold,
      high:     chalk.hex(palette.magenta).bold,
      medium:   chalk.hex(palette.yellow),
      low:      chalk.hex(palette.gray),
      safe:     chalk.hex(palette.cyan),
    };
    return (colors[level] || chalk.white)(level.toUpperCase());
  },
};

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

// ── Splash Screen (for full mode — Compact Agent emblem) ──
// Half-scale 2x2->1 downsample of the original emblem. 18 lines × ~35 cols
// fits any terminal ≥45 cols wide and ≥24 rows tall.
const COMPACT_AGENT_SPLASH: readonly string[] = [
  '         @@@@@@@@  @@@@@@@@',
  '       @@@@    @@@@@@    @@@@@',
  '     @@@@      @@@@@@      @@@@',
  '    @@@@@@    @@@  @@@@   @@@@@@',
  '  @@@@   @@@@@@ @@@@ @@@@@@@   @@@',
  '  @@@     @@@@  @@@@@ @@@@      @@',
  '  @@@   @@@@@ @@@@ @@@  @@@@    @@',
  '  @@@  @@@  @@@@    @@@@  @@@@ @@@',
  '   @@@@@  @@@@        @@@@@ @@@@@',
  '   @@@@@  @@@@        @@@@@ @@@@@',
  '  @@@  @@@  @@@@    @@@@  @@@  @@@',
  '  @@@   @@@@@ @@@@@@@@ @@@@@    @@',
  '  @@@     @@@@  @@@@  @@@@@     @@',
  '  @@@@  @@@@@@@  @@@ @@@@@@@   @@@',
  '    @@@@@@    @@@  @@@    @@@@@@',
  '     @@@@      @@@@@@      @@@@',
  '       @@@@@@@@@@@@@@@@@@@@@@',
  '         @@@@@@@@  @@@@@@@@',
];

export function printSplash(): void {
  const c = chalk.hex(palette.cyan);
  console.log('');
  for (const line of COMPACT_AGENT_SPLASH) console.log(c(line.replace(/\s+$/, '')));
  console.log('');
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
  // Prefix each newline within the chunk so multi-line thoughts stay aligned.
  const prefixed = text.replace(/\n(?!$)/g, '\n' + theme.thinkBorder('  │ '));
  process.stdout.write(theme.thinkBorder('  │ ') + theme.thinkText(prefixed));
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
// Distinguish actionable errors (404/401/429) from generic failures.
// Surface the URL if the upstream message has one; suggest the fix.
export function printApiError(message: string): void {
  console.log('');
  console.log(theme.error(`  ${sym.error} API error`));
  // Indent body, wrap at ~76 chars
  for (const line of message.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    console.log(theme.dim('    ' + trimmed));
  }
  const lower = message.toLowerCase();
  let hint = '';
  if (lower.includes('404') || lower.includes('no longer') || lower.includes('not found')) {
    hint = 'Model unavailable. Switch with /model <name> or /config to pick a new one.';
  } else if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    hint = 'Auth failed. Re-set your key with /config.';
  } else if (lower.includes('429') || lower.includes('rate limit')) {
    hint = 'Rate-limited. Wait a moment or switch to a different model with /model.';
  } else if (lower.includes('econn') || lower.includes('etimedout') || lower.includes('network')) {
    hint = 'Network issue. Check connectivity, then retry.';
  }
  if (hint) {
    console.log(theme.warning(`    → ${hint}`));
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
