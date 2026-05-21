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
   * Block edits to linter/formatter config files. Without this, an agent
   * that hits a lint error tends to "fix" it by relaxing the config rule
   * instead of fixing the actual code. Ported from upstream ECC
   * scripts/hooks/config-protection.js (140 LOC condensed to ~40).
   *
   * The full upstream list includes 50+ patterns covering ESLint v8/v9,
   * Prettier (all formats), TS/Babel/Webpack/Vite/Rollup configs,
   * Python (ruff, pyproject.toml, .flake8, setup.cfg), Go (golangci),
   * Ruby (RuboCop), and .editorconfig. We match by basename so paths
   * like `apps/foo/.eslintrc.cjs` are still blocked.
   */
  'config-protection': () => {
    const fp = filePath();
    if (!fp) return ok();
    const base = require('path').basename(fp);
    const protectedFiles = new Set([
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
      '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js',
      'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
      'eslint.config.mts', 'eslint.config.cts',
      '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json',
      '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.toml',
      'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs',
      '.editorconfig', 'tsconfig.json', 'tsconfig.base.json',
      'tsconfig.build.json', 'jsconfig.json',
      '.ruff.toml', 'ruff.toml', 'pyproject.toml', 'setup.cfg', '.flake8',
      'mypy.ini', 'pytest.ini',
      '.golangci.yml', '.golangci.yaml', '.golangci.toml',
      '.rubocop.yml', '.rubocop.yaml',
      '.swiftlint.yml', '.clang-format', '.clang-tidy',
    ]);
    if (protectedFiles.has(base)) {
      return block(
        `${base} is a linter/formatter config — modifying it to silence ` +
        `errors instead of fixing the code is anti-pattern. Fix the source ` +
        `file the lint/typecheck error points to. If the rule itself is ` +
        `genuinely wrong, ask the user before changing the config.`,
      );
    }
    return ok();
  },

  /**
   * Simplified GateGuard — force investigation before first Edit/Write per
   * file in this session. Upstream's full implementation (878 LOC) tracks
   * elaborate session state, destructive-bash detection, and quote-aware
   * SQL pattern matching. We port the highest-leverage mechanism: a
   * per-session per-file flag that demands investigation on first touch.
   *
   * State lives at ~/.crowcoder/state/gateguard/<sessionId>.json — a
   * JSON array of paths already touched. After the first touch of a file,
   * subsequent Edit/Write calls pass through normally.
   *
   * Auto-cleanup: state files older than 24h are deleted on next run.
   *
   * Upstream credit: github.com/zunoworks/gateguard (the underlying idea).
   */
  'gateguard': () => {
    const fs = require('fs');
    const pathMod = require('path');
    const os = require('os');
    const targetPath = filePath();
    if (!targetPath) return ok();

    const sessionId = process.env.CROWCODER_SESSION_ID || 'unknown';
    const stateDir = pathMod.join(os.homedir(), '.crowcoder', 'state', 'gateguard');
    const stateFile = pathMod.join(stateDir, `${sessionId}.json`);

    // GC: drop any state files older than 24h. Best-effort, never throws.
    try {
      if (fs.existsSync(stateDir)) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const name of fs.readdirSync(stateDir)) {
          const p = pathMod.join(stateDir, name);
          try {
            const s = fs.statSync(p);
            if (s.mtimeMs < cutoff) fs.unlinkSync(p);
          } catch { /* noop */ }
        }
      }
    } catch { /* noop */ }

    let touched = new Set();
    try {
      if (fs.existsSync(stateFile)) {
        const raw = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        if (Array.isArray(raw)) touched = new Set(raw);
      }
    } catch { /* corrupt state: treat as empty */ }

    if (touched.has(targetPath)) return ok();   // already investigated this session

    // First touch — record + block with investigation instruction.
    touched.add(targetPath);
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify([...touched]), 'utf-8');
    } catch { /* if we can't persist, still block this one time */ }

    return block(
      `First Edit/Write to ${targetPath} this session. Before proceeding, ` +
      `investigate: (1) Read the file to understand its current contents. ` +
      `(2) Grep for importers / callers / refs so the change doesn't break ` +
      `consumers. (3) If it's a schema/type, check existing data usage. ` +
      `After investigating, retry the edit — GateGuard tracks per-file and ` +
      `will let the retry through. Set CROWCODER_GATEGUARD=off to disable.`,
    );
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
