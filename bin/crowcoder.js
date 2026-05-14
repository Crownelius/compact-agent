#!/usr/bin/env node
// In-process best-effort: override process.emitWarning to drop DEP0040.
// Catches the warning when it's emitted late (after this runs), but does NOT
// catch warnings fired during Node's ESM bootstrap (before any user code).
// For a fully clean stderr, invoke Crowcoder via:
//   node --no-deprecation bin/crowcoder.js
//   NODE_OPTIONS=--no-deprecation crowcoder
//   oag chat                                # already passes --no-deprecation
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
import('../dist/index.js');
