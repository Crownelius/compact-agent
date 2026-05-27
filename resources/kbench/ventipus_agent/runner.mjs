#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const startedAt = Date.now();

function emit(output) {
  process.stdout.write(JSON.stringify(output));
}

function fail(status, message, extra = {}) {
  emit({
    ok: false,
    status,
    failureKind: status,
    finalText: message,
    elapsedMs: Date.now() - startedAt,
    artifacts: [],
    error: { message },
    ...extra,
  });
}

function readInput() {
  const inputPath = process.env.KBENCH_ADAPTER_INPUT;
  const raw = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function redact(text) {
  return String(text || '')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, 'sk-or-v1-[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-[REDACTED]')
    .replace(/hf_[A-Za-z0-9]{16,}/g, 'hf_[REDACTED]')
    .replace(/KGAT_[A-Za-z0-9]{16,}/g, 'KGAT_[REDACTED]')
    .replace(/npm_[A-Za-z0-9]{16,}/g, 'npm_[REDACTED]');
}

function truncate(text, max) {
  const safe = redact(text);
  if (safe.length <= max) return safe;
  return `${safe.slice(0, max - 80)}\n...[truncated ${safe.length - (max - 80)} chars]`;
}

function splitCommand(command) {
  const parts = [];
  let cur = '';
  let quote = null;
  let escaped = false;
  for (const ch of command.trim()) {
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        parts.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function profileForBenchmark(benchmark) {
  if (benchmark === 'swe') return 'swe-bench';
  if (benchmark === 'tb2') return 'terminal-bench';
  return 'generic';
}

function collectTraceRefs(traceDir) {
  const refs = [];
  if (!traceDir || !existsSync(traceDir)) return refs;
  const stack = [traceDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === 'summary.json' || entry.name === 'trace.jsonl') {
        refs.push({
          kind: entry.name === 'trace.jsonl' ? 'ventipus-tool-trace' : 'ventipus-summary',
          path: full,
          contentType: entry.name.endsWith('.jsonl') ? 'application/jsonl' : 'application/json',
          description: `ventipus ${entry.name}`,
        });
      }
    }
  }
  return refs;
}

function readLatestTraceSummary(traceDir) {
  if (!traceDir || !existsSync(traceDir)) return null;
  const summaries = [];
  const stack = [traceDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === 'summary.json') {
        try {
          const summary = JSON.parse(readFileSync(full, 'utf8'));
          const endedAtMs = Number.isFinite(Date.parse(summary.endedAt)) ? Date.parse(summary.endedAt) : 0;
          const mtimeMs = statSync(full).mtimeMs;
          summaries.push({ path: full, summary, sortKey: endedAtMs || mtimeMs });
        } catch {
          // Ignore malformed or partially-written trace summaries.
        }
      }
    }
  }
  summaries.sort((a, b) => b.sortKey - a.sortKey);
  return summaries[0] || null;
}

function compactTraceSummary(traceSummary) {
  if (!traceSummary) return undefined;
  const summary = traceSummary.summary || {};
  const quality = summary.trajectoryQuality || {};
  return {
    path: traceSummary.path,
    verificationCount: summary.verificationCount,
    verificationCommands: Array.isArray(summary.verificationCommands) ? summary.verificationCommands.slice(0, 20) : [],
    verificationEvidence: summary.verificationEvidence,
    finalAnswerEvidence: summary.finalAnswerEvidence,
    usage: summary.usage,
    changedFiles: Array.isArray(summary.changedFiles) ? summary.changedFiles.slice(0, 100) : [],
    worktreeChangedFiles: Array.isArray(summary.worktreeChangedFiles) ? summary.worktreeChangedFiles.slice(0, 100) : [],
    artifacts: Array.isArray(summary.artifacts) ? summary.artifacts.slice(0, 20) : [],
    trajectoryQuality: {
      benchmarkContextUsed: quality.benchmarkContextUsed,
      usageCallCount: quality.usageCallCount,
      usageTotalTokens: quality.usageTotalTokens,
      usageEstimatedCostUsd: quality.usageEstimatedCostUsd,
      costEfficiencyRisk: quality.costEfficiencyRisk,
      invalidToolActionCount: quality.invalidToolActionCount,
      invalidToolActionPercent: quality.invalidToolActionPercent,
      invalidToolActionEvents: Array.isArray(quality.invalidToolActionEvents) ? quality.invalidToolActionEvents.slice(0, 20) : [],
      localizationBeforeFirstEdit: quality.localizationBeforeFirstEdit,
      failingReproductionBeforeFirstEdit: quality.failingReproductionBeforeFirstEdit,
      passingValidationAfterFirstEdit: quality.passingValidationAfterFirstEdit,
      validationAfterLastEdit: quality.validationAfterLastEdit,
      passingValidationAfterLastEdit: quality.passingValidationAfterLastEdit,
      finalEditVerificationCount: quality.finalEditVerificationCount,
      finalEditPassingVerificationCount: quality.finalEditPassingVerificationCount,
      stableValidationAfterLastEdit: quality.stableValidationAfterLastEdit,
      broadValidationAfterLastEdit: quality.broadValidationAfterLastEdit,
      passingBroadValidationAfterLastEdit: quality.passingBroadValidationAfterLastEdit,
      successfulVerificationCount: quality.successfulVerificationCount,
      failedVerificationCount: quality.failedVerificationCount,
      incompleteVerifierCount: quality.incompleteVerifierCount,
      incompleteVerifierEvents: Array.isArray(quality.incompleteVerifierEvents) ? quality.incompleteVerifierEvents.slice(0, 20) : [],
      inconclusiveVerifierEvents: Array.isArray(quality.inconclusiveVerifierEvents) ? quality.inconclusiveVerifierEvents.slice(0, 20) : [],
      environmentSetupFailureCount: quality.environmentSetupFailureCount,
      environmentSetupFailureEvents: Array.isArray(quality.environmentSetupFailureEvents) ? quality.environmentSetupFailureEvents.slice(0, 20) : [],
      unresolvedEnvironmentSetupFailureCount: quality.unresolvedEnvironmentSetupFailureCount,
      unresolvedEnvironmentSetupFailureEvents: Array.isArray(quality.unresolvedEnvironmentSetupFailureEvents) ? quality.unresolvedEnvironmentSetupFailureEvents.slice(0, 20) : [],
      environmentSetupCount: quality.environmentSetupCount,
      successfulEnvironmentSetupCount: quality.successfulEnvironmentSetupCount,
      environmentSetupEvents: Array.isArray(quality.environmentSetupEvents) ? quality.environmentSetupEvents.slice(0, 20) : [],
      skillViewCount: quality.skillViewCount,
      skillViewEvents: Array.isArray(quality.skillViewEvents) ? quality.skillViewEvents.slice(0, 20) : [],
      skillNames: Array.isArray(quality.skillNames) ? quality.skillNames.slice(0, 20) : [],
      skillLoadedBeforeLocalContext: quality.skillLoadedBeforeLocalContext,
      excessiveSkillViewCount: quality.excessiveSkillViewCount,
      ciWorkflowCommandCount: quality.ciWorkflowCommandCount,
      ciVerifierCommands: Array.isArray(quality.ciVerifierCommands) ? quality.ciVerifierCommands.slice(0, 20) : [],
      ciValidationAfterFirstEdit: quality.ciValidationAfterFirstEdit,
      passingCiValidationAfterFirstEdit: quality.passingCiValidationAfterFirstEdit,
      ciValidationAfterLastEdit: quality.ciValidationAfterLastEdit,
      passingCiValidationAfterLastEdit: quality.passingCiValidationAfterLastEdit,
      firstCiValidationAfterFirstEditSeq: quality.firstCiValidationAfterFirstEditSeq,
      sourceResearchCoverage: quality.sourceResearchCoverage,
      taskContractSignalCount: quality.taskContractSignalCount,
      taskContractChecklistUsed: quality.taskContractChecklistUsed,
      taskContractChecklistAfterContext: quality.taskContractChecklistAfterContext,
      taskContractChecklistComplete: quality.taskContractChecklistComplete,
      latestTodoSeq: quality.latestTodoSeq,
      todoIncompleteCount: quality.todoIncompleteCount,
      todoIncompleteItems: Array.isArray(quality.todoIncompleteItems) ? quality.todoIncompleteItems.slice(0, 20) : [],
      noEditContractDetected: quality.noEditContractDetected,
      editAfterNoEditContract: quality.editAfterNoEditContract,
      lastEditSeq: quality.lastEditSeq,
      editTargetCount: quality.editTargetCount,
      localizedEditTargetCount: quality.localizedEditTargetCount,
      unlocalizedEditTargetEvents: Array.isArray(quality.unlocalizedEditTargetEvents) ? quality.unlocalizedEditTargetEvents.slice(0, 20) : [],
      broadEditContractDetected: quality.broadEditContractDetected,
      largeEditSurfaceTargetCount: quality.largeEditSurfaceTargetCount,
      largeEditSurfaceTargets: Array.isArray(quality.largeEditSurfaceTargets) ? quality.largeEditSurfaceTargets.slice(0, 40) : [],
      redundantToolCallCount: quality.redundantToolCallCount,
      redundantToolCallEvents: Array.isArray(quality.redundantToolCallEvents) ? quality.redundantToolCallEvents.slice(0, 20) : [],
      redundantVerifierCount: quality.redundantVerifierCount,
      redundantVerifierEvents: Array.isArray(quality.redundantVerifierEvents) ? quality.redundantVerifierEvents.slice(0, 20) : [],
      blindRepairCount: quality.blindRepairCount,
      blindRepairEvents: Array.isArray(quality.blindRepairEvents) ? quality.blindRepairEvents.slice(0, 20) : [],
      postEditRegressionCycleCount: quality.postEditRegressionCycleCount,
      postEditRegressionCycleEvents: Array.isArray(quality.postEditRegressionCycleEvents) ? quality.postEditRegressionCycleEvents.slice(0, 20) : [],
      scratchArtifactPermissionDetected: quality.scratchArtifactPermissionDetected,
      scratchArtifactEvents: Array.isArray(quality.scratchArtifactEvents) ? quality.scratchArtifactEvents.slice(0, 20) : [],
      postEditDiffReview: quality.postEditDiffReview,
      diffReviewAfterLastEdit: quality.diffReviewAfterLastEdit,
      firstPostEditDiffReviewSeq: quality.firstPostEditDiffReviewSeq,
      firstDiffReviewAfterLastEditSeq: quality.firstDiffReviewAfterLastEditSeq,
      broadValidationAfterFirstEdit: quality.broadValidationAfterFirstEdit,
      passingBroadValidationAfterFirstEdit: quality.passingBroadValidationAfterFirstEdit,
      firstBroadValidationAfterFirstEditSeq: quality.firstBroadValidationAfterFirstEditSeq,
      lastPostEditVerificationSeq: quality.lastPostEditVerificationSeq,
      lastPostEditVerificationStatus: quality.lastPostEditVerificationStatus,
      lastPostEditVerificationConclusiveFailure: quality.lastPostEditVerificationConclusiveFailure,
      firstConclusiveFailedVerificationSeq: quality.firstConclusiveFailedVerificationSeq,
      testEditPermissionDetected: quality.testEditPermissionDetected,
      testHarnessEditEvents: Array.isArray(quality.testHarnessEditEvents) ? quality.testHarnessEditEvents.slice(0, 20) : [],
      processScore: quality.processScore,
      processDefects: Array.isArray(quality.processDefects) ? quality.processDefects.slice(0, 20) : [],
      warnings: Array.isArray(quality.warnings) ? quality.warnings.slice(0, 20) : [],
    },
  };
}

function collectGitArtifactRefs(workdir, artifactRoot) {
  const refs = [];
  if (!workdir || !existsSync(workdir)) return refs;

  const gitCheck = spawnSync('git', ['-C', workdir, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  if (gitCheck.status !== 0 || !String(gitCheck.stdout || '').trim().startsWith('true')) {
    return refs;
  }

  const diff = buildWorktreePatch(workdir);
  if (diff.trim()) {
    const patchPath = join(artifactRoot, 'ventipus.patch');
    writeFileSync(patchPath, redact(diff), 'utf8');
    refs.push({
      kind: 'patch',
      path: patchPath,
      contentType: 'text/x-diff',
      description: 'Redacted git diff after ventipus run.',
    });
  }

  const status = spawnSync('git', ['-C', workdir, 'status', '--short'], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 512 * 1024,
  });
  if (status.stdout && status.stdout.trim()) {
    const statusPath = join(artifactRoot, 'git-status.txt');
    writeFileSync(statusPath, redact(status.stdout), 'utf8');
    refs.push({
      kind: 'git-status',
      path: statusPath,
      contentType: 'text/plain',
      description: 'Redacted git status after ventipus run.',
    });
  }

  return refs;
}

function runGit(workdir, args, options = {}) {
  const result = spawnSync('git', ['-C', workdir, ...args], {
    encoding: 'utf8',
    timeout: options.timeout || 5000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
  });
  if (result.error) return '';
  if (result.status !== 0 && !(options.allowDiffExit && result.status === 1)) return '';
  return result.stdout || '';
}

function buildWorktreePatch(workdir) {
  const parts = [
    runGit(workdir, ['diff', '--binary', '--no-ext-diff'], { timeout: 10000, maxBuffer: 20 * 1024 * 1024 }),
    runGit(workdir, ['diff', '--cached', '--binary', '--no-ext-diff'], { timeout: 10000, maxBuffer: 20 * 1024 * 1024 }),
    ...collectUntrackedDiffs(workdir),
  ].map((part) => part.trim()).filter(Boolean);
  return parts.join('\n\n') + (parts.length ? '\n' : '');
}

function collectUntrackedDiffs(workdir) {
  const raw = runGit(workdir, ['ls-files', '--others', '--exclude-standard', '-z']);
  const files = raw.split('\0').map((file) => file.trim()).filter(Boolean).slice(0, 80);
  return files
    .map((file) => runGit(workdir, ['diff', '--no-index', '--binary', '--no-ext-diff', '--', '/dev/null', file], {
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024,
      allowDiffExit: true,
    }))
    .filter((diff) => diff.trim());
}

let payload;
try {
  payload = readInput();
} catch (err) {
  fail('invalid_adapter', `Could not read adapter input: ${err?.message || err}`);
  process.exit(0);
}

if (payload.mode !== 'task') {
  fail('unsupported_capability', 'ventipus KBench adapter currently supports task mode only.');
  process.exit(0);
}

const task = payload.task || {};
const config = payload.config || {};
const env = payload.env || task.env || {};
const taskEnv = task.env || {};
const benchmark = task.benchmark || 'swe';
const instruction = String(task.instruction || '').trim();
const profile = profileForBenchmark(benchmark);
const prompt = `/benchmark ${profile} ${instruction}`;
const workdir = config.workDir || env.workdir || env.repoPath || taskEnv.workdir || taskEnv.repoPath || process.cwd();
const artifactRoot = config.storeDir
  || process.env.VENTIPUS_KBENCH_ARTIFACT_DIR
  || (() => {
    const dir = join(tmpdir(), `ventipus-kbench-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  })();
mkdirSync(artifactRoot, { recursive: true });

const stdoutPath = join(artifactRoot, 'ventipus.stdout.txt');
const stderrPath = join(artifactRoot, 'ventipus.stderr.txt');
const instructionPath = join(artifactRoot, 'instruction.txt');
const traceDir = join(artifactRoot, 'ventipus-trace');
mkdirSync(dirname(stdoutPath), { recursive: true });
writeFileSync(instructionPath, redact(instruction), 'utf8');

const commandParts = splitCommand(process.env.VENTIPUS_KBENCH_COMMAND || 'ventipus');
if (!commandParts.length) {
  fail('invalid_adapter', 'VENTIPUS_KBENCH_COMMAND resolved to an empty command.');
  process.exit(0);
}

const [command, ...prefixArgs] = commandParts;
const args = [
  ...prefixArgs,
  '--prompt', prompt,
  '--perm', process.env.VENTIPUS_KBENCH_PERMISSION || 'yolo',
  '--output-format', 'text',
  '--benchmark-trace-dir', traceDir,
];
if (config.modelName) args.push('--model', String(config.modelName));
if (config.temperature !== undefined) args.push('--temperature', String(config.temperature));
if (config.baseUrl) args.push('--base-url', String(config.baseUrl));
if (config.apiKeyEnv) args.push('--api-key-env', String(config.apiKeyEnv));
if (process.env.VENTIPUS_KBENCH_EXTRA_ARGS) {
  args.push(...splitCommand(process.env.VENTIPUS_KBENCH_EXTRA_ARGS));
}

const childEnv = {
  ...process.env,
  VENTIPUS_BENCHMARK_TRACE: '1',
  VENTIPUS_BENCHMARK_TRACE_DIR: traceDir,
  VENTIPUS_BASH_TIMEOUT_MS: process.env.VENTIPUS_BASH_TIMEOUT_MS || '300000',
};
for (const [key, value] of Object.entries(env.envVars || {})) {
  if (typeof value === 'string') childEnv[key] = value;
}
for (const [key, value] of Object.entries(taskEnv.envVars || {})) {
  if (typeof value === 'string') childEnv[key] = value;
}

const result = spawnSync(command, args, {
  cwd: existsSync(workdir) ? workdir : process.cwd(),
  env: childEnv,
  encoding: 'utf8',
  timeout: typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : undefined,
  maxBuffer: 20 * 1024 * 1024,
});

const stdout = result.stdout || '';
const stderr = result.stderr || '';
writeFileSync(stdoutPath, redact(stdout), 'utf8');
writeFileSync(stderrPath, redact(stderr), 'utf8');
const elapsedMs = Date.now() - startedAt;
const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
const exitCode = typeof result.status === 'number' ? result.status : (timedOut ? 124 : 1);
const ok = exitCode === 0;
const traceRefs = collectTraceRefs(traceDir);
const traceSummary = compactTraceSummary(readLatestTraceSummary(traceDir));
const workdirUsed = existsSync(workdir) ? workdir : process.cwd();
const gitRefs = collectGitArtifactRefs(workdirUsed, artifactRoot);
const stdoutLines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const finalText = stdoutLines.at(-1) || stdout.trim() || (ok ? 'ventipus completed.' : 'ventipus produced no stdout.');
const artifacts = [
  { kind: 'instruction', path: instructionPath, contentType: 'text/plain', description: 'KBench task instruction passed to ventipus.' },
  { kind: 'stdout', path: stdoutPath, contentType: 'text/plain', description: 'ventipus stdout.' },
  { kind: 'stderr', path: stderrPath, contentType: 'text/plain', description: 'ventipus stderr.' },
  ...gitRefs,
  ...traceRefs,
];

const output = {
  ok,
  status: ok ? 'ok' : (timedOut ? 'timeout' : 'agent_error'),
  failureKind: ok ? undefined : (timedOut ? 'timeout' : `exit_${exitCode}`),
  finalText: truncate(finalText, 4000),
  elapsedMs,
  artifacts,
  trace: traceRefs.length ? { native: traceRefs } : undefined,
  benchmarkResult: {
    mode: 'ventipus-kbench',
    benchmark,
    profile,
    exitCode,
    workdir: workdirUsed,
    traceSummary,
    verificationEvidence: traceSummary?.verificationEvidence,
    usage: traceSummary?.usage,
  },
  error: ok ? undefined : {
    message: truncate(stderr.trim() || stdout.trim() || result.error?.message || `ventipus exited with code ${exitCode}`, 2000),
  },
};

emit(output);
