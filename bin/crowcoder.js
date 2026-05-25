#!/usr/bin/env node
// In-process best-effort: override process.emitWarning to drop DEP0040.
// Catches the warning when it's emitted late (after this runs), but does NOT
// catch warnings fired during Node's ESM bootstrap (before any user code).
// For a fully clean stderr, invoke compact-agent via:
//   node --no-deprecation bin/crowcoder.js
//   NODE_OPTIONS=--no-deprecation compact-agent
(() => {
  const orig = process.emitWarning;
  process.emitWarning = function patched(warning, ...rest) {
    let code;
    if (rest[0] && typeof rest[0] === 'object') code = rest[0].code;
    else code = rest[1];
    if (code === 'DEP0040') return;
    return orig.call(this, warning, ...rest);
  };
})();

// ── --debug [level] flag ───────────────────────────────────
// Parse here at the entry point so that the env var is set BEFORE
// any module-level code in dist/index.js reads it. The debug
// instrumentation in src/debug.ts checks $COMPACT_AGENT_DEBUG at
// init time; setting it from argv keeps the implementation in one
// place (env var as single source of truth).
//
// Accepted forms:
//   --debug              → info
//   --debug=trace        → trace
//   --debug trace        → trace
//   --debug=on           → info  (alias)
//   --debug=off          → off
//
// Invalid levels fall back to 'info' with a one-line stderr notice.
(() => {
  const argv = process.argv;
  const VALID = new Set(['off', 'info', 'debug', 'trace', 'on']);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--debug') {
      const next = argv[i + 1];
      if (next && VALID.has(next.toLowerCase())) {
        process.env.COMPACT_AGENT_DEBUG = next.toLowerCase() === 'on' ? 'info' : next.toLowerCase();
        argv.splice(i, 2);
      } else {
        process.env.COMPACT_AGENT_DEBUG = 'info';
        argv.splice(i, 1);
      }
      break;
    }
    if (a && a.startsWith('--debug=')) {
      const lvl = a.slice('--debug='.length).toLowerCase();
      if (VALID.has(lvl)) {
        process.env.COMPACT_AGENT_DEBUG = lvl === 'on' ? 'info' : lvl;
      } else {
        process.stderr.write(`[compact-agent] unknown --debug level "${lvl}"; defaulting to 'info'.\n`);
        process.env.COMPACT_AGENT_DEBUG = 'info';
      }
      argv.splice(i, 1);
      break;
    }
  }
})();

// ── --prompt / --prompt-file (non-interactive single-chain mode) ──
//
// When this CLI is being driven by an external harness (Terminal-Bench,
// CI scripts, etc.) we need a way to:
//   1. accept a prompt without opening the REPL
//   2. run one runQuery chain to completion
//   3. exit with a meaningful code (0 = success, 1 = error)
//
// Two surface forms:
//   --prompt "do the thing"        — inline text
//   --prompt-file path/to/task.txt — read from disk; useful for long
//                                    or multi-line task descriptions
//                                    that would otherwise need careful
//                                    shell quoting.
//
// We export the resolved prompt via COMPACT_AGENT_PROMPT (or
// COMPACT_AGENT_PROMPT_FILE, which the loader reads with fs.readFile).
// src/index.ts branches on these env vars near the top of main() and
// skips the REPL entirely.
//
// A bare `--non-interactive` flag is also accepted as a no-prompt
// signal — useful when paired with a config that already has
// `__crowcoderQueuedInput` set, but mostly an alias for the same path.
// ESM-safe sync FS load. import() is async (returns a promise) and the
// flag parser MUST run synchronously before the dynamic import of
// dist/index.js below. createRequire gives us a real CommonJS require
// inside ESM — same path Node recommends for sync fs in ESM scripts.
const { createRequire } = await import('node:module');
const __require = createRequire(import.meta.url);

(() => {
  const fs = __require('node:fs');
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prompt') {
      const next = argv[i + 1];
      if (typeof next !== 'string') {
        process.stderr.write('[compact-agent] --prompt requires an argument.\n');
        process.exit(2);
      }
      process.env.COMPACT_AGENT_PROMPT = next;
      process.env.COMPACT_AGENT_NON_INTERACTIVE = '1';
      argv.splice(i, 2);
      i--;
      continue;
    }
    if (a && a.startsWith('--prompt=')) {
      process.env.COMPACT_AGENT_PROMPT = a.slice('--prompt='.length);
      process.env.COMPACT_AGENT_NON_INTERACTIVE = '1';
      argv.splice(i, 1);
      i--;
      continue;
    }
    if (a === '--prompt-file') {
      const next = argv[i + 1];
      if (typeof next !== 'string') {
        process.stderr.write('[compact-agent] --prompt-file requires a path.\n');
        process.exit(2);
      }
      try {
        process.env.COMPACT_AGENT_PROMPT = fs.readFileSync(next, 'utf8');
      } catch (err) {
        process.stderr.write(`[compact-agent] could not read --prompt-file: ${err && err.message ? err.message : err}\n`);
        process.exit(2);
      }
      process.env.COMPACT_AGENT_NON_INTERACTIVE = '1';
      argv.splice(i, 2);
      i--;
      continue;
    }
    if (a === '--non-interactive') {
      process.env.COMPACT_AGENT_NON_INTERACTIVE = '1';
      argv.splice(i, 1);
      i--;
      continue;
    }
    // --perm <mode>: override permission mode without touching saved
    // config. Critical for harness runs that want yolo without
    // mutating the user's interactive config file.
    if (a === '--perm') {
      const next = argv[i + 1];
      if (next && /^(ask|auto|yolo)$/.test(next)) {
        process.env.COMPACT_AGENT_PERM_OVERRIDE = next;
        argv.splice(i, 2);
        i--;
        continue;
      }
      process.stderr.write('[compact-agent] --perm requires ask|auto|yolo.\n');
      process.exit(2);
    }
  }
})();

import('../dist/index.js');
