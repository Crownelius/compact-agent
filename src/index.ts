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
import { initHooksDir, runHooks, listHooks } from './hooks.js';
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
import { printBanner as printThemedBanner, printSplash, theme, sym } from './theme.js';
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
  installEcc, printEccStatus, printEccSkills, printEccAgents, printEccCommandList,
  getEccCommandPrompt, listEccCommands, loadEccState, eccResourcesAvailable,
} from './ecc.js';
// Walkthrough — agent-led tour of Crowcoder (/walkthrough, /tour, /guide)
import { buildWalkthroughPrompt } from './walkthrough.js';
// Stitch (Google's AI UI/UX design tool) — /stitch, /stitch-config, /stitch-tools
import { buildStitchPrompt, buildStitchToolsPrompt, saveStitchConfig, printStitchStatus, stitchConfigured } from './stitch.js';

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

  const config: CrowcoderConfig = {
    apiKey,
    baseURL,
    model,
    provider: provider.name,
    maxTokens: 8192,
    temperature: 0.3,
    permissionMode: permMode,
  };

  saveConfig(config);
  console.log(chalk.green(`\n  Config saved to ${getConfigDir()}/config.json\n`));
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
      console.log(h('\n  ── General ──'));
      console.log(d('  ') + c('/help') + d('             — this help'));
      console.log(d('  ') + c('/config') + d('           — reconfigure provider/model/key'));
      console.log(d('  ') + c('/theme [mode]') + d('     — toggle display mode (full/compact/minimal)'));
      console.log(d('  ') + c('/clear') + d('            — clear conversation'));
      console.log(d('  ') + c('/history') + d('          — message count & token estimate'));
      console.log(d('  ') + c('/export [fmt]') + d('     — export conversation (md/json/txt)'));
      console.log(d('  ') + c('/exit') + d('             — quit (alias: /quit)'));
      console.log(d('  ') + c('/walkthrough') + d('      — agent-led tour of Crowcoder (aliases: /tour, /guide)'));
      console.log(d('  ') + c('!<cmd>') + d('            — run shell command directly'));
      console.log(h('\n  ── Model & Provider ──'));
      console.log(d('  ') + c('/model [name]') + d('     — switch or show model'));
      console.log(d('  ') + c('/models') + d('           — list available models for provider'));
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
      console.log(d('  ') + c('/perm <mode>') + d('      — set permission mode'));
      console.log(d('  ') + c('/dry-run') + d('          — toggle dry-run mode'));
      console.log(d('  ') + c('/thinking') + d('         — toggle thinking/reasoning display'));
      console.log(d('  ') + c('/cd <path>') + d('        — change directory'));
      console.log(d('  ') + c('/hooks') + d('            — list configured hooks'));
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
      console.log(d('  ') + c('/skills') + d('           — list learned skills'));
      console.log(d('  ') + c('/memory') + d('           — show memory status'));
      console.log(d('  ') + c('/users') + d('           — manage users table'));
      console.log(d('  ') + c('/count [inc|dec|reset]') + d(' — increment/decrement/reset counter'));
      console.log(d('  ') + c('/detect') + d('           — detect package manager, test runner, build tool'));
      console.log(d('  ') + c('/hook-profile') + d('     — show hook profile & controls'));
      console.log(d('  ') + c('/pm2 [action]') + d('     — PM2 service management'));
      console.log(h('\n  ── ECC (everything-claude-code) ──'));
      console.log(d('  ECC is bundled + auto-installed on first launch. ') + c('/tdd /review /security-review'));
      console.log(d('  /plan /refactor /build-fix') + d(' all use ECC prompts automatically.'));
      console.log(d('  ') + c('/ecc') + d('              — status; ') + c('/ecc refresh') + d(' re-installs from bundled resources'));
      console.log(d('  ') + c('/ecc-feature-development') + d(' — feature implementation workflow (ECC-only)'));
      console.log(d('  ') + c('/ecc-add-language-rules') + d('  — add language-specific rule files (ECC-only)'));
      console.log(d('  ') + c('/ecc-database-migration') + d('  — database migration workflow (ECC-only)'));
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
      }
      return { handled: true };

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

    case '/memory':
      printMemoryStatus();
      return { handled: true };

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


    // ── ECC (everything-claude-code) ──────────────────
    // ECC is bundled and auto-installed on first launch. Surface commands
    // collapsed: `/ecc` shows status; `/ecc refresh` re-installs from bundled
    // resources. The old `/ecc-install`, `/ecc-skills`, `/ecc-agents`,
    // `/ecc-commands` still work as silent aliases for muscle memory but
    // aren't listed in /help (use /skills for the full skill list, which
    // already includes ECC entries).
    case '/ecc': {
      const sub = args.trim().toLowerCase();
      if (sub === 'refresh' || sub === '--refresh' || sub === 'reinstall') {
        if (!eccResourcesAvailable()) {
          console.log(chalk.yellow('  ECC resources not bundled with this Crowcoder install.'));
          return { handled: true };
        }
        const report = installEcc({ verbose: true });
        if (report.errors.length > 5) {
          console.log(chalk.dim(`  +${report.errors.length - 5} more errors suppressed.`));
        }
        return { handled: true };
      }
      if (sub === 'skills') { printEccSkills(); return { handled: true }; }
      if (sub === 'agents') { printEccAgents(); return { handled: true }; }
      if (sub === 'commands') { printEccCommandList(); return { handled: true }; }
      printEccStatus();
      return { handled: true };
    }

    // Backwards-compat aliases — hidden from /help but still functional.
    case '/ecc-install': {
      if (!eccResourcesAvailable()) {
        console.log(chalk.yellow('  ECC resources not bundled with this Crowcoder install.'));
        return { handled: true };
      }
      const report = installEcc({ verbose: true });
      if (report.errors.length > 5) {
        console.log(chalk.dim(`  +${report.errors.length - 5} more errors suppressed.`));
      }
      return { handled: true };
    }
    case '/ecc-skills':
      printEccSkills();
      return { handled: true };
    case '/ecc-agents':
      printEccAgents();
      return { handled: true };
    case '/ecc-commands':
      printEccCommandList();
      return { handled: true };

    // ── Config (trigger wizard) ───────────────────────
    case '/config':
      return { handled: true, shouldExit: false };

    case '/exit':
    case '/quit':
      return { handled: true, shouldExit: true };

    // ── Default: ECC dynamic dispatch + unknown command ──
    default: {
      if (cmd.startsWith('/ecc-')) {
        const eccName = cmd.slice('/ecc-'.length);
        const prompt = getEccCommandPrompt(eccName);
        if (prompt) {
          const merged = args.trim()
            ? `${prompt}\n\n## User Input\n\n${args}`
            : prompt;
          return { handled: false, injectPrompt: merged };
        }
        const available = listEccCommands();
        console.log(chalk.yellow(`  Unknown ECC command: ${cmd}`));
        if (available.length) {
          console.log(chalk.dim(`  Available: ${available.map(c => `/ecc-${c}`).join(', ')}`));
        }
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

  // First-run ECC install — silent if already installed, silent if resources missing
  if (eccResourcesAvailable() && !loadEccState()) {
    try {
      const report = installEcc({ verbose: false });
      console.log(chalk.dim(`  ECC ready: ${report.skills} skills, ${report.agents} agents, ${report.commands + report.prompts} commands, ${report.rules} rule sets.`));
    } catch (err) {
      // Never block startup on ECC failures
      console.log(chalk.dim(`  ECC install skipped: ${err instanceof Error ? err.message : err}`));
    }
  }

  // Load or create config
  let config: CrowcoderConfig;
  if (!configExists()) {
    config = await setupWizard(rl);
  } else {
    config = loadConfig();
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
    // Full mode: splash + banner
    printSplash();
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

  // Main REPL loop
  while (true) {
    let input: string;
    try {
      const modeTag = mode.current !== 'dev' ? theme.dim(`[${mode.current}] `) : '';
      input = await rl.question(modeTag + theme.prompt(`${sym.prompt} `));
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
        messages.push({ role: 'user', content: result.injectPrompt });
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
