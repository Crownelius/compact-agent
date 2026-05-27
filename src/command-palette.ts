/**
 * Command palette catalog — the slash commands exposed via the
 * inline `/` command selector. Hand-curated rather than auto-
 * extracted from handleSlashCommand's switch, because:
 *
 *   1. The switch contains alias arms (/branch → /fork, /quit → /exit,
 *      etc.) that would clutter a UI listing.
 *   2. Some commands are internal sentinels (__DICTATE__, __SWARM__)
 *      that should never appear to users.
 *   3. Curating gives us a tight description column for each entry —
 *      the picker shows label + hint + description, and a hand-
 *      written one-liner is more scannable than a parsed comment.
 *
 * Categories mirror /help's grouping so muscle memory transfers.
 */

export interface CommandEntry {
  command: string;     // e.g. "/model" — what we inject into the prompt on selection
  description: string; // one-line scannable description
  category: string;
}

export const COMMAND_CATALOG: CommandEntry[] = [
  // ── General ──
  { command: '/help', description: 'Show the full command reference', category: 'General' },
  { command: '/clear', description: 'Reset the conversation (also resets side-channel state)', category: 'General' },
  { command: '/back', description: 'Rewind to before the nth most-recent user turn', category: 'General' },
  { command: '/fork', description: 'Branch the current conversation; previous still resumable', category: 'General' },
  { command: '/btw', description: 'Side question that doesn\'t pollute the main thread', category: 'General' },
  { command: '/editor', description: 'Open $EDITOR for a multi-line prompt', category: 'General' },
  { command: '/history', description: 'Message count + token estimate', category: 'General' },
  { command: '/export', description: 'Export conversation (md/json/txt)', category: 'General' },
  { command: '/walkthrough', description: 'Agent-led tour of ventipus', category: 'General' },
  { command: '/config', description: 'Reconfigure provider / model / key (re-runs the setup wizard)', category: 'General' },
  { command: '/theme', description: 'Change display mode (full/compact/minimal)', category: 'General' },
  { command: '/palette', description: 'Switch color palette (run /palettes to list)', category: 'General' },
  { command: '/palettes', description: 'List the 12 Coolors-based color palettes', category: 'General' },

  // ── Model & Provider ──
  { command: '/model', description: 'Switch model (no arg → interactive picker on OpenRouter)', category: 'Model' },
  { command: '/models', description: 'List available models for the current provider', category: 'Model' },
  { command: '/fallback', description: 'Set/show the model auto-retried on cryptic errors', category: 'Model' },
  { command: '/openrouter-free', description: 'Switch to OpenRouter free-tier router', category: 'Model' },
  { command: '/provider', description: 'Show provider info (URL, masked key)', category: 'Model' },
  { command: '/keys', description: 'Multi-key rotation pool (/keys add, status, remove)', category: 'Model' },
  { command: '/route', description: 'Auto-route to a model based on the next message', category: 'Model' },

  // ── Modes ──
  { command: '/mode', description: 'Switch mode (dev/review/tdd/research/plan/debug/benchmark/architect/hermes/design)', category: 'Modes' },
  { command: '/modes', description: 'List all available modes', category: 'Modes' },
  { command: '/hermes', description: 'Switch to Hermes mode (self-improving learning loop)', category: 'Modes' },
  { command: '/design', description: 'Switch to design mode (Stitch-powered UI work)', category: 'Modes' },

  // ── Session ──
  { command: '/sessions', description: 'List saved sessions', category: 'Session' },
  { command: '/save', description: 'Save current session', category: 'Session' },
  { command: '/resume', description: 'Resume a saved session (accepts id, prefix, or "last")', category: 'Session' },
  { command: '/delete', description: 'Delete a session', category: 'Session' },

  // ── Git ──
  { command: '/commit', description: 'AI-generated commit message', category: 'Git' },
  { command: '/pr', description: 'AI-generated pull request', category: 'Git' },
  { command: '/diff', description: 'Show git diff', category: 'Git' },
  { command: '/log', description: 'Show git log', category: 'Git' },

  // ── Code Quality ──
  { command: '/review', description: 'AI code review (severity-rated findings)', category: 'Code Quality' },
  { command: '/auto-review', description: 'Code review with auto-detected language lens', category: 'Code Quality' },
  { command: '/tdd', description: 'Test-driven workflow (RED → GREEN → REFACTOR)', category: 'Code Quality' },
  { command: '/security-review', description: 'Security-focused audit', category: 'Code Quality' },
  { command: '/audit', description: 'Local-only project health check', category: 'Code Quality' },
  { command: '/doctor', description: 'Install/config/benchmark readiness check', category: 'Code Quality' },
  { command: '/verify', description: 'Run tests, fix failures, repeat until green', category: 'Code Quality' },
  { command: '/build-fix', description: 'Auto-detect language + fix build errors', category: 'Code Quality' },
  { command: '/test-coverage', description: 'Analyze coverage, suggest missing tests', category: 'Code Quality' },
  { command: '/benchmark', description: 'Benchmark-grade SWE/terminal/CI/WildClaw/ARC/spec run', category: 'Code Quality' },
  { command: '/refactor', description: 'Dead code detection + cleanup', category: 'Code Quality' },
  { command: '/hunt-silent', description: 'Silent-failure-hunter agent (empty catches, log-and-forget)', category: 'Code Quality' },
  { command: '/explore', description: 'Code-explorer agent (codebase reconnaissance pass)', category: 'Code Quality' },
  { command: '/types', description: 'Type-design-analyzer agent (type system critique)', category: 'Code Quality' },
  { command: '/architect', description: 'Code-architect agent (structural critique)', category: 'Code Quality' },
  { command: '/simplify', description: 'Code-simplifier agent (find + collapse incidental complexity)', category: 'Code Quality' },
  { command: '/e2e', description: 'Generate E2E tests', category: 'Code Quality' },

  // ── Tools & Config ──
  { command: '/tools', description: 'List currently-available tools', category: 'Config' },
  { command: '/perm', description: 'Permission mode (ask/auto/yolo)', category: 'Config' },
  { command: '/sandbox', description: 'OS-native bash sandbox (off/standard/strict)', category: 'Config' },
  { command: '/dry-run', description: 'Toggle dry-run mode (preview tool calls)', category: 'Config' },
  { command: '/thinking', description: 'Toggle thinking/reasoning display (live + auto-collapse)', category: 'Config' },
  { command: '/think', description: 'Re-expand the most recent collapsed thinking block', category: 'Config' },
  { command: '/cd', description: 'Change working directory', category: 'Config' },
  { command: '/hooks', description: 'List configured hooks', category: 'Config' },

  // ── Planning ──
  { command: '/plan', description: 'Structured implementation planning', category: 'Planning' },
  { command: '/checkpoint', description: 'Save git-state checkpoint inside this session', category: 'Planning' },
  { command: '/search-first', description: 'Research before coding', category: 'Planning' },
  { command: '/source-research', description: 'Research arXiv, GitHub, Hugging Face, and Kaggle', category: 'Planning' },
  { command: '/update-docs', description: 'Sync documentation with code', category: 'Planning' },

  // ── Orchestration ──
  { command: '/orchestrate', description: 'Decompose into parallel sub-agents', category: 'Orchestration' },
  { command: '/swarm', description: 'Parallel fan-out: N agents on the same task', category: 'Orchestration' },
  { command: '/multi-plan', description: 'Multi-agent planning', category: 'Orchestration' },

  // ── Skills & Memory ──
  { command: '/skills', description: 'List learned + bundled ECC skills', category: 'Skills' },
  { command: '/skill-show', description: 'Print the full prompt of a specific skill', category: 'Skills' },
  { command: '/ecc-guide', description: 'Browse the bundled ECC corpus', category: 'Skills' },
  { command: '/memory', description: 'MemPalace: status, search, recall, list', category: 'Skills' },
  { command: '/learn', description: 'Extract patterns from this session into instincts', category: 'Skills' },

  // ── Cost & Usage ──
  { command: '/usage', description: 'Token + cost summary', category: 'Cost' },
  { command: '/budget', description: 'Set daily/monthly USD budget', category: 'Cost' },

  // ── Debug ──
  { command: '/debug', description: 'Toggle debug instrumentation + tail event log', category: 'Debug' },

  // ── Voice / Accessibility ──
  { command: '/voice', description: 'Voice config + master switch', category: 'Voice' },
  { command: '/accessibility', description: 'Screen-reader mode, audio cues, destructive-confirm', category: 'Voice' },
  { command: '/dictate', description: 'One-shot record + transcribe', category: 'Voice' },

  // ── Stitch ──
  { command: '/stitch', description: 'Show Stitch config status', category: 'Stitch' },
  { command: '/stitch-config', description: 'Save your Stitch API key', category: 'Stitch' },

  // ── Exit ──
  { command: '/exit', description: 'Quit the REPL', category: 'General' },
];

export function completeSlashCommandNames(
  line: string,
  commands: string[] = COMMAND_CATALOG.map((c) => c.command),
): [string[], string] {
  if (!line.startsWith('/')) return [[], line];

  const matches = commands.filter((c) => c.startsWith(line));
  return matches.length === 1 ? [matches, line] : [[], line];
}
