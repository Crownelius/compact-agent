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
