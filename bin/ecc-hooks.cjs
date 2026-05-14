#!/usr/bin/env node
/**
 * ECC-native hook dispatcher for Crowcoder.
 *
 * Reads Crowcoder's hook env vars (CROWCODER_EVENT, CROWCODER_TOOL,
 * CROWCODER_TOOL_INPUT, CROWCODER_TOOL_OUTPUT) and runs a single named check.
 *
 * Exit codes:
 *   0  — allow (PreToolUse) or success (PostToolUse)
 *   2  — block (PreToolUse only; non-zero on a non-blocking hook is just logged)
 *
 * Usage:
 *   node ecc-hooks.cjs <check-name> [__ecc__]
 *
 * The trailing __ecc__ tag is used by the installer to identify ECC-managed
 * hook entries so /ecc-install can refresh them without touching user hooks.
 */
'use strict';

const checkName = process.argv[2] || '';

let toolInput = {};
try {
  toolInput = JSON.parse(process.env.CROWCODER_TOOL_INPUT || '{}');
} catch { /* ignore — leave as {} */ }

const tool = process.env.CROWCODER_TOOL || '';
const cwd = process.env.CROWCODER_CWD || process.cwd();

// ── Helpers ─────────────────────────────────────────────
function bashCommand() {
  return String(toolInput.command || toolInput.cmd || '');
}

function filePath() {
  return String(toolInput.path || toolInput.file_path || toolInput.file || '');
}

function fileContent() {
  return String(
    toolInput.content ||
    toolInput.new_string ||
    toolInput.text ||
    '',
  );
}

function block(message) {
  process.stderr.write(`[ECC] BLOCKED: ${message}\n`);
  process.exit(2);
}

function warn(message) {
  process.stderr.write(`[ECC] ${message}\n`);
  process.exit(0);
}

function ok() {
  process.exit(0);
}

// ── Checks ──────────────────────────────────────────────
const checks = {
  /**
   * Block `git commit --no-verify` and friends — these skip pre-commit hooks.
   */
  'block-no-verify': () => {
    const cmd = bashCommand();
    if (!/\bgit\s+/.test(cmd)) return ok();
    if (/(^|\s)--no-verify(\s|$)/.test(cmd)) {
      return block('`--no-verify` skips git hooks — fix the failure instead.');
    }
    if (/(^|\s)--no-gpg-sign(\s|$)/.test(cmd)) {
      return block('`--no-gpg-sign` bypasses signing — ask the user first.');
    }
    return ok();
  },

  /**
   * Remind the user to run dev servers under tmux (non-blocking, POSIX only).
   */
  'dev-server-tmux': () => {
    if (process.platform === 'win32') return ok();
    if (process.env.TMUX) return ok();
    const cmd = bashCommand();
    const devPattern = /\b(npm\s+run\s+dev|pnpm(?:\s+run)?\s+dev|yarn\s+dev|bun\s+run\s+dev|next\s+dev|vite(?:\s+dev)?)\b/;
    const tmuxLauncher = /^\s*tmux\s+(new|new-session|new-window|split-window)\b/;
    if (devPattern.test(cmd) && !tmuxLauncher.test(cmd)) {
      return warn('Consider running dev servers in tmux for log access: `tmux new-session -d -s dev "<cmd>"`');
    }
    return ok();
  },

  /**
   * Warn (don't block) when reading typically-sensitive files.
   */
  'sensitive-file': () => {
    const path = filePath();
    if (!path) return ok();
    if (/\.(env|key|pem|p12|pfx)$/i.test(path) || /\b(credentials|secrets|id_rsa)\b/i.test(path)) {
      return warn(`Reading sensitive file: ${path}`);
    }
    return ok();
  },

  /**
   * Warn when a file edit/write leaves console.log() / print() statements.
   * Looks at the new_string / content payload only — doesn't read disk.
   */
  'console-log-warn': () => {
    const path = filePath();
    const content = fileContent();
    if (!content) return ok();
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path)) return ok();
    const noisy = /\bconsole\.(log|debug|info|warn|error)\s*\(/g;
    const matches = content.match(noisy);
    if (matches && matches.length > 0) {
      return warn(`${matches.length} console statement(s) in ${path}`);
    }
    return ok();
  },
};

// ── Dispatch ────────────────────────────────────────────
const fn = checks[checkName];
if (!fn) {
  // Unknown check — silently pass so an upgrade that removes a check doesn't
  // break old hooks.json entries.
  process.exit(0);
}

try {
  fn();
} catch (err) {
  // Hook bugs must not break the user's flow.
  process.stderr.write(`[ECC] hook ${checkName} error: ${err && err.message}\n`);
  process.exit(0);
}
