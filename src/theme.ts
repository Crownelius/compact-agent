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
  console.log(b(`  ${sym.crow}  C R O W C O D E R`));
  console.log(d('     AI Coding Assistant'));
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

// ── Splash Screen (for full mode — feather above the banner) ──
export function printSplash(): void {
  const c  = chalk.hex(palette.cyan);
  const cl = chalk.hex(palette.cyanLight);
  const cd = chalk.hex(palette.cyanDim);
  const d  = chalk.hex(palette.darkGray);
  const m  = chalk.hex(palette.mid);

  console.log('');
  console.log('                          ' + cl('**'));
  console.log('                        ' + cl('****'));
  console.log('                    ' + c('*********'));
  console.log('               ' + c('**************'));
  console.log('          ' + c('*******************'));
  console.log('       ' + cd('**********************'));
  console.log('      ' + cd('*********************'));
  console.log('     ' + cd('********************'));
  console.log('     ' + cd('*******************'));
  console.log('    ' + d('***** **************'));
  console.log('     ' + d('*******************'));
  console.log('  ' + d('** ********') + ' ' + d('**********'));
  console.log('   ' + d('*********') + ' ' + d('********'));
  console.log('    ' + d('*******') + ' ' + d('******'));
  console.log('     ' + d('*** ** ****'));
  console.log('     ' + d('** **'));
  console.log('    ' + d('** **'));
  console.log('   ' + d('******'));
  console.log('   ' + d('****'));
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
export function printToolRun(name: string, args: string): void {
  console.log(
    theme.toolName(`  ${sym.running} ${name}`) +
    theme.toolArgs(` ${args}`),
  );
}

export function printToolResult(success: boolean, elapsed: number, output: string): void {
  const icon = success ? theme.toolStatus(sym.success) : theme.toolError(sym.error);
  const time = theme.toolTime(`(${elapsed}ms)`);
  const preview = output.length > 200
    ? theme.dim(output.slice(0, 150) + '...')
    : theme.dim(output);
  console.log(`  ${icon} ${time} ${preview}`);
}

// ── Thinking Display ────────────────────────────────────
export function printThinkingOpen(): void {
  console.log('');
  console.log(theme.thinkBorder('  │ ') + theme.thinkLabel(`${sym.thinking} Thinking...`));
}

export function printThinkingText(text: string): void {
  // Prefix each line with the left border
  process.stdout.write(theme.thinkBorder('  │ ') + theme.thinkText(text));
}

export function printThinkingClose(): void {
  console.log('');
  console.log(theme.thinkBorder('  │'));
}

// ── Cost Display ────────────────────────────────────────
export function printCost(prompt: number, completion: number, cost: number, warning?: string): void {
  const p = prompt > 999 ? `${(prompt / 1000).toFixed(1)}K` : String(prompt);
  const c = completion > 999 ? `${(completion / 1000).toFixed(1)}K` : String(completion);
  process.stdout.write(
    theme.cost(`\n  ${p}${sym.arrow}${c} tokens  $${cost.toFixed(4)}`),
  );
  if (warning) {
    console.log(theme.warning(`\n  ${sym.warn} ${warning}`));
  }
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
