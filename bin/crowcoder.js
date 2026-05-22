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

import('../dist/index.js');
