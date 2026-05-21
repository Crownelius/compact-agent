#!/usr/bin/env node
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync as fsReadFileSync, writeFileSync as fsWriteFileSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig, saveConfig, configExists, getConfigDir } from './config.js';
import { resetClient } from './api.js';
import { runQuery } from './query.js';
import { ALL_TOOLS } from './tools/index.js';
import type { CrowcoderConfig, Message } from './types.js';
import { PROVIDERS } from './types.js';
// New systems
import { createSession, autoSave, listSessions, loadSession, deleteSession, type Session } from './sessions.js';
import { initHooksDir, runHooks, listHooks, saveHooksConfig, clearQuarantinedHooks } from './hooks.js';
import { printUsageSummary, setBudget } from './cost-tracker.js';
import { printSecurityWarning, scanCommand } from './security.js';
import { getCompactionStats } from './compaction.js';
import { extractPatterns, printInstinctStatus, pruneExpired, listInstincts, exportInstincts, importInstincts } from './learning.js';
import { MODES, type Mode, listModes } from './modes.js';
import { printModelOptions, switchModel, classifyComplexity, routeModel } from './model-router.js';
import { buildCommitPrompt, buildPRPrompt, printDiff, printLog, isGitRepo } from './git-workflow.js';
import { buildReviewPrompt, buildTDDPrompt, buildSecurityReviewPrompt, runAudit, printAuditReport, buildPlanPrompt, buildE2EPrompt, buildBuildFixPrompt, buildEvalPrompt, buildUpdateDocsPrompt } from './evaluation.js';
import { printRules } from './rules.js';
import { buildOrchestrationPrompt, runParallel, mergeResults, printOrchestrationStatus, type SubAgent } from './orchestration.js';
import { printBanner as printThemedBanner, theme, sym, formatDuration, installScreenReaderDispatch, uninstallScreenReaderDispatch, setPalette, getPaletteId, listPalettes, isPaletteId, PALETTES } from './theme.js';
import { saveExport, type ExportFormat } from './export.js';
// New feature modules
import { buildVerifyPrompt, saveCheckpoint, listCheckpoints, restoreCheckpoint } from './verification.js';
import { detectPackageManager, detectTestRunner, detectBuildTool } from './package-detect.js';
import { buildCoveragePrompt, printCoverageSummary } from './coverage.js';
import { buildRefactorPrompt, buildCleanupPrompt } from './refactor.js';
import { buildDocsUpdatePrompt, detectDocFiles } from './docs-sync.js';
import { listSkills, findSkill, applySkill, printSkillList, evolveInstinctsToSkills } from './skills.js';
import { onSessionStart, onSessionEnd, printMemoryStatus, searchMemory } from './memory.js';
import { incrementCounter, decrementCounter, resetCounter, getCounter } from './counter.js';
import {
  createUser,
  listUsers,
  getUser,
  getActiveUser,
  setActiveUser,
  updateUser,
  deleteUser,
  setUserMetadata,
  getUserMetadata,
  printUserList,
  buildUserContext,
} from './users.js';
import { shouldSuggestCompaction } from './strategic-compaction.js';
import { login, logout, getAuthenticatedUser, registerPassword, hasPassword } from './login.js';
// Language-specific agents & review
import {
  buildTSReviewPrompt, buildPyReviewPrompt, buildGoReviewPrompt, buildRustReviewPrompt,
  buildJavaReviewPrompt, buildCppReviewPrompt, buildKotlinReviewPrompt, buildPhpReviewPrompt,
  buildDbReviewPrompt, buildAutoReviewPrompt,
  buildTSBuildFixPrompt, buildGoBuildFixPrompt, buildRustBuildFixPrompt,
  buildJavaBuildFixPrompt, buildCppBuildFixPrompt, buildPyTorchBuildFixPrompt,
} from './agents.js';
// Autonomous loops & DAG orchestration
import {
  buildPRLoopPrompt, buildDAGPrompt, buildMultiPlanPrompt, buildMultiExecutePrompt,
  buildMultiBackendPrompt, buildMultiFrontendPrompt, buildLoopOperatorPrompt,
} from './autonomous-loops.js';
// Search-first research workflow
import { buildSearchFirstPrompt, buildDocsLookupPrompt } from './search-first.js';
// Codemaps
import { generateCodeMap, saveCodeMap, printCodeMap, printCodemapStatus, buildCodemapContext } from './codemaps.js';
// Skill creation from git patterns
import { buildSkillCreatePrompt, analyzeGitPatterns, printGitPatterns, printGitWorkflowSummary } from './skill-create.js';
// Content engine
import {
  buildArticlePrompt, buildSlidePrompt, buildContentRepurposePrompt,
  buildMarketResearchPrompt, buildInvestorDeckPrompt, buildInvestorOutreachPrompt,
  buildCodeQualityPrompt, buildSkillStocktakePrompt, buildChiefOfStaffPrompt,
} from './content-engine.js';
// Hook controls
import { printHookControlStatus, getHookProfile } from './hook-controls.js';
// PM2 manager
import { buildPM2Prompt, isPM2Available, listPM2Services } from './pm2-manager.js';
// ECC (everything-claude-code) integration
import {
  installEcc, getEccCommandPrompt, loadEccState, eccResourcesAvailable, reseedEccHooks, BUNDLE_VERSION as ECC_BUNDLE_VERSION, listEccCommands,
} from './ecc.js';
// Walkthrough — agent-led tour of Crowcoder (/walkthrough, /tour, /guide)
import { buildWalkthroughPrompt } from './walkthrough.js';
// Stitch (Google's AI UI/UX design tool) — /stitch, /stitch-config, /stitch-tools
import { buildStitchPrompt, buildStitchToolsPrompt, saveStitchConfig, printStitchStatus, stitchConfigured } from './stitch.js';
// MemPalace memory subsystem — wings/rooms/drawers/tunnels/KG, both global + project stores
import * as mempalace from './mempalace/index.js';
// Curator — periodic skill consolidation pass (/curate)
import { runCurator } from './curator.js';
// Voice / accessibility — built-in dictation (Whisper) + readout (ElevenLabs)
import {
  printVoiceStatus, isVoiceEnabled, getTtsConfig, getSttConfig, getAccessibilityConfig,
  speakAssistantResponse, speak, dictateOnce, DEFAULT_ASSISTANT_VOICE, DEFAULT_USER_VOICE,
} from './voice.js';
import { isFfmpegAvailable, audioCue, startRecording, probeMic, micProbeMessage, type RecordController } from './audio.js';
import { applyScreenReader, summarize } from './accessibility.js';

/**
 * Unified prompt resolver — prefers the bundled ECC prompt for a given
 * intent and falls back to the built-in builder when ECC isn't installed.
 * Keeps the user-facing surface to ONE command per intent (e.g. /tdd, not
 * /tdd vs /ecc-tdd). When ECC supplies the prompt, the user's args are
 * appended under a "## User Input" section so the model still sees them.
 */
function buildUnifiedPrompt(eccName: string, args: string, builtin: () => string): string {
  const ecc = getEccCommandPrompt(eccName);
  if (!ecc) return builtin();
  return args.trim() ? `${ecc}\n\n## User Input\n\n${args}` : ecc;
}

// ── Setup Wizard ──────────────────────────────────────────
async function setupWizard(rl: readline.Interface): Promise<CrowcoderConfig> {
  console.log(chalk.bold.cyan('\n  Compact Agent — First-time Setup\n'));
  console.log(chalk.white('  Choose a provider:\n'));

  const providerKeys = Object.keys(PROVIDERS);
  providerKeys.forEach((key, i) => {
    const p = PROVIDERS[key];
    console.log(chalk.white(`  ${i + 1}. ${p.name}`) + chalk.dim(` (${p.baseURL || 'you provide'})`));
  });

  const choice = await rl.question(chalk.yellow('\n  Provider [1]: '));
  const idx = parseInt(choice || '1', 10) - 1;
  const providerKey = providerKeys[Math.max(0, Math.min(idx, providerKeys.length - 1))];
  const provider = PROVIDERS[providerKey];

  let baseURL = provider.baseURL;
  if (providerKey === 'custom') {
    baseURL = await rl.question(chalk.yellow('  Base URL: '));
  }

  let apiKey = '';
  if (provider.requiresKey) {
    apiKey = await rl.question(chalk.yellow(`  API Key for ${provider.name}: `));
  }

  let model = provider.defaultModel;
  const modelInput = await rl.question(chalk.yellow(`  Model [${provider.defaultModel}]: `));
  if (modelInput.trim()) model = modelInput.trim();

  console.log(chalk.white('\n  Permission modes:'));
  console.log(chalk.dim('  1. ask   — prompt before writes/commands (safest)'));
  console.log(chalk.dim('  2. auto  — auto-approve reads, ask for destructive'));
  console.log(chalk.dim('  3. yolo  — approve everything (fastest)\n'));
  const permChoice = await rl.question(chalk.yellow('  Permission mode [1]: '));
  const permMode = (['ask', 'auto', 'yolo'] as const)[parseInt(permChoice || '1', 10) - 1] || 'ask';

  // ── MemPalace memory setup ──────────────────────────────
  // Featured capability, opt-out at setup time. Explain briefly so the
  // user can make an informed choice — most users want this on.
  console.log(chalk.white('\n  MemPalace persistent memory'));
  console.log(chalk.dim('  Lets the agent remember your preferences, codebase landmarks, and lessons across sessions.'));
  console.log(chalk.dim('  Two stores: global (~/.crowcoder/memory) for cross-project facts, project (.crowcoder/memory'));
  console.log(chalk.dim('  in each repo) for codebase-specific knowledge. Searchable via /memory or by the agent itself.'));
  console.log(chalk.dim('  Zero external dependencies; storage is local JSON files. Can be toggled anytime via /memory disable.'));
  const memoryChoice = await rl.question(chalk.yellow('  Enable MemPalace memory? [Y/n]: '));
  const memoryEnabled = !(memoryChoice.trim().toLowerCase().startsWith('n'));

  const config: CrowcoderConfig = {
    apiKey,
    baseURL,
    model,
    provider: provider.name,
    maxTokens: 8192,
    temperature: 0.3,
    permissionMode: permMode,
    memory: {
      enabled: memoryEnabled,
      globalScope: true,
      projectScope: true,
    },
  };

  saveConfig(config);
  console.log(chalk.green(`\n  Config saved to ${getConfigDir()}/config.json`));
  if (memoryEnabled) {
    console.log(chalk.dim(`  MemPalace: ENABLED — 7 memory_* tools available to the agent. Storage created on first write.`));
  } else {
    console.log(chalk.dim(`  MemPalace: disabled. Re-enable anytime with /memory enable.`));
  }
  console.log();
  return config;
}

/**
 * Parse slash command respecting quoted strings
 */
function parseSlashCommand(input: string): { cmd: string; args: string } {
  const trimmed = input.trim();
  const spaceIdx = trimmed.indexOf(' ');

  if (spaceIdx === -1) {
    return { cmd: trimmed.toLowerCase(), args: '' };
  }

  const cmd = trimmed.slice(0, spaceIdx).toLowerCase();
  const argsRaw = trimmed.slice(spaceIdx + 1);

  // Keep quoted strings intact
  return { cmd, args: argsRaw };
}

// ── Slash Commands ────────────────────────────────────────
// Exported so smoke tests can dispatch commands directly without spawning a
// readline REPL or burning LLM tokens. Returns shape is stable contract:
//   { handled: true }              — local command, output printed to stdout
//   { handled: false, injectPrompt } — LLM-driven, prompt ready to send
export function handleSlashCommand(
  input: string,
  config: CrowcoderConfig,
  messages: Message[],
  session: Session,
  mode: { current: Mode },
): { handled: boolean; shouldExit?: boolean; newMessages?: Message[]; injectPrompt?: string } {
  const { cmd, args } = parseSlashCommand(input);

  switch (cmd) {
    // ── Help ──────────────────────────────────────────
    case '/help': {
      const h = theme.header;
      const d = theme.dim;
      const c = theme.command;
      // Inline status line: confirms ECC is on (and how many skills it brings)
      // without giving it its own section. ECC has no user-facing commands;
      // it works automatically.
      const eccState = loadEccState();
      if (eccState) {
        console.log(d(`\n  ECC: `) + theme.toolStatus('✓ enabled') + d(` — ${eccState.counts.skills} skills, ${eccState.counts.agents} agents, ${eccState.counts.commands + eccState.counts.prompts} workflows auto-loaded`));
      }
      console.log(h('\n  ── General ──'));
      console.log(d('  ') + c('/help') + d('             — this help'));
      console.log(d('  ') + c('/config') + d('           — reconfigure provider/model/key'));
      console.log(d('  ') + c('/theme [mode]') + d('     — toggle display mode (full/compact/minimal)'));
      console.log(d('  ') + c('/palette [id]') + d('     — switch color palette; run /palettes to list'));
      console.log(d('  ') + c('/palettes') + d('         — list available color palettes with preview'));
      console.log(d('  ') + c('/clear') + d('            — clear conversation'));
      console.log(d('  ') + c('/back [n]') + d('         — rewind to before the nth most-recent user turn (no arg lists turns)'));
      console.log(d('  ') + c('/history') + d('          — message count & token estimate'));
      console.log(d('  ') + c('/export [fmt]') + d('     — export conversation (md/json/txt)'));
      console.log(d('  ') + c('/exit') + d('             — quit (alias: /quit)'));
      console.log(d('  ') + c('/walkthrough') + d('      — agent-led tour of Crowcoder (aliases: /tour, /guide)'));
      console.log(d('  ') + c('!<cmd>') + d('            — run shell command directly'));
      console.log(h('\n  ── Model & Provider ──'));
      console.log(d('  ') + c('/model [name]') + d('     — switch or show model'));
      console.log(d('  ') + c('/models') + d('           — list available models for provider'));
      console.log(d('  ') + c('/fallback [model]') + d(' — set/show the model auto-retried on cryptic provider errors'));
      console.log(d('  ') + c('/provider') + d('         — show provider info'));
      console.log(d('  ') + c('/route') + d('            — auto-route model based on next message'));
      console.log(h('\n  ── Modes ──'));
      console.log(d('  ') + c('/mode [name]') + d('      — switch mode (dev/review/tdd/research/plan/debug/architect/hermes/design)'));
      console.log(d('  ') + c('/modes') + d('            — list all modes (read-only; use /mode <name> to switch)'));
      console.log(d('  ') + c('/hermes') + d('           — alias for /mode hermes (self-improving learning loop)'));
      console.log(d('  ') + c('/design [task]') + d('    — switch to design mode (Stitch-powered UI generation); optional task to start immediately'));
      console.log(h('\n  ── Session ──'));
      console.log(d('  ') + c('/sessions') + d('         — list saved sessions'));
      console.log(d('  ') + c('/save [name]') + d('      — save current session'));
      console.log(d('  ') + c('/resume <id>') + d('      — resume a saved session'));
      console.log(d('  ') + c('/delete <id>') + d('      — delete a session'));
      console.log(h('\n  ── Git ──'));
      console.log(d('  ') + c('/commit') + d('           — AI-generated commit'));
      console.log(d('  ') + c('/pr') + d('               — AI-generated pull request'));
      console.log(d('  ') + c('/diff') + d('             — show git diff'));
      console.log(d('  ') + c('/log') + d('              — show git log'));
      console.log(h('\n  ── Code Quality ──'));
      console.log(d('  ') + c('/review [target]') + d('  — AI code review (uses ECC prompt, language-agnostic)'));
      console.log(d('  ') + c('/auto-review') + d('      — same, but adds a language-specific lens (auto-detected)'));
      console.log(d('  ') + c('/tdd <desc>') + d('       — test-driven development'));
      console.log(d('  ') + c('/security-review') + d('  — security audit'));
      console.log(d('  ') + c('/audit') + d('            — harness audit (score project health)'));
      console.log(d('  ') + c('/verify [cmd]') + d('     — run tests, fix failures, repeat until green'));
      console.log(d('  ') + c('/build-fix') + d('        — auto-detect language & fix build errors'));
      console.log(d('  ') + c('/test-coverage') + d('    — analyze test coverage, suggest tests'));
      console.log(d('  ') + c('/refactor [target]') + d(' — dead code detection & cleanup'));
      console.log(d('  ') + c('/e2e <feature>') + d('    — generate E2E tests'));
      console.log(d('  ') + c('/eval <criteria>') + d('  — evaluate project against criteria'));
      console.log(h('\n  ── Tools & Config ──'));
      console.log(d('  ') + c('/tools') + d('            — list tools'));
      console.log(d('  ') + c('/rules') + d('            — show coding rules'));
      console.log(d('  ') + c('/perm <mode>') + d('      — set permission mode (ask/auto/yolo); no arg shows current + always-allow list'));
      console.log(d('  ') + c('/perm-reset') + d('       — clear the per-tool always-allow list'));
      console.log(d('  ') + c('/dry-run') + d('          — toggle dry-run mode'));
      console.log(d('  ') + c('/thinking') + d('         — toggle thinking/reasoning display'));
      console.log(d('  ') + c('/cd <path>') + d('        — change directory'));
      console.log(d('  ') + c('/hooks') + d('            — list configured hooks'));
      console.log(d('  ') + c('/reset-hooks') + d('      — wipe hooks.json and re-seed ECC hooks for current install'));
      console.log(h('\n  ── Planning & Docs ──'));
      console.log(d('  ') + c('/plan <task>') + d('      — structured implementation planning'));
      console.log(d('  ') + c('/update-docs') + d('      — sync documentation with code'));
      console.log(d('  ') + c('/checkpoint [label]') + d(' — save git state checkpoint'));
      console.log(d('  ') + c('/checkpoints') + d('      — list saved checkpoints'));
      console.log(d('  ') + c('/search-first <task>') + d(' — research before coding'));
      console.log(d('  ') + c('/docs-lookup <query>') + d(' — search docs for answers'));
      // /review already auto-uses ECC's high-quality language-agnostic prompt;
      // /auto-review additionally picks language-specific lens automatically.
      // Per-language commands (/ts-review, /py-review, ...) still work as
      // silent aliases for power users but are not listed here.
      console.log(h('\n  ── Orchestration ──'));
      console.log(d('  ') + c('/orchestrate <task>') + d(' — decompose into parallel sub-agents'));
      console.log(d('  ') + c('/pr-loop') + d('          — autonomous PR review loop'));
      console.log(d('  ') + c('/multi-plan <task>') + d(' — multi-agent planning'));
      console.log(d('  ') + c('/multi-execute') + d('    — multi-agent execution'));
      console.log(d('  ') + c('/multi-backend') + d('    — multi-service backend generation'));
      console.log(d('  ') + c('/multi-frontend') + d('   — multi-component frontend generation'));
      console.log(h('\n  ── Codemaps ──'));
      console.log(d('  ') + c('/codemap') + d('          — show project structure map'));
      console.log(d('  ') + c('/update-codemaps') + d('  — regenerate and save codemap'));
      console.log(h('\n  ── Content Engine ──'));
      console.log(d('  ') + c('/article <topic>') + d('  — generate article/blog post'));
      console.log(d('  ') + c('/slides <topic>') + d('   — generate slide outline'));
      console.log(d('  ') + c('/repurpose <text>') + d(' — repurpose content for channels'));
      console.log(d('  ') + c('/market-research') + d('  — market research report'));
      console.log(d('  ') + c('/investor-deck') + d('    — investor pitch deck'));
      console.log(d('  ') + c('/investor-outreach') + d(' — investor outreach emails'));
      console.log(d('  ') + c('/code-quality') + d('     — comprehensive code quality audit'));
      console.log(d('  ') + c('/skill-stocktake') + d('  — inventory skills & capabilities'));
      console.log(d('  ') + c('/chief-of-staff') + d('   — executive briefing & priorities'));
      console.log(h('\n  ── Skills & Patterns ──'));
      console.log(d('  ') + c('/skill-create') + d('     — create skill from git patterns'));
      console.log(d('  ') + c('/git-patterns') + d('     — analyze git commit patterns'));
      console.log(d('  ') + c('/git-workflow') + d('     — summarize git workflow'));
      console.log(h('\n  ── Learning & Cost ──'));
      console.log(d('  ') + c('/usage') + d('            — token/cost summary'));
      console.log(d('  ') + c('/budget <d> <m>') + d('   — set daily/monthly budget (USD)'));
      console.log(d('  ') + c('/learn') + d('            — extract patterns from this session'));
      console.log(d('  ') + c('/instincts') + d('        — show learned instincts'));
      console.log(d('  ') + c('/instinct-export') + d('  — export instincts to JSON file'));
      console.log(d('  ') + c('/instinct-import') + d('  — import instincts from JSON file'));
      console.log(d('  ') + c('/evolve') + d('           — cluster instincts into reusable skills'));
      console.log(d('  ') + c('/prune') + d('            — delete expired instincts'));
      console.log(d('  ') + c('/skills') + d('           — list learned skills (and bundled ECC skills)'));
      console.log(d('  ') + c('/skill-show <name>') + d(' — print the full prompt text of a specific skill'));
      console.log(d('  ') + c('/ecc-guide [section]') + d('— browse the bundled corpus (skills / agents / commands)'));
      console.log(d('  ') + c('/curate') + d('           — scan skill registry for dupes / stale items (report-only)'));
      console.log(d('  ') + c('/memory [sub]') + d('     — MemPalace: status, enable/disable, wings, rooms, ls, search <q>, get <id>, rm <id>'));
      console.log(d('  ') + c('/users') + d('           — manage users table'));
      console.log(d('  ') + c('/count [inc|dec|reset]') + d(' — increment/decrement/reset counter'));
      console.log(d('  ') + c('/detect') + d('           — detect package manager, test runner, build tool'));
      console.log(d('  ') + c('/hook-profile') + d('     — show hook profile & controls'));
      console.log(d('  ') + c('/pm2 [action]') + d('     — PM2 service management'));
      // ECC is bundled, free, auto-installed on first launch, and used
      // automatically. Built-in /tdd /review /security-review /plan /refactor
      // /build-fix use ECC prompts. ECC-only workflows (feature-development,
      // database-migration, add-language-rules) auto-inject when you describe
      // matching work — no slash command needed. Status line below confirms
      // it's enabled.
      console.log(h('\n  ── Voice & accessibility ──'));
      console.log(d('  ') + c('/voice') + d('            — show voice config & status (off by default)'));
      console.log(d('  ') + c('/voice on|off') + d('     — master switch for dictation + readout'));
      console.log(d('  ') + c('/voice config') + d('     — quick setup walkthrough'));
      console.log(d('  ') + c('/voice key stt <key>') + d(' — OpenAI key for Whisper dictation'));
      console.log(d('  ') + c('/voice key tts <key>') + d(' — ElevenLabs key for assistant readout'));
      console.log(d('  ') + c('/voice test') + d('       — play a short test utterance'));
      console.log(d('  ') + c('/voice echo|skip-code|speed') + d(' — fine-tune behavior'));
      console.log(d('  ') + c('/dictate [s]') + d('      — one-shot record + transcribe (default 30s)'));
      console.log(d('  ') + c('/accessibility') + d('    — toggle screen-reader mode, audio cues, destructive-confirm'));
      console.log(d('  Status hotkeys: F1 what now · F2 where am I · F3 read full · F4 read summary'));
      console.log(d('  Playback hotkeys: F5 dictate · F6 pause · F7 replay · F8 skip · F9 speed+ · F10 speed–'));
      console.log(h('\n  ── Stitch (Google AI UI/UX design) ──'));
      console.log(d('  Use ') + c('/mode design') + d(' or ') + c('/design <task>') + d(' for UI work — the agent uses Stitch automatically.'));
      console.log(d('  ') + c('/stitch') + d('              — show config status'));
      console.log(d('  ') + c('/stitch tools') + d('        — live verification: tools/list against the server'));
      console.log(d('  ') + c('/stitch <query>') + d('      — direct Stitch assistant (intent-routed)'));
      console.log(d('  ') + c('/stitch-config <key>') + d('— save your Stitch API key locally'));
      console.log();
      return { handled: true };
    }

    // ── Theme ─────────────────────────────────────────
    case '/theme':
      if (args) {
        const validThemes = ['full', 'compact', 'minimal'] as const;
        if (validThemes.includes(args as any)) {
          config.theme = args as 'full' | 'compact' | 'minimal';
          saveConfig(config);
          console.log(chalk.green(`  Theme: ${config.theme}`));
        } else {
          console.log(chalk.yellow(`  Invalid theme: ${args}. Use: full, compact, or minimal`));
        }
      } else {
        const current = config.theme || 'full';
        console.log(chalk.dim(`  Current theme: ${current}`));
      }
      return { handled: true };

    // ── Clear ─────────────────────────────────────────
    case '/clear':
      console.log(chalk.dim('  Conversation cleared.'));
      return { handled: true, newMessages: [] };

    // ── Backtrack — rewind to a prior user turn (Codex audit item 4) ──
    //   /back          list recent user messages with numbers
    //   /back <n>      truncate conversation to BEFORE the nth most-recent
    //                  user message (1 = drop the latest user turn + everything after)
    //
    // Killer UX for fixing a misdirected agent: instead of /clear then
    // retyping the original request, jump back N turns and try again from
    // the same starting point. Codex implements this as Esc-Esc + transcript
    // overlay; we use a slash command for now (keyboard binding TBD).
    case '/back':
    case '/rewind': {
      // Find user message indices in order (oldest → newest)
      const userIdx: number[] = [];
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'user') userIdx.push(i);
      }
      if (userIdx.length === 0) {
        console.log(chalk.dim('  No user messages to rewind to.'));
        return { handled: true };
      }
      const arg = args.trim();
      if (!arg) {
        // List most-recent user turns with their position
        console.log(chalk.cyan(`\n  Recent user turns (most recent first):`));
        const recent = userIdx.slice(-10).reverse();
        recent.forEach((idx, n) => {
          const c = messages[idx].content;
          const text = typeof c === 'string' ? c : '(non-text)';
          const excerpt = text.length > 90 ? text.slice(0, 87) + '…' : text;
          console.log(chalk.dim(`    ${(n + 1).toString().padStart(2)}. ${excerpt}`));
        });
        console.log(chalk.dim('\n  Rewind with: /back <n>  (n=1 = drop the most recent user turn + everything after)\n'));
        return { handled: true };
      }
      const n = parseInt(arg, 10);
      if (isNaN(n) || n < 1 || n > userIdx.length) {
        console.log(chalk.yellow(`  Invalid index. Usage: /back <n>  (1..${userIdx.length})`));
        return { handled: true };
      }
      // We want to truncate to BEFORE the n-th most-recent user message.
      // userIdx is oldest-first; the n-th most-recent is at userIdx[len - n].
      const cutIdx = userIdx[userIdx.length - n];
      const dropped = messages.length - cutIdx;
      const newMessages = messages.slice(0, cutIdx);
      console.log(chalk.green(`  Rewound to before user turn ${n} (dropped ${dropped} message(s)).`));
      return { handled: true, newMessages };
    }

    // ── History ───────────────────────────────────────
    case '/history': {
      const stats = getCompactionStats(messages);
      const userMsgs = messages.filter((m) => m.role === 'user').length;
      const assistMsgs = messages.filter((m) => m.role === 'assistant').length;
      const toolMsgs = messages.filter((m) => m.role === 'tool').length;
      console.log(chalk.dim(`  Messages: ${messages.length} (${userMsgs} user, ${assistMsgs} assistant, ${toolMsgs} tool)`));
      console.log(chalk.dim(`  Est. tokens: ~${stats.estimatedTokens.toLocaleString()}${stats.needsCompaction ? ' (compaction recommended)' : ''}`));
      return { handled: true };
    }

    // ── Model ─────────────────────────────────────────
    case '/model':
      if (args) {
        const newModel = switchModel(config, args);
        if (newModel) {
          config.model = newModel;
          saveConfig(config);
          resetClient();
          console.log(chalk.green(`  Model: ${config.model}`));
        } else {
          config.model = args;
          saveConfig(config);
          resetClient();
          console.log(chalk.green(`  Model: ${config.model} (custom)`));
        }
      } else {
        console.log(chalk.dim(`  Current: ${config.model}`));
      }
      return { handled: true };

    case '/models':
      printModelOptions(config);
      return { handled: true };

    // /fallback — set or show the model used as a one-shot rescue when the
    // primary model returns a cryptic provider error. Set to '' / 'off' to
    // disable. Independent from /model (which switches the primary).
    case '/fallback': {
      const target = args.trim();
      if (!target) {
        const cur = config.fallbackModel ?? '(not set)';
        console.log(chalk.dim(`  Current fallback model: ${cur}`));
        console.log(chalk.dim(`  Used once per chain when the primary returns "unknown" provider errors.`));
        console.log(chalk.dim(`  Set with: /fallback <model-id>  · disable with: /fallback off`));
        return { handled: true };
      }
      if (target === 'off' || target === 'none' || target === 'disable') {
        config.fallbackModel = undefined;
        saveConfig(config);
        console.log(chalk.green('  Fallback model disabled.'));
        return { handled: true };
      }
      config.fallbackModel = target;
      saveConfig(config);
      console.log(chalk.green(`  Fallback model: ${target}`));
      console.log(chalk.dim(`  Will be tried automatically once per chain if ${config.model} returns a cryptic provider error.`));
      return { handled: true };
    }

    case '/route': {
      console.log(chalk.dim('  Auto-routing enabled for next message.'));
      return { handled: true };
    }

    case '/provider':
      console.log(chalk.dim(`  Provider: ${config.provider}`));
      console.log(chalk.dim(`  Base URL: ${config.baseURL}`));
      console.log(chalk.dim(`  Model: ${config.model}`));
      console.log(chalk.dim(`  API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : '(none)'}`));
      return { handled: true };

    // ── Mode ──────────────────────────────────────────
    case '/mode':
      if (args && MODES[args as Mode]) {
        mode.current = args as Mode;
        const m = MODES[mode.current];
        console.log(chalk.green(`  Mode: ${m.label} — ${m.description}`));
        // Soft hint when switching mode with conversation history present.
        // Mode switches DON'T clear context, which means a previous
        // request's residue (e.g. "write me a poem") can leak into the
        // new mode's responses ("I'll handle both requests…"). Suggest
        // /clear so users notice this and decide intentionally.
        if (messages.length > 0) {
          console.log(chalk.dim(`  Note: conversation history kept across mode switch. Run /clear for a fresh context if you don't want it.`));
        }
        // Accessibility: speak the mode-switch when configured. Doesn't
        // block — fire-and-forget. Errors swallowed (voice should never
        // break the REPL).
        if (isVoiceEnabled(config) && getAccessibilityConfig(config).announceModeSwitches) {
          const tts = getTtsConfig(config);
          if (tts.apiKey) {
            speak(`Mode switched to ${m.label}`, config, { voiceId: tts.assistantVoiceId }).catch(() => { /* noop */ });
          }
        }
      } else if (args) {
        console.log(chalk.yellow(`  Unknown mode: ${args}`));
        console.log(chalk.dim(`  Available: ${Object.keys(MODES).join(', ')}`));
      } else {
        console.log(chalk.dim(`  Current: ${mode.current} (${MODES[mode.current].description})`));
      }
      return { handled: true };

    // ── Hermes shorthand (inspired by nousresearch/hermes-agent) ──
    case '/hermes': {
      mode.current = 'hermes';
      const m = MODES.hermes;
      console.log(chalk.cyan(`  Mode: ${m.label}`));
      console.log(chalk.dim(`  ${m.description}`));
      console.log(chalk.dim(`  Recall → user-model → parallelize → distill → persist → schedule.`));
      return { handled: true };
    }

    // ── Design mode shortcut: switch + optionally inject task ─────
    case '/design': {
      mode.current = 'design';
      const m = MODES.design;
      console.log(chalk.cyan(`  Mode: ${m.label}`));
      console.log(chalk.dim(`  ${m.description}`));
      if (!stitchConfigured()) {
        console.log(chalk.yellow(`\n  ⚠ Stitch is not configured. Run /stitch-config <api-key> to enable.`));
        console.log(chalk.dim(`  In design mode without Stitch, I'll fall back to plain HTML/CSS.`));
      }
      if (args.trim()) {
        return { handled: false, injectPrompt: args.trim() };
      }
      console.log(chalk.dim(`\n  Now describe what you want built — e.g.:`));
      console.log(chalk.dim(`    "Build a stock portfolio app, edgy red palette, no blue/green"`));
      return { handled: true };
    }

    case '/modes':
      // List-only. Use `/mode <name>` to switch — single switcher, no duplicates.
      if (args) {
        console.log(chalk.dim(`  /modes lists modes only. To switch: /mode ${args}`));
      }
      console.log(chalk.cyan('\n  Modes:'));
      for (const m of listModes()) {
        const marker = m.name === mode.current ? chalk.green(' ◀') : '';
        console.log(chalk.white(`  ${m.name.padEnd(12)}`) + chalk.dim(m.description) + marker);
      }
      console.log(theme.dim('\n  Switch with: /mode <name>'));
      console.log();
      return { handled: true };

    // ── Session ───────────────────────────────────────
    case '/sessions': {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log(chalk.dim('  No saved sessions.'));
      } else {
        console.log(chalk.cyan(`\n  Saved Sessions (${sessions.length}):`));
        for (const s of sessions.slice(0, 20)) {
          console.log(
            chalk.white(`  ${s.id.slice(0, 12).padEnd(14)}`) +
            chalk.dim(`${s.name.padEnd(30)} ${s.turnCount} turns  ${s.model}  ${s.updatedAt.slice(0, 10)}`),
          );
        }
        console.log();
      }
      return { handled: true };
    }

    case '/save':
      session.name = args || session.name;
      autoSave(session, messages);
      console.log(chalk.green(`  Session saved: ${session.id} "${session.name}"`));
      return { handled: true };

    case '/resume': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /resume <session-id>'));
        return { handled: true };
      }
      const loaded = loadSession(args);
      if (!loaded) {
        console.log(chalk.red(`  Session not found: ${args}`));
        return { handled: true };
      }
      console.log(chalk.green(`  Resumed: ${loaded.name} (${loaded.messages.length} messages)`));
      return { handled: true, newMessages: loaded.messages };
    }

    case '/delete':
      if (args && deleteSession(args)) {
        console.log(chalk.green(`  Deleted session: ${args}`));
      } else {
        console.log(chalk.yellow(`  Session not found: ${args}`));
      }
      return { handled: true };

    // ── Git ───────────────────────────────────────────
    case '/commit': {
      const prompt = buildCommitPrompt(process.cwd());
      if (!prompt) {
        console.log(chalk.yellow('  No git changes to commit.'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: prompt };
    }

    case '/pr': {
      const prompt = buildPRPrompt(process.cwd());
      if (!prompt) {
        console.log(chalk.yellow('  Not a git repo or no commits to PR.'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: prompt };
    }

    case '/diff':
      printDiff(process.cwd());
      return { handled: true };

    case '/log':
      printLog(process.cwd(), parseInt(args) || 15);
      return { handled: true };

    // ── Code Quality ──────────────────────────────────
    case '/review': {
      const builtin = buildReviewPrompt(process.cwd(), args || undefined);
      const eccPrompt = getEccCommandPrompt('code-review');
      if (!builtin && !eccPrompt) {
        console.log(chalk.yellow('  No changes to review. Specify a target: /review HEAD~3'));
        return { handled: true };
      }
      mode.current = 'review';
      const prompt = eccPrompt
        ? (args.trim() ? `${eccPrompt}\n\n## User Input\n\n${args}` : eccPrompt)
        : builtin!;
      return { handled: false, injectPrompt: prompt };
    }

    case '/tdd':
      if (!args) {
        console.log(chalk.yellow('  Usage: /tdd <feature description>'));
        return { handled: true };
      }
      mode.current = 'tdd';
      return { handled: false, injectPrompt: buildUnifiedPrompt('tdd', args, () => buildTDDPrompt(args)) };

    case '/security-review':
      mode.current = 'review';
      return {
        handled: false,
        injectPrompt: buildUnifiedPrompt('security-review', args, () => buildSecurityReviewPrompt(process.cwd())),
      };

    case '/audit': {
      const report = runAudit(process.cwd());
      printAuditReport(report);
      return { handled: true };
    }

    // ── Tools & Config ────────────────────────────────
    case '/tools':
      console.log(chalk.cyan('\n  Tools:'));
      ALL_TOOLS.forEach((t) => {
        const flags = [t.isReadOnly ? 'R' : 'RW', t.isDestructive ? '!' : ''].filter(Boolean).join('');
        console.log(chalk.white(`  ${t.name.padEnd(14)}`) + chalk.dim(`[${flags.padEnd(3)}] ${t.description.slice(0, 65)}`));
      });
      console.log();
      return { handled: true };

    case '/rules':
      printRules();
      return { handled: true };

    case '/perm':
      if (args && ['ask', 'auto', 'yolo'].includes(args)) {
        config.permissionMode = args as CrowcoderConfig['permissionMode'];
        saveConfig(config);
        console.log(chalk.green(`  Permissions: ${config.permissionMode}`));
      } else {
        console.log(chalk.dim(`  Current: ${config.permissionMode} (options: ask, auto, yolo)`));
        const allowed = config.alwaysAllowedTools || [];
        if (allowed.length > 0) {
          console.log(chalk.dim(`  Always-allow list: ${allowed.join(', ')}`));
          console.log(chalk.dim(`  Clear with /perm-reset`));
        }
      }
      return { handled: true };

    // Clear the per-tool always-allow list. Useful after typing "always"
    // by accident, or to re-tighten security after a session of work.
    case '/perm-reset': {
      const had = (config.alwaysAllowedTools || []).length;
      config.alwaysAllowedTools = [];
      saveConfig(config);
      console.log(chalk.green(`  Cleared ${had} always-allowed tool(s). Permission prompts re-enabled.`));
      return { handled: true };
    }

    case '/dry-run':
      config.dryRun = !config.dryRun;
      saveConfig(config);
      const dryRunStatus = config.dryRun ? chalk.yellow('ON') : chalk.green('OFF');
      console.log(chalk.green(`  Dry-run mode: ${dryRunStatus}`));
      if (config.dryRun) {
        console.log(chalk.dim('  Tools will show what they would execute without actually running.'));
      }
      return { handled: true };

    case '/thinking': {
      config.showThinking = !config.showThinking;
      saveConfig(config);
      const thinkingStatus = config.showThinking ? chalk.yellow('ON') : chalk.green('OFF');
      console.log(chalk.green(`  Show thinking: ${thinkingStatus}`));
      if (config.showThinking) {
        console.log(chalk.dim('  Model reasoning/chain-of-thought will be displayed when available.'));
        console.log(chalk.dim('  Works with DeepSeek, OpenRouter reasoning models, and others.'));
      }
      return { handled: true };
    }

    case '/cd':
      if (args) {
        try {
          process.chdir(args);
          console.log(chalk.green(`  cwd: ${process.cwd()}`));
        } catch (e: unknown) {
          console.log(chalk.red(`  ${e instanceof Error ? e.message : e}`));
        }
      } else {
        console.log(chalk.dim(`  cwd: ${process.cwd()}`));
      }
      return { handled: true };

    case '/hooks': {
      const hooks = listHooks();
      if (hooks.length === 0) {
        console.log(chalk.dim('  No hooks configured. Edit ~/.crowcoder/hooks.json'));
      } else {
        console.log(chalk.cyan(`\n  Hooks (${hooks.length}):`));
        hooks.forEach((h, i) => {
          const status = h.enabled === false ? chalk.red('OFF') : chalk.green('ON');
          console.log(chalk.dim(`  ${i}. [${status}] ${h.event} → ${h.match} → ${h.command.slice(0, 50)}`));
        });
      }
      console.log();
      return { handled: true };
    }

    // ── Learning & Cost ───────────────────────────────
    case '/usage':
      printUsageSummary();
      return { handled: true };

    case '/budget': {
      const [daily, monthly] = args.split(/\s+/).map(Number);
      if (!daily || isNaN(daily)) {
        console.log(chalk.yellow('  Usage: /budget <daily-usd> [monthly-usd]'));
        return { handled: true };
      }
      setBudget(daily, monthly || daily * 30);
      console.log(chalk.green(`  Budget set: $${daily}/day, $${monthly || daily * 30}/month`));
      return { handled: true };
    }

    case '/learn': {
      const patterns = extractPatterns(messages, session.id);
      if (patterns.length === 0) {
        console.log(chalk.dim('  No patterns extracted from this session.'));
      } else {
        console.log(chalk.green(`  Extracted ${patterns.length} patterns:`));
        for (const p of patterns) {
          console.log(chalk.dim(`    [${p.category}] ${p.pattern.slice(0, 80)}`));
        }
      }
      return { handled: true };
    }

    case '/instincts':
      printInstinctStatus();
      return { handled: true };

    case '/prune': {
      const count = pruneExpired();
      console.log(chalk.dim(`  Pruned ${count} expired instincts.`));
      return { handled: true };
    }

    // ── Orchestration ─────────────────────────────────
    case '/orchestrate':
      if (!args) {
        console.log(chalk.yellow('  Usage: /orchestrate <task description>'));
        return { handled: true };
      }
      mode.current = 'architect';
      const orchPrompt = buildOrchestrationPrompt(args);
      return { handled: false, injectPrompt: orchPrompt };

    // ── Verification & Build ─────────────────────────
    case '/verify': {
      const prompt = buildVerifyPrompt(process.cwd(), args || undefined);
      return { handled: false, injectPrompt: prompt };
    }

    case '/build-fix': {
      return {
        handled: false,
        injectPrompt: buildUnifiedPrompt('build-fix', args, () => buildBuildFixPrompt(process.cwd(), args || undefined)),
      };
    }

    case '/test-coverage': {
      const prompt = buildCoveragePrompt(process.cwd());
      return { handled: false, injectPrompt: prompt };
    }

    case '/refactor':
    case '/refactor-clean': {
      return {
        handled: false,
        injectPrompt: buildUnifiedPrompt('refactor', args,
          () => args ? buildRefactorPrompt(process.cwd(), args) : buildCleanupPrompt(process.cwd())),
      };
    }

    case '/e2e': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /e2e <feature description>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildE2EPrompt(args, process.cwd()) };
    }

    case '/eval': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /eval <criteria> [target]'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildEvalPrompt(args) };
    }

    case '/plan': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /plan <task description>'));
        return { handled: true };
      }
      mode.current = 'plan';
      return {
        handled: false,
        injectPrompt: buildUnifiedPrompt('plan', args, () => buildPlanPrompt(args, process.cwd())),
      };
    }

    case '/update-docs': {
      return { handled: false, injectPrompt: buildDocsUpdatePrompt(process.cwd()) };
    }

    // ── Checkpoints ──────────────────────────────────
    case '/checkpoint': {
      const cp = saveCheckpoint(session.id, process.cwd(), args || undefined);
      console.log(chalk.green(`  Checkpoint saved: ${cp.id} ${cp.label ? `"${cp.label}"` : ''}`));
      console.log(chalk.dim(`  Git SHA: ${cp.headSha?.slice(0, 8) || 'N/A'}`));
      return { handled: true };
    }

    case '/checkpoints': {
      const cps = listCheckpoints(session.id);
      if (cps.length === 0) {
        console.log(chalk.dim('  No checkpoints for this session.'));
      } else {
        console.log(chalk.cyan(`\n  Checkpoints (${cps.length}):`));
        for (const cp of cps) {
          console.log(chalk.white(`  ${cp.id.slice(0, 12).padEnd(14)}`) +
            chalk.dim(`${(cp.label || 'unnamed').padEnd(20)} ${cp.headSha?.slice(0, 8) || 'N/A'}  ${cp.timestamp.slice(0, 19)}`));
        }
      }
      console.log();
      return { handled: true };
    }

    // ── Instinct Management ──────────────────────────
    case '/instinct-export': {
      const json = exportInstincts();
      const exportPath = `${process.cwd()}/instincts-export-${Date.now()}.json`;
      fsWriteFileSync(exportPath, json, 'utf-8');
      console.log(chalk.green(`  Instincts exported to: ${exportPath}`));
      return { handled: true };
    }

    case '/instinct-import': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /instinct-import <path-to-json>'));
        return { handled: true };
      }
      try {
        const json = fsReadFileSync(args.trim(), 'utf-8');
        const count = importInstincts(json);
        console.log(chalk.green(`  Imported ${count} instincts.`));
      } catch (e: unknown) {
        console.log(chalk.red(`  Error: ${e instanceof Error ? e.message : e}`));
      }
      return { handled: true };
    }

    case '/evolve': {
      const instincts = listInstincts();
      if (instincts.length < 3) {
        console.log(chalk.yellow('  Need at least 3 instincts to evolve into skills.'));
        return { handled: true };
      }
      const skills = evolveInstinctsToSkills(instincts);
      if (skills.length === 0) {
        console.log(chalk.dim('  No skill clusters found. Keep learning!'));
      } else {
        console.log(chalk.green(`  Evolved ${skills.length} skills from ${instincts.length} instincts:`));
        for (const s of skills) {
          console.log(chalk.dim(`    [${s.category}] ${s.name}: ${s.description.slice(0, 60)}`));
        }
      }
      return { handled: true };
    }

    case '/skills':
      printSkillList();
      return { handled: true };

    // /skill-show <name>  — print the full skill prompt text. Used to
    // inspect what an auto-matched ECC skill would inject, or to learn
    // why /tdd or /review produced a particular shape of response. The
    // bundled ECC corpus has 228 skills as of v1.11 — most users won't
    // know they exist unless they can browse them.
    // /curate — manual skill-registry curation pass. Report-only;
    // surfaces duplicate names, high-overlap pairs, stale single-use,
    // and never-invoked skills > 60 days old. User decides what to do.
    case '/curate': {
      const report = runCurator();
      console.log(chalk.cyan(`\n  Curator scan — ${report.totalSkills} skills checked, ${report.findings.length} finding(s)`));
      if (report.findings.length === 0) {
        console.log(chalk.dim('  No issues. Registry is clean.\n'));
        return { handled: true };
      }
      // Group by recommendation
      const groups: Record<string, typeof report.findings> = {};
      for (const f of report.findings) {
        (groups[f.recommendation] = groups[f.recommendation] || []).push(f);
      }
      for (const [rec, items] of Object.entries(groups)) {
        console.log(chalk.bold(`\n  ${rec.toUpperCase()} (${items.length}):`));
        for (const f of items.slice(0, 20)) {
          console.log(chalk.dim(`    [${f.kind}] ${f.primary}${f.secondary ? ' ↔ ' + f.secondary : ''}`));
          console.log(chalk.dim(`      ${f.reason}`));
        }
        if (items.length > 20) console.log(chalk.dim(`    … and ${items.length - 20} more`));
      }
      console.log(chalk.dim('\n  Act on findings with /prune (instincts) or by editing ~/.crowcoder/skills/.\n'));
      return { handled: true };
    }

    // /ecc-guide — navigable browser of the bundled ECC corpus. With 228
    // skills + 60 agents + 81 commands available, users need a way to
    // see what's there before they go fishing with /skill-show or /skills.
    // Pure stdout — no LLM call. Sections + counts, with sample names.
    case '/ecc-guide': {
      const skills = listSkills();
      const eccSkills = skills.filter((s) => s.id.startsWith('ecc-') && !s.id.startsWith('ecc-agent-'));
      const eccAgents = skills.filter((s) => s.id.startsWith('ecc-agent-'));
      const learned = skills.filter((s) => !s.id.startsWith('ecc-'));
      const sub = args.trim().toLowerCase();

      if (!sub) {
        console.log(chalk.cyan('\n  ECC Guide — the bundled corpus'));
        console.log(chalk.dim('  Use the sub-commands below to drill into a section.\n'));
        console.log(chalk.bold(`  Skills (${eccSkills.length})`));
        console.log(chalk.dim(`    /ecc-guide skills [category]   — list ECC skills (optionally filtered)`));
        console.log(chalk.dim(`    /skill-show <name>             — full prompt text of any skill`));
        const cats = new Set(eccSkills.map((s) => s.category));
        console.log(chalk.dim(`    Categories: ${[...cats].sort().slice(0, 8).join(', ')}${cats.size > 8 ? ', …' : ''}`));
        console.log('');
        console.log(chalk.bold(`  Agents (${eccAgents.length})`));
        console.log(chalk.dim(`    /ecc-guide agents              — list ECC sub-agents`));
        console.log('');
        console.log(chalk.bold(`  Commands (${listEccCommands().length})`));
        console.log(chalk.dim(`    /ecc-guide commands            — list ECC commands available as /ecc-* slash`));
        console.log('');
        console.log(chalk.bold(`  Hooks`));
        console.log(chalk.dim(`    /hooks                         — currently configured hooks`));
        console.log(chalk.dim(`    /reset-hooks                   — wipe + re-seed from this install`));
        console.log('');
        if (learned.length > 0) {
          console.log(chalk.bold(`  Learned skills (this user, ${learned.length})`));
          console.log(chalk.dim(`    /skills                        — registry of skills learned via /learn`));
          console.log(chalk.dim(`    /curate                        — scan for duplicates / stale items`));
        }
        console.log();
        return { handled: true };
      }

      if (sub === 'skills' || sub.startsWith('skills ')) {
        const catFilter = sub.startsWith('skills ') ? sub.slice('skills '.length).trim() : '';
        let filtered = eccSkills;
        if (catFilter) filtered = filtered.filter((s) => s.category.toLowerCase().includes(catFilter));
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        console.log(chalk.cyan(`\n  ECC skills (${filtered.length}${catFilter ? ` matching "${catFilter}"` : ''}):`));
        for (const s of filtered.slice(0, 100)) {
          const desc = s.description.length > 75 ? s.description.slice(0, 72) + '…' : s.description;
          console.log(chalk.dim(`    ${s.name.padEnd(32)} ${desc}`));
        }
        if (filtered.length > 100) console.log(chalk.dim(`    … and ${filtered.length - 100} more`));
        console.log(chalk.dim(`\n  /skill-show <name> for full prompt text\n`));
        return { handled: true };
      }
      if (sub === 'agents') {
        const sorted = [...eccAgents].sort((a, b) => a.name.localeCompare(b.name));
        console.log(chalk.cyan(`\n  ECC sub-agents (${sorted.length}):`));
        for (const a of sorted) {
          const desc = a.description.length > 75 ? a.description.slice(0, 72) + '…' : a.description;
          console.log(chalk.dim(`    ${a.name.padEnd(32)} ${desc}`));
        }
        console.log();
        return { handled: true };
      }
      if (sub === 'commands') {
        const cmds = listEccCommands().sort();
        console.log(chalk.cyan(`\n  ECC commands (${cmds.length}):`));
        for (const c of cmds) console.log(chalk.dim(`    /ecc-${c}`));
        console.log();
        return { handled: true };
      }
      console.log(chalk.yellow(`  Unknown /ecc-guide section: ${sub}`));
      console.log(chalk.dim('  Try: skills [category], agents, commands'));
      return { handled: true };
    }

    case '/skill-show': {
      const name = args.trim();
      if (!name) {
        console.log(chalk.yellow('  Usage: /skill-show <skill-name>'));
        console.log(chalk.dim('  Run /skills to list available skills.'));
        return { handled: true };
      }
      const target = name.toLowerCase();
      // Try exact name match first, then fall back to substring match.
      const all = listSkills();
      let hit = all.find((s) => s.name.toLowerCase() === target);
      if (!hit) hit = all.find((s) => s.name.toLowerCase().includes(target));
      if (!hit) {
        console.log(chalk.yellow(`  No skill matches "${name}".`));
        const close = all.filter((s) => s.name.toLowerCase().includes(target.slice(0, 4))).slice(0, 5);
        if (close.length > 0) {
          console.log(chalk.dim('  Did you mean: ') + close.map((s) => s.name).join(', '));
        }
        return { handled: true };
      }
      console.log(chalk.cyan(`\n  Skill: ${hit.name}`));
      console.log(chalk.dim(`  Category: ${hit.category}  ·  Triggers: ${hit.triggers.slice(0, 6).join(', ')}${hit.triggers.length > 6 ? '…' : ''}`));
      console.log(chalk.dim(`  Description: ${hit.description}\n`));
      console.log(hit.prompt);
      console.log();
      return { handled: true };
    }

    // /memory <sub> — MemPalace inventory & inspection.
    //   /memory               status + counts (legacy + new combined)
    //   /memory wings         list wings in both stores
    //   /memory rooms <wing>  rooms within a wing
    //   /memory ls <w> <r>    drawers in a wing/room
    //   /memory search <q>    text search (same backend as memory_search tool)
    //   /memory get <id>      full content of a single drawer
    //   /memory rm <id>       delete a drawer (cascades tunnels + triples)
    //   /memory stats         storage + counts per scope
    case '/memory': {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || '').toLowerCase();
      try {
        // Enable / disable — affects whether the memory_* tools are
        // registered for the model on next REPL boot. Existing data is
        // preserved either way; toggling never deletes anything.
        if (sub === 'enable' || sub === 'on') {
          config.memory = { ...(config.memory || {}), enabled: true };
          saveConfig(config);
          console.log(chalk.green('  MemPalace: ENABLED.'));
          console.log(chalk.dim('  Restart the REPL for the memory_* tools to appear in the agent\'s registry.'));
          return { handled: true };
        }
        if (sub === 'disable' || sub === 'off') {
          config.memory = { ...(config.memory || {}), enabled: false };
          saveConfig(config);
          console.log(chalk.green('  MemPalace: disabled.'));
          console.log(chalk.dim('  Existing drawers/tunnels/triples preserved. Restart the REPL to remove memory_* tools from the agent.'));
          return { handled: true };
        }

        const enabled = config.memory?.enabled !== false;

        if (!sub || sub === 'status' || sub === 'stats') {
          const s = mempalace.stats(process.cwd());
          console.log(chalk.cyan('\n  MemPalace status'));
          console.log(chalk.dim(`    enabled: ${enabled ? '✓ yes' : '✗ no (toggle with /memory enable)'}`));
          console.log(chalk.dim(`    global  ${s.globalPath}`));
          console.log(chalk.dim(`      ${s.global.drawers} drawer(s) · ${s.global.wings} wing(s) · ${s.global.rooms} room(s) · ${s.global.tunnels} tunnel(s) · ${s.global.triples} fact(s)`));
          console.log(chalk.dim(`    project ${s.projectPath}${s.projectExists ? '' : '  (not yet created)'}`));
          console.log(chalk.dim(`      ${s.project.drawers} drawer(s) · ${s.project.wings} wing(s) · ${s.project.rooms} room(s) · ${s.project.tunnels} tunnel(s) · ${s.project.triples} fact(s)`));
          console.log();
          printMemoryStatus();
          return { handled: true };
        }
        if (sub === 'wings') {
          const w = mempalace.listWings(process.cwd());
          console.log(chalk.cyan('\n  Wings:'));
          if (w.global.length === 0 && w.project.length === 0) {
            console.log(chalk.dim('    (none yet — agent will create wings as it learns)'));
          }
          for (const wm of w.global) console.log(chalk.dim(`    global · ${wm.name.padEnd(20)} ${wm.drawerCount} drawer(s)`));
          for (const wm of w.project) console.log(chalk.dim(`    project · ${wm.name.padEnd(19)} ${wm.drawerCount} drawer(s)`));
          console.log();
          return { handled: true };
        }
        if (sub === 'rooms') {
          const r = mempalace.listRooms(process.cwd(), parts[1]);
          const all = [...r.global.map((m) => ({ ...m, s: 'global' })), ...r.project.map((m) => ({ ...m, s: 'project' }))];
          if (all.length === 0) { console.log(chalk.dim(`  No rooms${parts[1] ? ' in wing ' + parts[1] : ''}.`)); return { handled: true }; }
          console.log(chalk.cyan(`\n  Rooms${parts[1] ? ' in ' + parts[1] : ''}:`));
          for (const m of all) console.log(chalk.dim(`    ${m.s.padEnd(7)} ${m.wing}/${m.name}  — ${m.drawerCount} drawer(s), last ${m.lastTouched.slice(0, 10)}`));
          console.log();
          return { handled: true };
        }
        if (sub === 'ls' || sub === 'list') {
          const drawers = mempalace.listDrawers({ wing: parts[1], room: parts[2], cwd: process.cwd() });
          if (drawers.length === 0) { console.log(chalk.dim('  No drawers match.')); return { handled: true }; }
          console.log(chalk.cyan(`\n  Drawers (${drawers.length}):`));
          for (const d of drawers.slice(0, 50)) {
            const excerpt = d.content.length > 90 ? d.content.slice(0, 90) + '…' : d.content;
            console.log(chalk.dim(`    ${d.id} (${d.scope}) ${d.wing}/${d.room}: `) + chalk.white(excerpt));
          }
          if (drawers.length > 50) console.log(chalk.dim(`    … and ${drawers.length - 50} more`));
          console.log();
          return { handled: true };
        }
        if (sub === 'search') {
          const q = parts.slice(1).join(' ');
          if (!q) { console.log(chalk.yellow('  Usage: /memory search <query>')); return { handled: true }; }
          const hits = mempalace.search(q, process.cwd(), { limit: 10 });
          if (hits.length === 0) { console.log(chalk.dim(`  No matches for "${q}".`)); return { handled: true }; }
          console.log(chalk.cyan(`\n  ${hits.length} match(es) for "${q}":`));
          for (const h of hits) {
            const excerpt = h.drawer.content.length > 200 ? h.drawer.content.slice(0, 200) + '…' : h.drawer.content;
            const tagStr = h.drawer.tags.length > 0 ? ` [${h.drawer.tags.join(', ')}]` : '';
            console.log(chalk.dim(`    ${h.drawer.id} (${h.drawer.scope} · ${h.drawer.wing}/${h.drawer.room}${tagStr}) score ${h.score.toFixed(2)}`));
            console.log(chalk.white(`      ${excerpt}`));
          }
          console.log();
          return { handled: true };
        }
        if (sub === 'get' || sub === 'recall') {
          const id = parts[1];
          if (!id) { console.log(chalk.yellow('  Usage: /memory get <drawer-id>')); return { handled: true }; }
          const d = mempalace.getDrawer(id, process.cwd());
          if (!d) { console.log(chalk.yellow(`  No drawer ${id}.`)); return { handled: true }; }
          const tagStr = d.tags.length > 0 ? ` [${d.tags.join(', ')}]` : '';
          console.log(chalk.cyan(`\n  ${d.id} (${d.scope} · ${d.wing}/${d.room}${tagStr})`));
          console.log(chalk.dim(`  importance ${d.importance} · created ${d.createdAt} · updated ${d.updatedAt}\n`));
          console.log(d.content);
          console.log();
          return { handled: true };
        }
        if (sub === 'rm' || sub === 'delete') {
          const id = parts[1];
          if (!id) { console.log(chalk.yellow('  Usage: /memory rm <drawer-id>')); return { handled: true }; }
          // Try both stores; whichever owns it returns true
          const removed = mempalace.getGlobalStore().deleteDrawer(id)
            || mempalace.getProjectStore(process.cwd()).deleteDrawer(id);
          console.log(removed ? chalk.green(`  Deleted drawer ${id} (cascaded tunnels + triples).`) : chalk.yellow(`  No drawer ${id}.`));
          return { handled: true };
        }
        console.log(chalk.yellow(`  Unknown /memory subcommand: ${sub}`));
        console.log(chalk.dim('  Try: /memory (status), wings, rooms <wing>, ls <wing> <room>, search <q>, get <id>, rm <id>'));
        return { handled: true };
      } catch (e) {
        console.log(chalk.red(`  /memory failed: ${e instanceof Error ? e.message : e}`));
        return { handled: true };
      }
    }

    // ── Users Table ──────────────────────────────────────
    case '/users': {
      const sub = args.trim();
      if (sub === 'ls' || sub === 'list' || !sub) {
        printUserList();
        return { handled: true };
      }

      const parts = sub.split(/\s+/);
      const action = parts[0];

      if (action === 'add') {
        const name = parts[1] || '';
        if (!name) {
          console.log(chalk.yellow('  Usage: /users add <name> [email] [role]'));
          return { handled: true };
        }
        const email = parts[2] || '';
        const role = parts[3] || '';
        const user = createUser(name, email || undefined, role || undefined);
        console.log(chalk.green(`  User created: ${user.id} — ${user.name}`));
        return { handled: true };
      }

      if (action === 'rm' || action === 'del' || action === 'delete') {
        const id = parts[1];
        if (!id) {
          console.log(chalk.yellow('  Usage: /users rm <id>'));
          return { handled: true };
        }
        if (deleteUser(id)) {
          console.log(chalk.green(`  User deleted: ${id}`));
        } else {
          console.log(chalk.yellow(`  User not found: ${id}`));
        }
        return { handled: true };
      }

      if (action === 'set' || action === 'activate') {
        const id = parts[1];
        if (!id) {
          console.log(chalk.yellow('  Usage: /users set <id>'));
          return { handled: true };
        }
        const user = setActiveUser(id);
        if (user) {
          console.log(chalk.green(`  Active user: ${user.name} (${user.id})`));
        } else {
          console.log(chalk.yellow(`  User not found: ${id}`));
        }
        return { handled: true };
      }

      if (action === 'meta' || action === 'metadata') {
        const id = parts[1];
        const key = parts[2];
        const value = parts.slice(3).join(' ');
        if (!id || !key) {
          console.log(chalk.yellow('  Usage: /users meta <id> <key> [value]'));
          return { handled: true };
        }
        if (value) {
          setUserMetadata(id, key, value);
          console.log(chalk.green(`  Metadata set: ${key}=${value}`));
        } else {
          const val = getUserMetadata(id, key);
          console.log(chalk.dim(`  ${key}: ${val || '(not set)'}`));
        }
        return { handled: true };
      }

      // Unknown subcommand
      console.log(chalk.yellow('  Usage: /users [ls|add|rm|set|meta] ...'));
      console.log(chalk.dim('  ls              — list all users'));
      console.log(chalk.dim('  add <name> [email] [role] — create user'));
      console.log(chalk.dim('  rm <id>         — delete user'));
      console.log(chalk.dim('  set <id>        — set active user'));
      console.log(chalk.dim('  meta <id> <key> [value] — get/set metadata'));
      return { handled: true };
    }

    // ── Counter ─────────────────────────────────────────
    case '/count': {
      const subCmd = args.trim();
      if (subCmd === 'inc' || subCmd === '+') {
        incrementCounter();
        console.log(chalk.green(`  Counter: ${getCounter()}`));
      } else if (subCmd === 'dec' || subCmd === '-') {
        decrementCounter();
        console.log(chalk.green(`  Counter: ${getCounter()}`));
      } else if (subCmd === 'reset') {
        resetCounter();
        console.log(chalk.green(`  Counter reset to 0`));
      } else if (subCmd === 'help') {
        console.log(chalk.dim('  Usage: /count [inc|dec|reset|help]'));
        console.log(chalk.dim('  inc (+)  — increment counter'));
        console.log(chalk.dim('  dec (-)  — decrement counter'));
        console.log(chalk.dim('  reset    — reset counter to 0'));
        console.log(chalk.dim('  help     — show this help'));
      } else {
        console.log(chalk.green(`  Counter: ${getCounter()}`));
        console.log(chalk.dim('  Use /count inc|dec|reset|help'));
      }
      return { handled: true };
    }

    // ── Language-Specific Reviews ───────────────────
    case '/ts-review':
      return { handled: false, injectPrompt: buildTSReviewPrompt(process.cwd(), args || undefined) };

    case '/py-review':
      return { handled: false, injectPrompt: buildPyReviewPrompt(process.cwd(), args || undefined) };

    case '/go-review':
      return { handled: false, injectPrompt: buildGoReviewPrompt(process.cwd(), args || undefined) };

    case '/rust-review':
      return { handled: false, injectPrompt: buildRustReviewPrompt(process.cwd(), args || undefined) };

    case '/java-review':
      return { handled: false, injectPrompt: buildJavaReviewPrompt(process.cwd(), args || undefined) };

    case '/cpp-review':
      return { handled: false, injectPrompt: buildCppReviewPrompt(process.cwd(), args || undefined) };

    case '/kotlin-review':
      return { handled: false, injectPrompt: buildKotlinReviewPrompt(process.cwd(), args || undefined) };

    case '/php-review':
      return { handled: false, injectPrompt: buildPhpReviewPrompt(process.cwd(), args || undefined) };

    case '/db-review':
      return { handled: false, injectPrompt: buildDbReviewPrompt(process.cwd(), args || undefined) };

    case '/auto-review':
      return { handled: false, injectPrompt: buildAutoReviewPrompt(process.cwd(), args || undefined) };

    // ── Language-Specific Build Fixes ────────────────
    case '/ts-build-fix':
      return { handled: false, injectPrompt: buildTSBuildFixPrompt(process.cwd(), args || undefined) };

    case '/go-build-fix':
      return { handled: false, injectPrompt: buildGoBuildFixPrompt(process.cwd(), args || undefined) };

    case '/rust-build-fix':
      return { handled: false, injectPrompt: buildRustBuildFixPrompt(process.cwd(), args || undefined) };

    case '/java-build-fix':
      return { handled: false, injectPrompt: buildJavaBuildFixPrompt(process.cwd(), args || undefined) };

    case '/cpp-build-fix':
      return { handled: false, injectPrompt: buildCppBuildFixPrompt(process.cwd(), args || undefined) };

    case '/pytorch-fix':
      return { handled: false, injectPrompt: buildPyTorchBuildFixPrompt(process.cwd(), args || undefined) };

    // ── Autonomous Loops & DAG ───────────────────────
    case '/pr-loop':
      return { handled: false, injectPrompt: buildPRLoopPrompt(process.cwd()) };

    case '/multi-plan': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /multi-plan <task description>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildMultiPlanPrompt(args) };
    }

    case '/multi-execute': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /multi-execute <plan>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildMultiExecutePrompt(args) };
    }

    case '/multi-backend': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /multi-backend <service1,service2,...>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildMultiBackendPrompt(args.split(',').map(s => s.trim())) };
    }

    case '/multi-frontend': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /multi-frontend <component1,component2,...>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildMultiFrontendPrompt(args.split(',').map(s => s.trim())) };
    }

    // ── Search-First Research ────────────────────────
    case '/search-first': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /search-first <task description>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildSearchFirstPrompt(args, process.cwd()) };
    }

    case '/docs-lookup': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /docs-lookup <query>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildDocsLookupPrompt(args, process.cwd()) };
    }

    // ── Codemaps ─────────────────────────────────────
    case '/codemaps':
    case '/codemap': {
      printCodemapStatus(process.cwd());
      return { handled: true };
    }

    case '/update-codemaps': {
      const map = generateCodeMap(process.cwd());
      saveCodeMap(process.cwd(), map);
      printCodeMap(map);
      console.log(chalk.green('  Codemap updated and saved.'));
      return { handled: true };
    }

    // ── Skill Creation from Git ──────────────────────
    case '/skill-create': {
      return { handled: false, injectPrompt: buildSkillCreatePrompt(process.cwd(), args || undefined) };
    }

    case '/git-patterns': {
      const patterns = analyzeGitPatterns(process.cwd());
      if (patterns.length === 0) {
        console.log(chalk.dim('  No git patterns found. Need a git repo with commit history.'));
      } else {
        printGitPatterns(patterns);
      }
      return { handled: true };
    }

    case '/git-workflow': {
      printGitWorkflowSummary(process.cwd());
      return { handled: true };
    }

    // ── Content Engine ───────────────────────────────
    case '/article': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /article <topic> [--audience <who>] [--tone <tone>]'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildArticlePrompt(args) };
    }

    case '/slides': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /slides <topic> [count]'));
        return { handled: true };
      }
      const slideParts = args.match(/^(.+?)\s+(\d+)$/);
      const slideTopic = slideParts ? slideParts[1] : args;
      const slideCount = slideParts ? parseInt(slideParts[2], 10) : 10;
      return { handled: false, injectPrompt: buildSlidePrompt(slideTopic, slideCount) };
    }

    case '/repurpose': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /repurpose <content description>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildContentRepurposePrompt(args, ['twitter', 'linkedin', 'blog']) };
    }

    case '/market-research': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /market-research <market/topic>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildMarketResearchPrompt(args) };
    }

    case '/investor-deck': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /investor-deck <company description>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildInvestorDeckPrompt(args) };
    }

    case '/investor-outreach': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /investor-outreach <company description>'));
        return { handled: true };
      }
      const outreachParts = args.split('--investor').map(s => s.trim());
      const companyDesc = outreachParts[0] || args;
      const investorName = outreachParts[1] || 'target investor';
      return { handled: false, injectPrompt: buildInvestorOutreachPrompt(investorName, companyDesc) };
    }

    case '/code-quality':
      return { handled: false, injectPrompt: buildCodeQualityPrompt(process.cwd()) };

    case '/skill-stocktake':
      return { handled: false, injectPrompt: buildSkillStocktakePrompt() };

    case '/chief-of-staff': {
      if (!args) {
        console.log(chalk.yellow('  Usage: /chief-of-staff <context/priorities>'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildChiefOfStaffPrompt(args) };
    }

    // ── Hook Controls ────────────────────────────────
    case '/hook-profile':
      printHookControlStatus();
      return { handled: true };

    // ── PM2 Service Management ───────────────────────
    case '/pm2': {
      if (!isPM2Available()) {
        console.log(chalk.yellow('  PM2 not installed. Run: npm install -g pm2'));
        return { handled: true };
      }
      if (!args) {
        console.log(listPM2Services(process.cwd()));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildPM2Prompt(args) };
    }

    // ── Detection ────────────────────────────────────
    case '/detect': {
      const pm = detectPackageManager(process.cwd());
      const tr = detectTestRunner(process.cwd());
      const bt = detectBuildTool(process.cwd());
      console.log(chalk.cyan('\n  Project Detection:'));
      console.log(chalk.dim(`  Package Manager: ${pm.name} (${pm.command})`));
      console.log(chalk.dim(`  Test Runner:     ${tr.name} (${tr.command})`));
      console.log(chalk.dim(`  Build Tool:      ${bt.name} (${bt.command})`));
      console.log();
      return { handled: true };
    }

    // ── Export ────────────────────────────────────────
    case '/export': {
      if (!messages.length) {
        console.log(chalk.yellow('  No conversation to export.'));
        return { handled: true };
      }

      const format: ExportFormat = (args.trim() as ExportFormat) || 'md';
      if (!['md', 'json', 'txt'].includes(format)) {
        console.log(chalk.yellow(`  Unknown format: ${format}. Use: md, json, or txt`));
        return { handled: true };
      }

      const filepath = saveExport(messages, format);
      console.log(chalk.green(`  Exported to: ${filepath}`));
      return { handled: true };
    }

    // ── Walkthrough / guided tour ─────────────────────
    case '/walkthrough':
    case '/tour':
    case '/guide':
      return { handled: false, injectPrompt: buildWalkthroughPrompt() };

    // ── Stitch (Google AI UI/UX design tool) ──────────
    // `/stitch`            → status + tip
    // `/stitch tools`      → live tools/list against the server
    // `/stitch <free-text>` → intent-routed assistant (enhance/generate/list)
    case '/stitch':
    case '/stitch-status':
      if (cmd === '/stitch-status' || !args.trim()) {
        printStitchStatus();
        return { handled: true };
      }
      if (args.trim().toLowerCase() === 'tools' || args.trim().toLowerCase() === '--tools') {
        if (!stitchConfigured()) {
          console.log(chalk.yellow('  Stitch is not configured. Run /stitch-config <api-key>'));
          return { handled: true };
        }
        return { handled: false, injectPrompt: buildStitchToolsPrompt() };
      }
      if (!stitchConfigured()) {
        console.log(chalk.yellow('  Stitch is not configured.'));
        console.log(chalk.dim('  Run: /stitch-config <api-key>  (or set STITCH_API_KEY)'));
        console.log(chalk.dim('  Get a key: https://stitch.withgoogle.com/ → Stitch Settings → API Keys'));
        return { handled: true };
      }
      return { handled: false, injectPrompt: buildStitchPrompt(args) };

    case '/stitch-config': {
      const key = args.trim();
      if (!key) {
        console.log(chalk.yellow('  Usage: /stitch-config <api-key>'));
        console.log(chalk.dim('  Get a key from https://stitch.withgoogle.com/ → Stitch Settings → API Keys'));
        return { handled: true };
      }
      saveStitchConfig(key);
      console.log(chalk.green(`  Stitch API key saved to ~/.crowcoder/stitch.json`));
      console.log(chalk.dim('  The `stitch` tool is now available to the agent.'));
      console.log(chalk.dim('  Restart the REPL for the tool to appear in /tools.'));
      return { handled: true };
    }


    // ── Reset hooks (clear stale entries from old installs) ──
    // Wipes ~/.crowcoder/hooks.json, clears the in-memory quarantine, and
    // re-seeds the ECC default hooks against this install's bin path. Use
    // this when stale dev-machine paths from a prior install are crashing
    // every tool call.
    case '/hooks-reset':
    case '/reset-hooks': {
      saveHooksConfig({ hooks: [] });
      clearQuarantinedHooks();
      console.log(chalk.green('  Hooks cleared. Re-seeding ECC hooks for current install...'));
      try {
        const n = reseedEccHooks();
        console.log(chalk.green(`  Re-seeded ${n} ECC hooks pointing at this install.`));
      } catch (e) {
        console.log(chalk.dim(`  (ECC re-seed skipped: ${e instanceof Error ? e.message : e})`));
      }
      return { handled: true };
    }

    // ── Palette (color theme) ────────────────────────
    // `/palette` (no arg)  → show current + how to list
    // `/palette <id>`      → switch
    // `/palettes`          → list all available palettes with a preview
    case '/palette': {
      const target = args.trim().toLowerCase();
      if (!target) {
        console.log(chalk.dim(`  Current palette: ${getPaletteId()}`));
        console.log(chalk.dim(`  Run /palettes to see all options.`));
        return { handled: true };
      }
      if (!isPaletteId(target)) {
        console.log(chalk.yellow(`  Unknown palette: ${target}`));
        console.log(chalk.dim(`  Run /palettes to see all options.`));
        return { handled: true };
      }
      setPalette(target);
      config.palette = target;
      saveConfig(config);
      console.log(theme.brandBold(`  ${sym.crow} Palette: ${target}`));
      console.log(theme.dim('  Brand · ') + theme.brand('brand') + theme.dim(' · ') + theme.success('success') + theme.dim(' · ') + theme.warning('warning') + theme.dim(' · ') + theme.error('error') + theme.dim(' · ') + theme.command('command'));
      return { handled: true };
    }

    case '/palettes': {
      const cur = getPaletteId();
      console.log(theme.header('\n  Available palettes:'));
      for (const meta of listPalettes()) {
        const marker = meta.id === cur ? theme.brandBold('  ◀ ') : '    ';
        // Build a tiny inline color preview using the palette so the user
        // can see what they'd be switching to. We don't actually call
        // setPalette here — just construct chalk-bound previews manually.
        const p = PALETTES[meta.id];
        const dot = chalk.hex(p.cyan)('●') + chalk.hex(p.magenta)('●') + chalk.hex(p.yellow)('●') + chalk.hex(p.cyanLight)('●') + chalk.hex(p.gray)('●');
        console.log(theme.dim(`${marker}`) + dot + theme.dim('  ') + theme.bright(meta.id.padEnd(18)) + theme.dim(meta.description));
        console.log(theme.dim(`         source: ${meta.source}`));
      }
      console.log(theme.dim('\n  Switch with: /palette <id>\n'));
      return { handled: true };
    }

    // ── Voice / accessibility ────────────────────────
    // /voice                    — show current voice config + status
    // /voice on | off           — master switch
    // /voice config             — interactive setup (asks for keys)
    // /voice test               — synth a short test utterance to verify TTS
    // /voice key stt <KEY>      — set OpenAI key for Whisper STT only
    // /voice key tts <KEY>      — set ElevenLabs key for TTS only
    // /voice echo on | off      — toggle TTS-echo of user input
    // /voice skip-code on|off   — toggle stripping code blocks from TTS
    // /voice speed <n>          — set 0.5..2.0
    case '/voice': {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || '').toLowerCase();
      if (!sub) {
        printVoiceStatus(config);
        return { handled: true };
      }
      if (sub === 'on' || sub === 'off') {
        config.voice = config.voice || {};
        config.voice.enabled = sub === 'on';
        saveConfig(config);
        console.log(chalk.green(`  Voice: ${sub === 'on' ? 'ON' : 'OFF'}`));
        if (sub === 'on') {
          if (!getTtsConfig(config).apiKey) {
            console.log(chalk.yellow('  ⚠ No ElevenLabs key set. Run /voice key tts <KEY> to enable readout.'));
          }
          if (!getSttConfig(config).apiKey) {
            console.log(chalk.yellow('  ⚠ No OpenAI key for Whisper. Run /voice key stt <KEY> to enable dictation.'));
          }
          isFfmpegAvailable().then((ok) => {
            if (!ok) console.log(chalk.yellow('  ⚠ ffmpeg not found on PATH. Install ffmpeg: https://ffmpeg.org/'));
          });
        }
        return { handled: true };
      }
      if (sub === 'config') {
        // Lightweight interactive setup deferred to the prompt — user can
        // also just use `/voice key stt ...` and `/voice key tts ...`.
        console.log(chalk.cyan('\n  /voice config — quick setup'));
        console.log(chalk.dim('    1. Get an OpenAI key for Whisper STT: https://platform.openai.com/api-keys'));
        console.log(chalk.dim('    2. Get an ElevenLabs key for TTS:    https://elevenlabs.io/app/settings/api-keys'));
        console.log(chalk.dim('    3. Run:  /voice key stt <openai-key>'));
        console.log(chalk.dim('             /voice key tts <elevenlabs-key>'));
        console.log(chalk.dim('             /voice on'));
        console.log(chalk.dim('    4. Press F1 to dictate, hear assistant readout automatically.'));
        console.log();
        return { handled: true };
      }
      if (sub === 'key') {
        const target = (parts[1] || '').toLowerCase();
        const key = parts.slice(2).join(' ').trim();
        if ((target !== 'stt' && target !== 'tts') || !key) {
          console.log(chalk.yellow('  Usage: /voice key stt <openai-key>  |  /voice key tts <elevenlabs-key>'));
          return { handled: true };
        }
        config.voice = config.voice || {};
        if (target === 'stt') {
          config.voice.stt = { ...(config.voice.stt || {}), apiKey: key };
          console.log(chalk.green(`  STT key saved (***${key.slice(-4)}).`));
        } else {
          config.voice.tts = { ...(config.voice.tts || {}), apiKey: key };
          console.log(chalk.green(`  TTS key saved (***${key.slice(-4)}).`));
        }
        saveConfig(config);
        return { handled: true };
      }
      if (sub === 'test') {
        const tts = getTtsConfig(config);
        if (!tts.apiKey) {
          console.log(chalk.yellow('  No TTS key. Run /voice key tts <elevenlabs-key> first.'));
          return { handled: true };
        }
        console.log(chalk.dim('  Synthesizing test utterance…'));
        speak('Voice readout is working. This is the assistant voice.', config, { voiceId: tts.assistantVoiceId })
          .then((ok) => console.log(ok ? chalk.green('  ✓ Played.') : chalk.yellow('  ✗ Playback failed — check ffmpeg.')));
        return { handled: true };
      }
      if (sub === 'echo') {
        const v = (parts[1] || '').toLowerCase();
        if (v !== 'on' && v !== 'off') {
          console.log(chalk.yellow('  Usage: /voice echo on|off'));
          return { handled: true };
        }
        config.voice = config.voice || {};
        config.voice.tts = { ...(config.voice.tts || {}), echoUser: v === 'on' };
        saveConfig(config);
        console.log(chalk.green(`  User-echo: ${v.toUpperCase()}`));
        return { handled: true };
      }
      if (sub === 'skip-code') {
        const v = (parts[1] || '').toLowerCase();
        if (v !== 'on' && v !== 'off') {
          console.log(chalk.yellow('  Usage: /voice skip-code on|off'));
          return { handled: true };
        }
        config.voice = config.voice || {};
        config.voice.tts = { ...(config.voice.tts || {}), skipCode: v === 'on' };
        saveConfig(config);
        console.log(chalk.green(`  Skip-code: ${v.toUpperCase()}`));
        return { handled: true };
      }
      if (sub === 'speed') {
        const n = parseFloat(parts[1] || '');
        if (isNaN(n) || n < 0.25 || n > 4.0) {
          console.log(chalk.yellow('  Usage: /voice speed <0.25..4.0>'));
          return { handled: true };
        }
        config.voice = config.voice || {};
        config.voice.tts = { ...(config.voice.tts || {}), speed: n };
        saveConfig(config);
        console.log(chalk.green(`  TTS speed: ${n}x`));
        return { handled: true };
      }
      console.log(chalk.yellow(`  Unknown /voice subcommand: ${sub}`));
      console.log(chalk.dim('  Try: on, off, config, test, key, echo, skip-code, speed'));
      return { handled: true };
    }

    // /dictate — one-shot push-to-talk WITHOUT the F1 hotkey, useful when a
    // user is testing the pipeline or running under a terminal that strips
    // function keys. Records up to 30s, transcribes, injects as next prompt.
    case '/dictate': {
      const maxSec = parseInt(args, 10) || 30;
      console.log(chalk.dim(`  /dictate — recording up to ${maxSec}s…`));
      // Return as an async-injected prompt; we resolve the recording
      // synchronously here for simplicity (REPL is blocking anyway).
      return { handled: true, injectPrompt: '__DICTATE__' + maxSec };
    }

    // /accessibility — show or toggle the accessibility sub-block
    //   /accessibility                  — print status
    //   /accessibility screen-reader on|off
    //   /accessibility cues on|off
    //   /accessibility announce-errors on|off
    //   /accessibility announce-modes  on|off
    //   /accessibility confirm-destructive on|off
    //   /accessibility long-resp <words>
    case '/accessibility':
    case '/a11y': {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || '').toLowerCase();
      const v = (parts[1] || '').toLowerCase();
      if (!sub) {
        printVoiceStatus(config);
        return { handled: true };
      }
      const setBool = (field: 'screenReader' | 'audioCues' | 'announceErrors' | 'announceModeSwitches' | 'askBeforeDestructive', label: string) => {
        if (v !== 'on' && v !== 'off') {
          console.log(chalk.yellow(`  Usage: /accessibility ${sub} on|off`));
          return;
        }
        config.voice = config.voice || {};
        config.voice.accessibility = { ...(config.voice.accessibility || {}), [field]: v === 'on' } as typeof config.voice.accessibility;
        saveConfig(config);
        // Screen-reader mode is special: install/uninstall the stdout filter
        // immediately so the toggle takes effect for the very next log line.
        if (field === 'screenReader') {
          if (v === 'on') installScreenReaderDispatch(applyScreenReader);
          else uninstallScreenReaderDispatch();
        }
        console.log(chalk.green(`  ${label}: ${v.toUpperCase()}`));
      };
      if (sub === 'screen-reader' || sub === 'screenreader' || sub === 'sr') { setBool('screenReader', 'Screen-reader mode'); return { handled: true }; }
      if (sub === 'cues' || sub === 'audio-cues') { setBool('audioCues', 'Audio cues'); return { handled: true }; }
      if (sub === 'announce-errors' || sub === 'errors') { setBool('announceErrors', 'Announce errors'); return { handled: true }; }
      if (sub === 'announce-modes' || sub === 'modes') { setBool('announceModeSwitches', 'Announce mode switches'); return { handled: true }; }
      if (sub === 'confirm-destructive' || sub === 'destructive') { setBool('askBeforeDestructive', 'Ask before destructive'); return { handled: true }; }
      if (sub === 'long-resp' || sub === 'threshold') {
        const n = parseInt(parts[1] || '', 10);
        if (!n || n < 50) {
          console.log(chalk.yellow('  Usage: /accessibility long-resp <words≥50>'));
          return { handled: true };
        }
        config.voice = config.voice || {};
        config.voice.accessibility = { ...(config.voice.accessibility || {}), longResponseThreshold: n };
        saveConfig(config);
        console.log(chalk.green(`  Long-response threshold: ${n} words`));
        return { handled: true };
      }
      console.log(chalk.yellow(`  Unknown /accessibility subcommand: ${sub}`));
      console.log(chalk.dim('  Try: screen-reader, cues, announce-errors, announce-modes, confirm-destructive, long-resp'));
      return { handled: true };
    }

    // ── ECC (everything-claude-code) — no slash commands ───
    // ECC is bundled, free, auto-installed on first launch, and used
    // automatically: built-in commands (/tdd /review /security-review /plan
    // /refactor /build-fix) use ECC prompts; ECC-only workflows
    // (feature-development, add-language-rules, database-migration) are
    // registered as auto-matchable skills — describe what you want and the
    // right workflow prompt injects itself. No /ecc-* slash commands needed.

    // ── Config (trigger wizard) ───────────────────────
    case '/config':
      return { handled: true, shouldExit: false };

    case '/exit':
    case '/quit':
      return { handled: true, shouldExit: true };

    // ── Default: unknown command ──────────────────────────
    default: {
      // Friendly migration aid: if user types any /ecc* command (muscle
      // memory from earlier versions), redirect them to natural language.
      if (cmd.startsWith('/ecc')) {
        console.log(chalk.dim(`  ECC works automatically now — just describe what you want.`));
        console.log(chalk.dim(`  Examples:`));
        console.log(chalk.dim(`    "add a database migration for a users table"`));
        console.log(chalk.dim(`    "implement a feature to export CSV"`));
        console.log(chalk.dim(`    "add typescript coding rules to this project"`));
        return { handled: true };
      }
      console.log(chalk.dim(`  Unknown command: ${cmd}. Type /help`));
      return { handled: true };
    }
  }
}

// ── Main ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  // Initialize subsystems
  initHooksDir();

  // First-run ECC install — silent if already installed, silent if resources missing.
  // Also re-installs when the saved state's version is older than the bundle's
  // BUNDLE_VERSION (so an `npm i -g compact-agent@latest` upgrade picks up the
  // refreshed corpus without manual /reset-hooks).
  const eccState = loadEccState();
  const needsReimport = eccState && eccState.version !== ECC_BUNDLE_VERSION;
  if (eccResourcesAvailable() && (!eccState || needsReimport)) {
    try {
      const report = installEcc({ verbose: false });
      const verb = needsReimport ? `refreshed to v${ECC_BUNDLE_VERSION}` : 'ready';
      console.log(chalk.dim(`  ECC ${verb}: ${report.skills} skills, ${report.agents} agents, ${report.commands + report.prompts} commands, ${report.rules} rule sets.`));
    } catch (err) {
      // Never block startup on ECC failures
      console.log(chalk.dim(`  ECC install skipped: ${err instanceof Error ? err.message : err}`));
    }
  } else if (eccResourcesAvailable() && eccState) {
    // Self-heal stale ECC hook paths on every startup. seedHooks() writes
    // absolute paths derived from __dirname; after a global npm install
    // (or moving the dev tree, or any path change), those paths become
    // invalid and every tool call BLOCKS with a "module not found" error.
    // Re-seeding is idempotent: it strips prior __ecc__-tagged hooks and
    // re-adds them pointing at the CURRENT install path. User-defined
    // hooks (which don't carry the __ecc__ tag) are untouched.
    try {
      const { reseedEccHooks } = await import('./ecc.js');
      reseedEccHooks();
    } catch { /* never block startup on this */ }
  }

  // Load or create config
  let config: CrowcoderConfig;
  if (!configExists()) {
    config = await setupWizard(rl);
  } else {
    config = loadConfig();
  }

  // Apply the user's chosen color palette before anything paints. setPalette
  // mutates the exported `theme` object in place so the banner, prompt, and
  // every subsequent log line render in the right colors.
  if (config.palette) setPalette(config.palette);

  // Install the screen-reader output filter if the user's config has it on.
  // Done as early as possible so every subsequent console.log (banner, hooks,
  // ECC install report, etc.) gets the filter applied uniformly.
  //
  // We also print a one-line notice up front so a sighted user who left this
  // on by accident notices immediately rather than spending five minutes
  // wondering where the colors went.
  if (config.voice?.accessibility?.screenReader) {
    installScreenReaderDispatch(applyScreenReader);
    console.log('[notice] screen-reader mode is ON — ANSI colors are stripped for NVDA/JAWS compatibility. Turn off with: /accessibility screen-reader off');
  }

  // Create session
  const mode = { current: 'dev' as Mode };
  const session = createSession(process.cwd(), config.model, config.provider, mode.current);
  const messages: Message[] = [];

  // Session start hook + memory persistence
  await runHooks({ event: 'SessionStart', sessionId: session.id, cwd: process.cwd() });
  const memoryContext = onSessionStart(session.id, process.cwd());
  if (memoryContext) {
    messages.push({ role: 'system', content: memoryContext });
  }

  // Show startup display based on theme setting
  const themeMode = config.theme || 'full';
  if (themeMode === 'full') {
    // Full mode: banner. ASCII splash removed per user request — both `full`
    // and `compact` themes now render the same banner block.
    printThemedBanner(
      config.provider,
      config.model,
      mode.current,
      config.permissionMode,
      session.id,
      ALL_TOOLS.map((t) => t.name),
    );
  } else if (themeMode === 'compact') {
    // Compact mode: just banner
    printThemedBanner(
      config.provider,
      config.model,
      mode.current,
      config.permissionMode,
      session.id,
      ALL_TOOLS.map((t) => t.name),
    );
  } else {
    // Minimal mode: just a one-liner
    console.log(theme.brandBold('Compact Agent v1.1.0') + theme.dim(' — A dense, feature-rich AI coding agent'));
    console.log('');
  }

  let autoRoute = false;

  // ── F-key hotkey listener ────────────────────────────────
  // Voice / accessibility hotkeys — all on the F-row.
  //
  // The right-side block (INS/HOME/PGUP/DEL/END/PGDN) was the previous
  // home for these keys, but INS is the default NVDA + JAWS modifier and
  // binding it intercepts screen-reader commands. Bare F-keys are the
  // most screen-reader-safe option: NVDA, JAWS, and VoiceOver all reserve
  // INS+F-key or VO+F-key combos, never bare F-keys.
  //
  // The listener is global and fires regardless of REPL state — during
  // rl.question() prompt waits, slash-command execution, streaming, and
  // tool calls. suppressInputDuringStream() in query.ts only adds an
  // additional 'data' listener that swallows echo; it doesn't unbind the
  // 'keypress' event source. So these hotkeys work in every context.
  //
  //   Status (instant, no waiting):
  //     F1   current activity + elapsed   ("calling claude-sonnet-4, 8s")
  //     F2   where am I — model/provider/mode/permissions
  //     F3   re-speak full last response (bypasses summary)
  //     F4   re-speak summary of last response
  //
  //   Dictation + playback:
  //     F5   push-to-talk dictation (toggle: first press starts, second stops)
  //     F6   pause TTS playback
  //     F7   replay last spoken chunk
  //     F8   skip the current chunk
  //     F9   speed up TTS  (× 1.25, capped at 2.0)
  //     F10  slow down TTS (× 0.8,  floored at 0.5)
  //
  // All keys are no-ops when voice is off, so installing the listener
  // unconditionally is safe and lets the user enable voice mid-session
  // without restarting.
  let dictateController: RecordController | null = null;
  let dictateActive = false;

  // Track aborts + last-spoken text so query.ts can hand them off here.
  (globalThis as { __voicePlaybackCtl?: AbortController | null }).__voicePlaybackCtl = null;
  (globalThis as { __voiceLastChunk?: string | null }).__voiceLastChunk = null;
  (globalThis as { __voiceLastFullResponse?: string | null }).__voiceLastFullResponse = null;

  // emitKeypressEvents lives on the callback-flavor 'node:readline' module
  // (the promises variant doesn't expose it). Some platforms / terminals
  // don't deliver every F-key — failure here is a silent no-op; users can
  // fall back to /dictate and /voice slash commands.
  try {
    const readlineCb = await import('node:readline');
    const { describeStatus, describeLocation } = await import('./status.js');
    readlineCb.emitKeypressEvents(stdin);

    // Set of keys we intercept. Anything not in this set falls through to
    // readline so normal typing isn't affected. All bare F-keys; no
    // modifiers needed, no screen-reader conflicts.
    const INTERCEPT = new Set([
      'f1', 'f2', 'f3', 'f4',                  // status announcements
      'f5', 'f6', 'f7', 'f8', 'f9', 'f10',     // dictation + playback
    ]);

    // Define the hotkey listener as a NAMED, TAGGED function so
    // suppressInputDuringStream() in query.ts can isolate it among stdin's
    // 'keypress' listeners. During streaming we detach readline's own
    // keypress listener (to prevent echo + line-buffer pollution) while
    // keeping this one attached so F1–F10 keep working mid-response.
    const hotkeyListener = function hotkeyListener(_str: string, key: { name?: string }): void {
      if (!key) return;
      const name = String(key.name || '').toLowerCase();
      if (!INTERCEPT.has(name)) return;

      const a = getAccessibilityConfig(config);
      const tts = getTtsConfig(config);

      // F1–F4 are STATUS hotkeys. They always work, even when voice is off
      // and even when there's no TTS key — they print the status line to
      // stdout regardless. TTS is only added on top when a key is present.
      // The whole point of these keys is "tell me what's happening", which
      // is just as useful via text + screen reader as via voice.
      const isStatusKey = name === 'f1' || name === 'f2' || name === 'f3' || name === 'f4';

      // F5–F10 are DICTATION/PLAYBACK hotkeys — they only make sense when
      // voice features are enabled. Bail early to avoid spurious ffmpeg
      // spawns and "TTS not configured" log lines.
      if (!isStatusKey && !isVoiceEnabled(config)) return;

      // ── F5: push-to-talk dictation toggle ──────────────
      if (name === 'f5') {
        if (dictateActive) {
          dictateActive = false;
          const ctl = dictateController;
          dictateController = null;
          if (!ctl) return;
          (async () => {
            if (a.audioCues) await audioCue('recording-stop');
            const buf = await ctl.stop();
            if (!buf) {
              console.log(chalk.dim('  [F5] no audio captured.'));
              return;
            }
            if (a.audioCues) await audioCue('processing');
            const { transcribeAudio } = await import('./voice.js');
            const { setStatus } = await import('./status.js');
            setStatus({ state: 'transcribing' });
            const transcript = await transcribeAudio(buf, config, 'wav');
            setStatus({ state: 'idle' });
            if (!transcript) {
              console.log(chalk.dim('  [F5] transcription failed.'));
              if (a.audioCues) await audioCue('error');
              return;
            }
            if (a.audioCues) await audioCue('done');
            const stt = getSttConfig(config);
            stdin.write(transcript);
            if (stt.autoSubmit) stdin.write('\n');
          })();
        } else {
          (async () => {
            // Probe the mic FIRST so a missing-device case fails fast with
            // a clear message + audio cue, instead of silently spawning a
            // zombie ffmpeg in the background.
            const probe = await probeMic();
            if (probe !== 'ok') {
              const msg = micProbeMessage(probe);
              console.log(chalk.yellow(`  [F5] ${msg}`));
              if (a.audioCues) await audioCue('error');
              if (tts.apiKey) {
                speak(msg, config, { voiceId: tts.assistantVoiceId }).catch(() => { /* noop */ });
              }
              return;
            }
            const ctl = await startRecording(60);
            if (!ctl) {
              console.log(chalk.yellow('  [F5] could not start mic capture.'));
              return;
            }
            dictateController = ctl;
            dictateActive = true;
            const { setStatus } = await import('./status.js');
            setStatus({ state: 'recording' });
            if (a.audioCues) await audioCue('recording-start');
            console.log(chalk.dim('  [F5] recording — press F5 again to stop.'));
          })();
        }
        return;
      }

      // ── F6: pause TTS ──────────────────────────────────
      if (name === 'f6') {
        const g = globalThis as { __voicePlaybackCtl?: AbortController | null };
        if (g.__voicePlaybackCtl && !g.__voicePlaybackCtl.signal.aborted) {
          g.__voicePlaybackCtl.abort();
          console.log(chalk.dim('  [F6] TTS paused.'));
        }
        return;
      }

      // ── F7: replay last chunk ──────────────────────────
      if (name === 'f7') {
        const g = globalThis as { __voiceLastChunk?: string | null };
        const chunk = g.__voiceLastChunk;
        if (!chunk) {
          console.log(chalk.dim('  [F7] nothing to replay.'));
          return;
        }
        if (!tts.apiKey) return;
        (async () => { await speak(chunk, config, { voiceId: tts.assistantVoiceId }); })();
        return;
      }

      // ── F8: skip current chunk ─────────────────────────
      if (name === 'f8') {
        const g = globalThis as { __voicePlaybackCtl?: AbortController | null };
        if (g.__voicePlaybackCtl) g.__voicePlaybackCtl.abort();
        console.log(chalk.dim('  [F8] TTS skipped.'));
        return;
      }

      // ── F9 / F10: TTS speed ±  ─────────────────────────
      if (name === 'f9' || name === 'f10') {
        config.voice = config.voice || {};
        const ttsCfg = config.voice.tts = { ...(config.voice.tts || {}) };
        const cur = ttsCfg.speed ?? 1.0;
        const next = name === 'f9' ? Math.min(2.0, cur * 1.25) : Math.max(0.5, cur * 0.8);
        ttsCfg.speed = Math.round(next * 100) / 100;
        saveConfig(config);
        console.log(chalk.dim(`  [${name.toUpperCase()}] TTS speed: ${ttsCfg.speed}x`));
        return;
      }

      // ── F1: "what's happening?" — current activity + elapsed ───
      if (name === 'f1') {
        const msg = describeStatus();
        console.log(chalk.dim(`  [F1] ${msg}`));
        if (tts.apiKey) {
          speak(msg, config, { voiceId: tts.assistantVoiceId }).catch(() => { /* noop */ });
        }
        return;
      }

      // ── F2: "where am I?" — model/provider/mode/permissions ────
      if (name === 'f2') {
        const msg = describeLocation();
        console.log(chalk.dim(`  [F2] ${msg}`));
        if (tts.apiKey) {
          speak(msg, config, { voiceId: tts.assistantVoiceId }).catch(() => { /* noop */ });
        }
        return;
      }

      // ── F3: re-speak FULL last response ────────────────
      if (name === 'f3') {
        const g = globalThis as { __voiceLastFullResponse?: string | null };
        const text = g.__voiceLastFullResponse;
        if (!text) {
          console.log(chalk.dim('  [F3] nothing to read.'));
          return;
        }
        // Always print a short marker so the screen reader has something
        // to announce. Then add TTS playback on top if a key is configured.
        console.log(chalk.dim(`  [F3] reading full last response (${text.length} chars).`));
        if (!tts.apiKey) return;
        (async () => {
          const { speakAssistantResponse } = await import('./voice.js');
          const ctl = new AbortController();
          (globalThis as { __voicePlaybackCtl?: AbortController | null }).__voicePlaybackCtl = ctl;
          await speakAssistantResponse(text, config, ctl.signal);
        })();
        return;
      }

      // ── F4: re-speak SUMMARY of last response ──────────
      if (name === 'f4') {
        const g = globalThis as { __voiceLastFullResponse?: string | null };
        const text = g.__voiceLastFullResponse;
        if (!text) {
          console.log(chalk.dim('  [F4] nothing to summarize.'));
          return;
        }
        const summary = summarize(text, a.longResponseThreshold);
        // Print the summary itself so it's reachable via screen reader
        // even without an ElevenLabs key.
        console.log(chalk.dim('  [F4] summary:'));
        console.log(chalk.white('  ' + summary));
        if (!tts.apiKey) return;
        (async () => {
          const ctl = new AbortController();
          (globalThis as { __voicePlaybackCtl?: AbortController | null }).__voicePlaybackCtl = ctl;
          await speak(summary, config, { voiceId: tts.assistantVoiceId, signal: ctl.signal });
        })();
        return;
      }
    };
    // Tag so suppressInputDuringStream() can identify and preserve this
    // specific listener while detaching readline's own keypress handler.
    (hotkeyListener as unknown as { __crowcoderHotkey__: boolean }).__crowcoderHotkey__ = true;
    stdin.on('keypress', hotkeyListener);
  } catch {
    // No keypress support — accessibility users can still use /dictate.
  }

  // Session-start anchor — used by the [Nm Ns] tag prepended to every prompt
  // so the user can see at a glance how long the REPL has been open. Combined
  // with the per-chain timer printed after each model response (see runQuery),
  // gives both "how long am I here" and "how long was that last response."
  const sessionStartMs = new Date(session.createdAt).getTime();

  // Main REPL loop
  while (true) {
    let input: string;
    try {
      // Screen-reader-aware prompt construction:
      //   - The Unicode prompt glyph (❯) gets re-substituted by the
      //     symbol→word filter on EVERY readline redraw (one per keystroke),
      //     so the screen reader hears "prompt h", "prompt he", "prompt hel"
      //     as the user types. Use plain ASCII to avoid the substitution.
      //   - The session timer ([5s] …) changes every second and adds
      //     redraw churn the user can already get on-demand via F1.
      //   - The mode tag is preserved because mode info is genuinely useful
      //     contextual signal that doesn't tick.
      const screenReader = config.voice?.accessibility?.screenReader === true;
      const sessionTag = screenReader
        ? ''
        : theme.dim(`[${formatDuration(Date.now() - sessionStartMs)}] `);
      const modeTag = mode.current !== 'dev' ? theme.dim(`[${mode.current}] `) : '';
      const promptGlyph = screenReader ? '> ' : `${sym.prompt} `;
      input = await rl.question(sessionTag + modeTag + theme.prompt(promptGlyph));
    } catch {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // Shell escape
    if (trimmed.startsWith('!')) {
      const { exec } = await import('node:child_process');
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        exec(cmd, { cwd: process.cwd(), maxBuffer: 5 * 1024 * 1024 }, (_err, out, err) => {
          if (out) console.log(out);
          if (err) console.error(chalk.yellow(err));
          if (_err && !out && !err) console.error(chalk.red(_err.message));
        });
      }
      continue;
    }

    // Slash commands
    if (trimmed.startsWith('/')) {
      const result = handleSlashCommand(trimmed, config, messages, session, mode);
      if (result.shouldExit) break;
      if (result.newMessages !== undefined) {
        messages.length = 0;
        messages.push(...result.newMessages);
      }
      if (trimmed.startsWith('/config') && !result?.shouldExit) {
        config = await setupWizard(rl);
        resetClient();
        printThemedBanner(
          config.provider,
          config.model,
          mode.current,
          config.permissionMode,
          session.id,
          ALL_TOOLS.map((t) => t.name),
        );
        continue;
      }
      if (trimmed === '/route') {
        autoRoute = true;
        continue;
      }
      // Some commands inject a prompt into the conversation (e.g. /commit, /review, /tdd)
      if (result.injectPrompt) {
        // Special-case the /dictate flow: synthesize the prompt from the mic
        // before pushing it as a user message. We use the sentinel
        // "__DICTATE__<seconds>" so the slash handler stays purely sync.
        if (result.injectPrompt.startsWith('__DICTATE__')) {
          const maxSec = parseInt(result.injectPrompt.slice('__DICTATE__'.length), 10) || 30;
          const transcript = await dictateOnce(config, maxSec);
          if (!transcript) {
            console.log(chalk.dim('  [dictate] no transcript captured.'));
            continue;
          }
          console.log(theme.dim('  [dictate] ') + chalk.white(transcript));
          messages.push({ role: 'user', content: transcript });
        } else {
          messages.push({ role: 'user', content: result.injectPrompt });
        }
        await runQuery({ config, messages, cwd: process.cwd(), rl, sessionId: session.id, mode: mode.current });
        await autoSave(session, messages);
        continue;
      }
      if (result.handled) continue;
    }

    // Auto-route model if enabled
    if (autoRoute) {
      const complexity = classifyComplexity(trimmed);
      const route = routeModel(config, complexity);
      if (route.model !== config.model) {
        console.log(chalk.dim(`  [routing: ${route.reason}]`));
        config.model = route.model;
        resetClient();
      }
      autoRoute = false;
    }

    // Add user message and run query
    messages.push({ role: 'user', content: trimmed });

    await runQuery({
      config,
      messages,
      cwd: process.cwd(),
      rl,
      sessionId: session.id,
      mode: mode.current,
    });

    // Auto-save session
    await autoSave(session, messages);

    // Strategic compaction check
    const compactionHint = shouldSuggestCompaction(messages, 0);
    if (compactionHint) {
      console.log(chalk.yellow(`  ⚡ ${compactionHint.reason} (strategy: ${compactionHint.strategy}, ~${compactionHint.estimatedSavings.toLocaleString()} tokens saveable)`));
    }
  }

  // Session stop hook + memory persistence
  onSessionEnd(session.id, messages, process.cwd());
  await runHooks({ event: 'SessionStop', sessionId: session.id, cwd: process.cwd() });

  // Final save
  await autoSave(session, messages);
  console.log(chalk.dim(`\nSession saved: ${session.id}`));
  console.log(chalk.dim('Goodbye!\n'));
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message || err}`));
  process.exit(1);
});
