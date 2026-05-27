import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { globSync } from 'glob';
import { getConfigDir } from '../config.js';
import { redactTraceText } from '../benchmark-trace.js';
import { resolveUserPath } from './path-utils.js';
import type { Tool, ToolResult } from './types.js';

const IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/target/**',
  '**/.next/**',
  '**/out/**',
];

const MANIFEST_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'pyproject.toml',
  'uv.lock',
  'Pipfile',
  'Pipfile.lock',
  'requirements.txt',
  'requirements-dev.txt',
  'setup.py',
  'setup.cfg',
  'tox.ini',
  'noxfile.py',
  'pytest.ini',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'Makefile',
  'CMakeLists.txt',
  'Dockerfile',
  'pom.xml',
  'mvnw',
  'mvnw.cmd',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradlew',
  'gradlew.bat',
  'deno.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'task.yaml',
  'task.yml',
  'task.toml',
]);

const INSTRUCTION_RE = /(^|\/)(readme|task|tasks|instruction|instructions|problem|prompt)(\.[a-z0-9]+)?$/i;
const CAREFUL_RE = /(^|\/)(oracle|gold|answer|answers|reference|references|hidden|expected|result|results|submission|submissions|patch|solution)([-_.a-z0-9]*)(\/|\.|$)/i;
const TASK_CONTRACT_HEADING_RE = /^\s{0,3}(?:#{1,6}\s*)?(acceptance criteria|requirements?|success criteria|expected behavior|expected output|deliverables?|constraints?|must have|must-have|definition of done)\s*:?\s*$/i;
const TASK_CONTRACT_LINE_RE = /^\s*(?:[-*]\s+|\d+[.)]\s+|\[[ xX-]\]\s*)?(must|must not|should|should not|need(?:s)? to|expected to|ensure|verify|deliver|create|update|fix|implement|allow|preserve|provide(?:s)?|show(?:s)?|include(?:s)?|write(?:s)?|save(?:s)?|output(?:s)?|do not|don't|no\s+(?:code\s+)?changes?|no\s+modifications?|no\s+patch|already\s+(?:fixed|resolved)|issue\s+(?:is\s+)?(?:already\s+)?(?:fixed|resolved)|requirement|acceptance|success)\b/i;
const TASK_CONTRACT_KEY_RE = /^\s*(acceptance_criteria|acceptanceCriteria|requirements?|success_criteria|successCriteria|expected_output|expectedOutput|deliverables?|constraints?)\s*[:=]\s*(.*)$/i;
const TASK_EXCERPT_KEY_RE = /^\s*(?:-\s*)?(description|instruction|instructions|prompt|task)\s*[:=]\s*(.*)$/i;
const TASK_EXCERPT_FILE_RE = /(^|\/)(task|instruction|instructions|problem|prompt)(\.[a-z0-9]+)?$/i;

export interface BenchmarkExperienceHint {
  path: string;
  score: number;
  line: string;
}

export interface BenchmarkExperienceSummary {
  hints: BenchmarkExperienceHint[];
  warnings: BenchmarkExperienceHint[];
}

export const BenchmarkContextTool: Tool = {
  name: 'benchmark_context',
  description:
    'Read-only benchmark preflight. Summarizes cwd, manifests, task files, likely verifier commands, installed tool hints, and files to treat carefully before editing.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory to inspect. Defaults to the current working directory.',
      },
      max_files: {
        type: 'number',
        description: 'Maximum file paths to inspect for the snapshot. Default 400, max 2000.',
      },
    },
    required: [],
    additionalProperties: false,
  },
  isReadOnly: true,
  isDestructive: false,

  async call(input, cwd): Promise<ToolResult> {
    return buildBenchmarkContextReport(input, cwd);
  },
};

export function buildBenchmarkContextReport(input: Record<string, unknown>, cwd: string): ToolResult {
  try {
    const root = input.path ? resolveUserPath(cwd, String(input.path)) : cwd;
    if (!existsSync(root)) {
      return { output: `benchmark_context: path does not exist: ${root}`, isError: true };
    }
    if (!statSync(root).isDirectory()) {
      return { output: `benchmark_context: path is not a directory: ${root}`, isError: true };
    }

    const maxFiles = clampNumber(input.max_files, 400, 50, 2000);
    const files = globSync('**/*', {
      cwd: root,
      nodir: true,
      dot: true,
      maxDepth: 5,
      ignore: IGNORE_GLOBS,
    });
    const normalizedFiles = files.map(normalizePath);
    const sortedFiles = normalizedFiles.sort((a, b) => a.localeCompare(b)).slice(0, maxFiles);
    const rootEntries = listRootEntries(root);
    const manifests = sortedFiles.filter(isManifestFile);
    const instructions = sortedFiles.filter((f) => INSTRUCTION_RE.test(normalizePath(f))).slice(0, 20);
    const instructionExcerpts = summarizeInstructionExcerpts(root, instructions);
    const carefulFiles = sortedFiles.filter((f) => CAREFUL_RE.test(normalizePath(f))).slice(0, 30);
    const taskContractSignals = summarizeTaskContractSignals(root, instructions);
    const scripts = readPackageScripts(root, manifests);
    const makeTargets = readMakeTargets(root, manifests);
    const verifierCommands = inferVerifierCommands(root, sortedFiles, manifests, scripts, makeTargets);
    const ciHints = summarizeCiWorkflowHints(root, sortedFiles);
    const extensions = summarizeExtensions(sortedFiles);
    const runtime = summarizeRuntimeEnvironment(root, sortedFiles, manifests);
    const serviceHints = summarizeServiceHints(sortedFiles, scripts);
    const harnessFiles = findBenchmarkHarnessFiles(sortedFiles);
    const harnessHints = summarizeBenchmarkHarnessHints(sortedFiles, verifierCommands);
    const methodHints = summarizeBenchmarkMethodHints(instructions, carefulFiles, verifierCommands, serviceHints, harnessHints, ciHints);
    const priorExperience = summarizePriorBenchmarkExperienceSummary(root, sortedFiles, verifierCommands);
    const experienceHints = priorExperience.hints;
    const experienceWarnings = priorExperience.warnings;
    const toolHints = detectTools([
      'git', 'node', 'npm', 'pnpm', 'yarn', 'bun', 'python', 'python3',
      'pip', 'pytest', 'uv', 'pipenv', 'cargo', 'go', 'java', 'mvn', 'gradle',
      'dotnet', 'make', 'docker', 'tmux',
    ]);
    const git = readGitState(root);

    const lines = [
      '# Benchmark Context',
      `Root: ${root}`,
      `Files scanned: ${sortedFiles.length}${files.length > sortedFiles.length ? ` of ${files.length}` : ''}`,
      '',
      '## Root Entries',
      formatList(rootEntries, 40),
      '',
      '## Manifests And Config',
      formatList(manifests, 40),
      '',
      '## Task / Instruction Files',
      formatList(instructions, 20),
      '',
      '## Task Instruction Excerpts',
      instructionExcerpts.length
        ? formatList(instructionExcerpts, 20)
        : '(no concise task instruction excerpts found)',
      instructionExcerpts.length
        ? 'Use these exact lines as the initial task contract, then verify them against the full instruction file before editing.'
        : '',
      '',
      '## Task Contract Signals',
      taskContractSignals.length
        ? formatList(taskContractSignals, 24)
        : '(no explicit acceptance criteria, requirements, success criteria, or expected-output lines found in visible task files)',
      '',
      '## Likely Verification Commands',
      formatList(verifierCommands, 16),
      '',
      '## CI Workflow Hints',
      ciHints.length
        ? formatList(ciHints, 40)
        : '(no CI workflow run/setup/env/service hints found)',
      '',
      '## Benchmark Harness Artifacts',
      harnessFiles.length
        ? formatList(harnessFiles, 30)
        : '(none found)',
      '',
      '## Benchmark Harness Hints',
      harnessHints.length
        ? formatList(harnessHints, 24)
        : '(no obvious benchmark harness layout detected)',
      '',
      '## Package Scripts',
      formatList(scripts.map((s) => `${s.name}: ${s.command}`), 30),
      '',
      '## Make Targets',
      formatList(makeTargets, 20),
      '',
      '## Read-With-Care Candidates',
      carefulFiles.length
        ? formatList(carefulFiles, 30)
        : '(none found)',
      carefulFiles.length
        ? 'Treat these as potential oracle/answer/hidden-result files. Read only if the task explicitly permits it or they are clearly normal source artifacts.'
        : '',
      '',
      '## Language Footprint',
      formatList(extensions, 20),
      '',
      '## Tool Availability',
      formatList(toolHints, 30),
      '',
      '## Runtime Environment Hints',
      formatList(runtime, 30),
      '',
      '## Service Persistence Hints',
      serviceHints.length
        ? formatList(serviceHints, 24)
        : '(no obvious long-running service hints found)',
      serviceHints.length
        ? 'If the task expects a service/daemon to survive after the agent exits, start it with bash background:true, nohup + disown, or detached tmux; then verify the process or port and inspect logs.'
        : '',
      '',
      '## Benchmark Method Hints',
      formatList(methodHints, 30),
      '',
      '## Prior Benchmark Experience Hints',
      experienceHints.length
        ? formatList(experienceHints.map((hint) => hint.line), 6)
        : '(no relevant local benchmark trace summaries found)',
      experienceHints.length
        ? 'Treat prior experience as a cost-saving heuristic only. Current task files, verifier output, and anti-leakage rules override prior patterns.'
        : '',
      '',
      '## Prior Benchmark Experience Warnings',
      experienceWarnings.length
        ? formatList(experienceWarnings.map((hint) => hint.line), 6)
        : '(no relevant low-quality or unsafe prior benchmark trace summaries found)',
      experienceWarnings.length
        ? 'Do not copy these prior patterns without fresh current-task evidence; treat them as failure modes to avoid.'
        : '',
      '',
      '## Git State',
      git,
      '',
      '## Suggested First Moves',
      '1. Read the task/instruction excerpts, task/instruction files, and relevant manifests before editing.',
      '2. Convert task instruction excerpts and task contract signals into a short todo checklist; preserve exact paths, filenames, formats, ports, and wording from the task.',
      '3. Restate the success oracle and non-goals; call out any missing or ambiguous acceptance criteria before assuming them.',
      '4. Create a localization dossier: candidate files/functions, evidence, reproduction command, and ruled-out distractors.',
      '5. Verify with the project-native runtime/toolchain, not an arbitrary interpreter or package manager.',
      '6. Run the narrowest likely verifier before broad verification when feasible.',
      '7. If CI workflow hints are present, reconstruct required CI setup/env/services and include relevant CI test/build/lint commands in the validation ladder before finalizing.',
      '8. If prior benchmark experience hints are present, reuse only the method-level lesson after confirming it applies to the current task; avoid any prior patterns listed as warnings.',
      '9. If a prior hint includes replay= checkpoints, replay only the relevant read/search/verifier steps as hypotheses; never copy an old patch or skip current-task validation.',
    ];

    return { output: lines.filter((line, i, arr) => line || arr[i - 1] !== '').join('\n'), isError: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: `benchmark_context error: ${msg}`, isError: true };
  }
}

function summarizeBenchmarkMethodHints(
  instructions: string[],
  carefulFiles: string[],
  verifierCommands: string[],
  serviceHints: string[],
  harnessHints: string[] = [],
  ciHints: string[] = [],
): string[] {
  const hints: string[] = [
    'method: planner -> navigator -> editor -> executor; emulate specialized agents even in one-agent runs.',
    'localization dossier: before editing, list candidate files/functions, evidence, reproduction command, and ruled-out distractors.',
    'dependency traversal: follow imports/call-sites/stack traces depth-first only while they remain issue-relevant; stop before context bloat.',
    'reproduce first: run the narrowest visible failing test/verifier before patching when feasible.',
    'validation ladder: after patching, rerun the narrow verifier, then the broad harness/build/test command.',
    'checkpoint discipline: inspect git state before risky edits; keep changes small enough to revert failed paths without touching unrelated user work.',
    'contamination guard: local task files and verifier output beat memory, prior benchmark patterns, or external popularity signals.',
  ];
  if (instructions.length > 0) {
    hints.push('task contract: preserve exact artifact names, paths, ports, formats, and success wording from the task instruction excerpts and full instruction files.');
  }
  if (carefulFiles.length > 0) {
    hints.push('anti-leakage: read-with-care files were detected; avoid oracle/gold/answer/hidden-result files unless explicitly permitted.');
  }
  if (verifierCommands.length > 0) {
    hints.push(`likely first verifier: ${verifierCommands[0]}`);
  }
  if (harnessHints.length > 0) {
    hints.push(`harness contract: ${harnessHints[0]}`);
  }
  if (ciHints.some((hint) => /^ci (?:env|setup|service|container|image):/i.test(hint))) {
    hints.push('CI environment: workflow setup/env/service/container hints were detected; reconstruct required services, env keys, and toolchain setup before treating CI verifier failures as code failures.');
  }
  if (ciHints.some((hint) => /^ci (?:verifier candidates|verifier|run):/i.test(hint))) {
    hints.push('CI contract: workflow run commands were detected; reproduce relevant CI test/build/lint steps locally before finalizing.');
  }
  if (serviceHints.length > 0) {
    hints.push('service tasks: start long-running services detached/backgrounded, then verify readiness via logs, process, port, or health endpoint.');
  }
  hints.push('source research trigger: for agent-improvement, benchmark-methodology, model, dataset, or leaderboard work, use research_sources before synthesis with arXiv papers; GitHub github_kind:"all"; Hugging Face kind:"all"; Kaggle kaggle_kind:"both"; and recent_days:90 unless older historical evidence is explicitly needed.');
  hints.push('source research digest: after research_sources, inspect Source digest hits/errors/source mix/top URLs; refine the query or state the coverage gap before relying on weak source evidence.');
  return hints;
}

function summarizeInstructionExcerpts(root: string, instructions: string[]): string[] {
  const excerpts: string[] = [];
  const files = prioritizeInstructionFiles(instructions).slice(0, 8);
  const add = (file: string, lineNumber: number, text: string) => {
    const normalized = normalizeInstructionExcerpt(text);
    if (!normalized || normalized.length < 4) return;
    const entry = `${file}:${lineNumber}: ${truncateContractSignal(redactTraceText(normalized), 260)}`;
    if (!excerpts.includes(entry)) excerpts.push(entry);
  };

  for (const file of files) {
    let text = '';
    try {
      text = readFileSync(join(root, file), 'utf-8').slice(0, 30_000);
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    if (/\.(ya?ml|toml)$/i.test(file)) {
      extractStructuredInstructionExcerpts(file, lines, add);
    } else {
      extractMarkdownInstructionExcerpts(file, lines, add);
    }
    if (excerpts.length >= 24) break;
  }

  return excerpts.slice(0, 24);
}

function prioritizeInstructionFiles(instructions: string[]): string[] {
  const taskSpecific = instructions.filter((file) => TASK_EXCERPT_FILE_RE.test(normalizePath(file)));
  const readmes = instructions.filter((file) => /(^|\/)readme(\.[a-z0-9]+)?$/i.test(normalizePath(file)));
  const others = instructions.filter((file) =>
    !taskSpecific.includes(file) &&
    !readmes.includes(file),
  );
  const prioritized = taskSpecific.length > 0
    ? [...taskSpecific, ...others]
    : [...readmes, ...others];
  return Array.from(new Set(prioritized));
}

function extractStructuredInstructionExcerpts(
  file: string,
  lines: string[],
  add: (file: string, lineNumber: number, text: string) => void,
): void {
  let captured = 0;
  for (let i = 0; i < lines.length && captured < 12; i++) {
    const line = lines[i];
    const match = TASK_EXCERPT_KEY_RE.exec(line);
    if (!match) continue;

    const key = match[1];
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!value || /^[|>]$/.test(value)) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      for (let j = i + 1; j < lines.length && captured < 12; j++) {
        const raw = lines[j];
        const trimmed = raw.trim();
        const currentIndent = raw.match(/^\s*/)?.[0].length ?? 0;
        if (trimmed && currentIndent <= indent) break;
        if (!trimmed || /^#/.test(trimmed)) continue;
        add(file, j + 1, `${key}: ${trimmed}`);
        captured++;
      }
      continue;
    }

    add(file, i + 1, `${key}: ${value}`);
    captured++;
  }
}

function extractMarkdownInstructionExcerpts(
  file: string,
  lines: string[],
  add: (file: string, lineNumber: number, text: string) => void,
): void {
  let captured = 0;
  let inFence = false;
  for (let i = 0; i < lines.length && captured < 12; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed || /^---+$/.test(trimmed)) continue;

    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed)?.[1]?.trim();
    if (heading) {
      if (!/^(task|instructions?|problem|prompt)$/i.test(heading)) {
        add(file, i + 1, trimmed);
        captured++;
      }
      continue;
    }

    if (/^\s*(?:[-*]\s+|\d+[.)]\s+|\[[ xX-]\]\s*)?\S/.test(raw)) {
      add(file, i + 1, trimmed);
      captured++;
    }
  }
}

function normalizeInstructionExcerpt(line: string): string {
  return line
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

export function summarizePriorBenchmarkExperience(
  root: string,
  files: string[],
  verifierCommands: string[],
): BenchmarkExperienceHint[] {
  return summarizePriorBenchmarkExperienceSummary(root, files, verifierCommands).hints;
}

export function summarizePriorBenchmarkExperienceSummary(
  root: string,
  files: string[],
  verifierCommands: string[],
): BenchmarkExperienceSummary {
  if (/^(0|false|off|no)$/i.test(process.env.VENTIPUS_BENCHMARK_EXPERIENCE || '')) {
    return { hints: [], warnings: [] };
  }
  const baseDir = process.env.VENTIPUS_BENCHMARK_TRACE_DIR?.trim()
    || join(getConfigDir(), 'benchmark-runs');
  if (!existsSync(baseDir)) return { hints: [], warnings: [] };

  const rootNormalized = normalizePath(root).toLowerCase();
  const rootBase = basename(rootNormalized);
  const fileSet = new Set(files.map(normalizePath));
  const fileBasenames = new Set(files.map((file) => basename(file).toLowerCase()));
  const verifierSet = new Set(verifierCommands.map(normalizeExperienceText));

  const candidates = globSync('**/summary.json', {
    cwd: baseDir,
    nodir: true,
    dot: true,
    maxDepth: 4,
  })
    .map((file) => join(baseDir, file))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      try {
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    })
    .slice(0, 200);

  const hints: BenchmarkExperienceHint[] = [];
  const warnings: BenchmarkExperienceHint[] = [];
  for (const summaryPath of candidates) {
    const summary = readBenchmarkSummary(summaryPath);
    if (!summary) continue;
    const quality = objectRecord(summary.trajectoryQuality);
    const usage = objectRecord(summary.usage);
    const finalAnswerEvidence = objectRecord(summary.finalAnswerEvidence);
    const changedFiles = uniqueNormalizedStrings(stringsFromUnknown(summary.changedFiles)
      .concat(stringsFromUnknown(summary.worktreeChangedFiles))
      .map(normalizePath)
      .slice(0, 80));
    const verificationCommands = stringsFromUnknown(summary.verificationCommands).slice(0, 20);
    const processScore = finiteNumber(quality.processScore);
    const successfulVerificationCount = finiteNumber(quality.successfulVerificationCount);
    const processDefects = Array.isArray(quality.processDefects) ? quality.processDefects : [];
    const defectCodes = processDefects
      .map((defect) => objectRecord(defect).code)
      .filter((code): code is string => typeof code === 'string')
      .slice(0, 12);

    let relevanceScore = 0;
    const summaryCwd = typeof summary.cwd === 'string' ? normalizePath(summary.cwd).toLowerCase() : '';
    if (summaryCwd && summaryCwd === rootNormalized) relevanceScore += 30;
    if (summaryCwd && basename(summaryCwd) === rootBase) relevanceScore += 12;
    relevanceScore += Math.min(20, changedFiles.filter((file) => fileSet.has(file)).length * 5);
    relevanceScore += Math.min(12, changedFiles.filter((file) => fileBasenames.has(basename(file).toLowerCase())).length * 3);
    relevanceScore += Math.min(12, verificationCommands.filter((cmd) => verifierSet.has(normalizeExperienceText(cmd))).length * 6);
    if (relevanceScore < 18) continue;

    const harmReasons = classifyPriorExperienceHarm({
      processScore,
      successfulVerificationCount,
      defectCodes,
      finalAnswerEvidence,
    });

    const changed = changedFiles.slice(0, 5).join(', ') || 'none recorded';
    const verifiers = verificationCommands.slice(0, 3).join(' | ') || 'none recorded';
    const totalTokens = finiteNumber(usage.totalTokens);
    const estimatedCostUsd = finiteNumber(usage.estimatedCostUsd);
    const usageText = totalTokens != null
      ? `usage=${totalTokens} tokens${estimatedCostUsd != null ? `/$${estimatedCostUsd.toFixed(4)}` : ''}`
      : 'usage=not recorded';
    const endedAt = typeof summary.endedAt === 'string' ? summary.endedAt : basename(summaryPath);
    const visibleDefects = defectCodes.slice(0, 4);
    const replayCheckpoints = summarizePriorReplayCheckpoints(summaryPath, fileSet, fileBasenames, verifierSet);
    const priorFailures = summarizePriorFailureSignatures(summary);
    const contractText = summarizePriorTaskContractUse(quality);

    if (harmReasons.length > 0) {
      const line = [
        `avoid prior run: ${redactTraceText(endedAt)}`,
        `relevance=${relevanceScore}`,
        `reason=${redactTraceText(harmReasons.slice(0, 6).join('|'))}`,
        processScore != null ? `process_score=${processScore}` : null,
        `success_verifiers=${successfulVerificationCount ?? 0}`,
        visibleDefects.length ? `defects=${redactTraceText(visibleDefects.join('|'))}` : null,
        `verifiers=${redactTraceText(verifiers)}`,
        `changed=${redactTraceText(changed)}`,
        priorFailures.length ? `failures=${redactTraceText(priorFailures.join(' | '))}` : null,
      ].filter(Boolean).join('; ');
      warnings.push({ path: summaryPath, score: relevanceScore, line });
      continue;
    }

    let score = relevanceScore;
    if (processScore != null && processScore >= 90) score += 8;
    if ((successfulVerificationCount ?? 0) > 0) score += 8;
    if (score < 18) continue;

    const line = [
      `previous run: ${redactTraceText(endedAt)}`,
      `match=${score}`,
      processScore != null ? `process_score=${processScore}` : null,
      `success_verifiers=${successfulVerificationCount ?? 0}`,
      `verifiers=${redactTraceText(verifiers)}`,
      `changed=${redactTraceText(changed)}`,
      replayCheckpoints.length ? `replay=${redactTraceText(replayCheckpoints.join(' | '))}` : null,
      priorFailures.length ? `failures=${redactTraceText(priorFailures.join(' | '))}` : null,
      contractText,
      usageText,
      visibleDefects.length ? `defects=${redactTraceText(visibleDefects.join('|'))}` : null,
    ].filter(Boolean).join('; ');
    hints.push({ path: summaryPath, score, line });
  }

  return {
    hints: hints
      .sort((a, b) => b.score - a.score || b.path.localeCompare(a.path))
      .slice(0, 6),
    warnings: warnings
      .sort((a, b) => b.score - a.score || b.path.localeCompare(a.path))
      .slice(0, 6),
  };
}

function readBenchmarkSummary(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return objectRecord(parsed);
  } catch {
    return null;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(stringsFromUnknown);
  }
  if (typeof value === 'string') return [value];
  return [];
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueNormalizedStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = normalizePath(value).trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function summarizePriorReplayCheckpoints(
  summaryPath: string,
  fileSet: Set<string>,
  fileBasenames: Set<string>,
  verifierSet: Set<string>,
): string[] {
  const tracePath = join(dirname(summaryPath), 'trace.jsonl');
  if (!existsSync(tracePath)) return [];

  let text = '';
  try {
    const stats = statSync(tracePath);
    if (!stats.isFile() || stats.size > 5 * 1024 * 1024) return [];
    text = readFileSync(tracePath, 'utf-8');
  } catch {
    return [];
  }

  const events = text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 800)
    .flatMap((line) => {
      try {
        return [objectRecord(JSON.parse(line) as unknown)];
      } catch {
        return [];
      }
    });
  if (events.length === 0) return [];

  const firstEditSeq = events
    .filter((event) => isPriorEditTool(String(event.tool ?? '')))
    .map((event) => finiteNumber(event.seq))
    .filter((seq): seq is number => seq != null)
    .sort((a, b) => a - b)[0] ?? null;

  const checkpoints: Array<{ seq: number; score: number; line: string }> = [];
  for (const event of events) {
    const seq = finiteNumber(event.seq);
    const tool = String(event.tool ?? '');
    if (seq == null || !tool) continue;
    if (firstEditSeq != null && seq > firstEditSeq) continue;

    const target = String(event.target ?? '').trim();
    const inputPreview = String(event.inputPreview ?? '').trim();
    const searchable = normalizePath(`${target}\n${inputPreview}`);

    if (tool === 'bash' && event.verification === true) {
      const command = target.replace(/^\$\s*/, '').trim();
      if (!command || event.status !== 'error') continue;
      const normalized = normalizeExperienceText(command);
      const score = verifierSet.has(normalized) ? 12 : 5;
      checkpoints.push({
        seq,
        score,
        line: `failing_verifier#${seq} ${truncateContractSignal(command, 140)}`,
      });
      continue;
    }

    if (!['read_file', 'grep', 'glob', 'list_dir'].includes(tool)) continue;
    if (tool === 'list_dir' && (!target || target === '.')) continue;

    const fileMatch = matchesCurrentFileReference(searchable, fileSet, fileBasenames);
    const score =
      (fileMatch ? 8 : 0) +
      (tool === 'read_file' ? 4 : tool === 'grep' ? 3 : tool === 'glob' ? 2 : 1);
    if (score < 8) continue;

    checkpoints.push({
      seq,
      score,
      line: `${tool}#${seq} ${truncateContractSignal(target || inputPreview, 140)}`,
    });
  }

  return checkpoints
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, 6)
    .sort((a, b) => a.seq - b.seq)
    .map((checkpoint) => checkpoint.line);
}

function summarizePriorFailureSignatures(summary: Record<string, unknown>): string[] {
  const evidence = objectRecord(summary.verificationEvidence);
  const rawSignatures = Array.isArray(evidence.failureSignatures)
    ? evidence.failureSignatures
    : [];
  const out: string[] = [];
  for (const raw of rawSignatures.slice(-3)) {
    const signature = objectRecord(raw);
    const command = typeof signature.command === 'string' ? signature.command.trim() : '';
    const tests = stringsFromUnknown(signature.tests).slice(0, 2).join('|');
    const files = stringsFromUnknown(signature.files).slice(0, 2).join('|');
    const errors = stringsFromUnknown(signature.errors).slice(0, 1).join('|');
    const parts = [
      command || `failure#${signature.seq ?? '?'}`,
      tests ? `tests=${tests}` : null,
      files ? `files=${files}` : null,
      errors ? `errors=${errors}` : null,
    ].filter(Boolean).join(' ');
    if (parts && !out.includes(parts)) out.push(truncateContractSignal(parts, 180));
  }
  return out;
}

function summarizePriorTaskContractUse(quality: Record<string, unknown>): string | null {
  const signals = finiteNumber(quality.taskContractSignalCount);
  if (signals == null || signals <= 0) return null;
  const afterContext = quality.taskContractChecklistAfterContext;
  const complete = quality.taskContractChecklistComplete;
  return `contract=signals:${signals},checklist_after_context:${String(afterContext)},complete:${String(complete)}`;
}

function isPriorEditTool(tool: string): boolean {
  return ['write_file', 'edit_file', 'apply_patch'].includes(tool);
}

function matchesCurrentFileReference(text: string, fileSet: Set<string>, fileBasenames: Set<string>): boolean {
  const normalized = normalizePath(text).toLowerCase();
  if (!normalized) return false;
  for (const file of fileSet) {
    if (normalized.includes(file.toLowerCase())) return true;
  }
  const tokens = normalized
    .split(/[^a-z0-9_.-]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  for (const token of tokens) {
    if (fileBasenames.has(token)) return true;
  }
  return false;
}

function classifyPriorExperienceHarm(input: {
  processScore: number | null;
  successfulVerificationCount: number | null;
  defectCodes: string[];
  finalAnswerEvidence: Record<string, unknown>;
}): string[] {
  const reasons: string[] = [];
  const successfulVerificationCount = input.successfulVerificationCount ?? 0;
  if (successfulVerificationCount === 0) reasons.push('no successful verifier');
  if (input.processScore != null && input.processScore < 70) reasons.push(`low process score ${input.processScore}`);
  const harmfulDefects = input.defectCodes.filter((code) =>
    /(?:leakage|test_harness_edit_without_contract|blind_repair_after_failed_verifier|no_passing|latest_post_edit_verifier_failed|missing_final_post_edit_validation|missing_post_edit_validation|unresolved_environment_setup_failure|inconclusive_verifier_failure|edit_despite_no_edit_contract)/.test(code),
  );
  if (harmfulDefects.length > 0) reasons.push(`defects=${harmfulDefects.slice(0, 4).join('|')}`);
  if (input.finalAnswerEvidence.claimsIncomplete === true || input.finalAnswerEvidence.claimsBlocked === true) {
    reasons.push('final answer incomplete or blocked');
  }
  if (input.finalAnswerEvidence.unsupportedPassingClaim === true || input.finalAnswerEvidence.contradictedPassingClaim === true) {
    reasons.push('unsupported final verification claim');
  }
  return reasons;
}

function normalizeExperienceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function summarizeTaskContractSignals(root: string, instructions: string[]): string[] {
  const signals: string[] = [];
  const add = (file: string, line: string) => {
    const normalized = normalizeContractLine(line);
    if (!normalized || normalized.length < 6) return;
    const entry = `${file}: ${truncateContractSignal(normalized, 220)}`;
    if (!signals.includes(entry)) signals.push(entry);
  };

  for (const file of instructions.slice(0, 8)) {
    let text = '';
    try {
      text = readFileSync(join(root, file), 'utf-8').slice(0, 40_000);
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    let headingBudget = 0;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const headingMatch = TASK_CONTRACT_HEADING_RE.exec(line);
      if (headingMatch) {
        headingBudget = 16;
        continue;
      }

      const keyMatch = TASK_CONTRACT_KEY_RE.exec(line);
      if (keyMatch) {
        headingBudget = 12;
        if (keyMatch[2]?.trim()) add(file, keyMatch[2]);
        continue;
      }

      if (headingBudget > 0) {
        if (/^\s{0,3}#{1,6}\s+\S/.test(line) || /^\s*\S[^:]{0,60}:\s*$/.test(line)) {
          headingBudget = 0;
        } else if (/^\s*(?:[-*]\s+|\d+[.)]\s+|\[[ xX-]\]\s*)?\S/.test(line)) {
          add(file, line);
          headingBudget--;
        } else {
          headingBudget--;
        }
        continue;
      }

      if (TASK_CONTRACT_LINE_RE.test(line)) {
        add(file, line);
      }
    }
    if (signals.length >= 24) break;
  }

  return signals.slice(0, 24);
}

function normalizeContractLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\[[ xX-]\]\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateContractSignal(line: string, max: number): string {
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isManifestFile(file: string): boolean {
  const base = basename(file);
  const normalized = normalizePath(file);
  return MANIFEST_NAMES.has(base) ||
    /\.(sln|csproj|fsproj|vbproj)$/i.test(base) ||
    /^Directory\.(Build|Packages)\.(props|targets)$/i.test(base) ||
    isCiWorkflowFile(normalized);
}

function listRootEntries(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => !['.git', 'node_modules'].includes(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80)
      .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}${entry.isDirectory() ? '/' : ''}`);
  } catch {
    return [];
  }
}

function readPackageScripts(root: string, manifests: string[]): Array<{ name: string; command: string }> {
  if (!manifests.includes('package.json')) return [];
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts?: Record<string, unknown> };
    return Object.entries(pkg.scripts || {})
      .filter(([, cmd]) => typeof cmd === 'string')
      .map(([name, command]) => ({ name, command: String(command) }))
      .slice(0, 40);
  } catch {
    return [];
  }
}

function readMakeTargets(root: string, manifests: string[]): string[] {
  if (!manifests.includes('Makefile')) return [];
  try {
    const makefile = readFileSync(join(root, 'Makefile'), 'utf-8').slice(0, 60_000);
    const targets = new Set<string>();
    for (const line of makefile.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_.-]+)\s*:(?![=])/.exec(line);
      if (match && !match[1].startsWith('.')) targets.add(match[1]);
    }
    return Array.from(targets).slice(0, 40);
  } catch {
    return [];
  }
}

function findBenchmarkHarnessFiles(files: string[]): string[] {
  return files.filter((file) => {
    const normalized = normalizePath(file);
    const base = basename(normalized);
    return [
      'task.yaml',
      'task.yml',
      'task.toml',
      'instruction.md',
      'run-tests.sh',
      'run_test.sh',
      'run-tests.bash',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
    ].includes(base) ||
      /^tests\/(?:test|verify|check|grade|grader)\.(sh|bash|bat|py)$/i.test(normalized) ||
      /^tests\/test_outputs\.py$/i.test(normalized) ||
      /^environment\/Dockerfile$/i.test(normalized);
  }).slice(0, 40);
}

function summarizeBenchmarkHarnessHints(files: string[], verifierCommands: string[]): string[] {
  const normalized = files.map(normalizePath);
  const set = new Set(normalized);
  const hints: string[] = [];
  const add = (hint: string) => {
    if (!hints.includes(hint)) hints.push(hint);
  };

  const hasTerminalBenchTask =
    (set.has('task.yaml') || set.has('task.yml')) &&
    (set.has('run-tests.sh') || normalized.some((file) => file.startsWith('tests/')));
  const hasHarborTask =
    set.has('task.toml') &&
    (set.has('instruction.md') || normalized.some((file) => file.startsWith('tests/')));

  if (hasTerminalBenchTask) {
    add('Terminal-Bench layout detected: task.yaml plus run-tests.sh/tests; prefer the visible run-tests verifier before broad harness claims.');
  }
  if (hasHarborTask) {
    add('Harbor task layout detected: task.toml plus instruction/tests; tests/test.sh is the local verifier when present.');
  }
  if (set.has('run-tests.sh')) {
    add('first local verifier candidate: bash run-tests.sh');
  }
  if (set.has('tests/test.sh')) {
    add('Harbor-style verifier candidate: bash tests/test.sh');
  }
  if (set.has('tests/test_outputs.py')) {
    add('Terminal-Bench pytest target detected: tests/test_outputs.py; do not edit test/oracle files unless the task explicitly asks.');
  }
  if (normalized.some((file) => /(^|\/)(solution\.sh|solution\.yaml|solution\/solve\.(sh|bat))$/i.test(file))) {
    add('solution artifact detected: treat as oracle-only material and avoid reading it during benchmark solving unless explicitly permitted.');
  }
  if (normalized.some((file) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|environment\/Dockerfile)$/i.test(file))) {
    add('containerized benchmark task detected; avoid host-only assumptions and prefer the harness/container verifier when available.');
  }
  if (verifierCommands.length > 0) {
    add(`verification ladder starts with: ${verifierCommands[0]}`);
  }

  return hints.slice(0, 24);
}

function inferVerifierCommands(
  root: string,
  files: string[],
  manifests: string[],
  scripts: Array<{ name: string; command: string }>,
  makeTargets: string[],
): string[] {
  const commands: string[] = [];
  const add = (cmd: string) => {
    if (!commands.includes(cmd)) commands.push(cmd);
  };

  const packageManager = detectPackageManager(manifests);
  const normalized = files.map(normalizePath);

  if (normalized.includes('run-tests.sh')) add('bash run-tests.sh');
  if (normalized.includes('tests/test.sh')) add('bash tests/test.sh');
  if (normalized.includes('tests/test_outputs.py')) add('python -m pytest tests/test_outputs.py -rA');

  for (const run of readCiRunCommands(root, normalized)) {
    if (isLikelyCiVerifierCommand(run.command)) add(run.command);
  }

  for (const script of scripts) {
    if (/^(test|tests|check|verify|lint|typecheck|build|e2e|ci)$/i.test(script.name)) {
      add(`${packageManager} run ${script.name}`);
    }
  }
  if (scripts.some((s) => s.name === 'test')) add(`${packageManager} test`);

  for (const file of normalized) {
    const base = basename(file);
    if (/^(run-tests|run_test|run-tests|run_tests|run-test|test|tests|verify|check|validate|grade|grader)\.(sh|bash)$/i.test(base)) {
      add(`bash ${file}`);
    }
    if (/^(test_outputs|run_tests|verify|check|validate|grade|grader)\.py$/i.test(base)) {
      add(`python ${file}`);
    }
  }

  if (manifests.some((m) => ['pytest.ini', 'tox.ini', 'pyproject.toml', 'setup.py', 'uv.lock', 'Pipfile'].includes(basename(m))) ||
    normalized.some((f) => /(^|\/)(tests?|test_[^/]+\.py|[^/]+_test\.py)$/.test(f))) {
    if (manifests.some((m) => basename(m) === 'uv.lock')) add('uv run python -m pytest');
    if (manifests.some((m) => basename(m) === 'Pipfile' || basename(m) === 'Pipfile.lock')) add('pipenv run python -m pytest');
    add('python -m pytest');
  }
  if (manifests.some((m) => basename(m) === 'Cargo.toml')) add('cargo test');
  if (manifests.some((m) => basename(m) === 'go.mod')) add('go test ./...');
  const hasMavenWrapper = manifests.some((m) => basename(m) === 'mvnw');
  const hasWindowsMavenWrapper = manifests.some((m) => basename(m) === 'mvnw.cmd');
  const hasGradleWrapper = manifests.some((m) => basename(m) === 'gradlew');
  const hasWindowsGradleWrapper = manifests.some((m) => basename(m) === 'gradlew.bat');
  if (hasMavenWrapper) add('./mvnw test');
  if (hasWindowsMavenWrapper) add('mvnw.cmd test');
  if (manifests.some((m) => basename(m) === 'pom.xml')) add(hasMavenWrapper ? './mvnw test' : 'mvn test');
  if (hasGradleWrapper) add('./gradlew test');
  if (hasWindowsGradleWrapper) add('gradlew.bat test');
  if (manifests.some((m) => /^(build|settings)\.gradle/.test(basename(m)))) add(hasGradleWrapper ? './gradlew test' : 'gradle test');
  if (manifests.some((m) => /\.(sln|csproj|fsproj|vbproj)$/i.test(basename(m)))) add('dotnet test');
  if (makeTargets.includes('test')) add('make test');
  if (makeTargets.includes('check')) add('make check');
  if (makeTargets.includes('verify')) add('make verify');

  if (commands.length === 0 && existsSync(join(root, 'README.md'))) {
    add('Read README.md for the project-specific verifier');
  }
  return commands.slice(0, 20);
}

interface CiRunCommand {
  file: string;
  line: number;
  command: string;
}

interface CiWorkflowFact {
  file: string;
  line: number;
  kind: 'env' | 'setup' | 'service' | 'container' | 'image';
  value: string;
}

function summarizeCiWorkflowHints(root: string, files: string[]): string[] {
  const ciFiles = files.filter(isCiWorkflowFile).slice(0, 20);
  if (ciFiles.length === 0) return [];
  const hints: string[] = [];
  const add = (hint: string) => {
    if (!hints.includes(hint)) hints.push(hint);
  };

  for (const file of ciFiles) add(`ci workflow: ${file}`);
  const runs = readCiRunCommands(root, ciFiles);
  const facts = readCiWorkflowFacts(root, ciFiles);
  for (const fact of facts.slice(0, 24)) {
    add(`ci ${fact.kind}: ${fact.file}:${fact.line}: ${sanitizeCiFactValue(fact.value)}`);
  }
  const verifierRuns = runs.filter((run) => isLikelyCiVerifierCommand(run.command));
  if (verifierRuns.length > 0) {
    add(`ci verifier candidates: ${verifierRuns.slice(0, 5).map((run) => redactTraceText(run.command)).join(' | ')}`);
  }
  for (const run of runs.slice(0, 14)) {
    const kind = isLikelyCiVerifierCommand(run.command) ? 'ci verifier' : 'ci run';
    add(`${kind}: ${run.file}:${run.line}: ${redactTraceText(run.command)}`);
  }
  if (runs.length > 0) {
    add('ci method: reproduce relevant CI run commands locally after the narrow verifier; CI build/lint/typecheck steps are maintainability evidence, not just nice-to-have checks.');
  }
  if (facts.length > 0) {
    add('ci environment method: reconstruct workflow setup actions, service containers, job containers, and required env keys before relying on CI verifier results.');
  }

  return hints.slice(0, 40);
}

function isCiWorkflowFile(file: string): boolean {
  const normalized = normalizePath(file);
  const base = basename(normalized);
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(normalized) ||
    /^\.gitlab-ci\.ya?ml$/i.test(base) ||
    /^azure-pipelines\.ya?ml$/i.test(base) ||
    /^Jenkinsfile$/i.test(base) ||
    /^\.circleci\/config\.ya?ml$/i.test(normalized);
}

function readCiRunCommands(root: string, files: string[]): CiRunCommand[] {
  const commands: CiRunCommand[] = [];
  for (const file of files.filter(isCiWorkflowFile).slice(0, 20)) {
    let text = '';
    try {
      text = readFileSync(join(root, file), 'utf-8').slice(0, 120_000);
    } catch {
      continue;
    }
    commands.push(...extractCiRunCommands(file, text));
    if (commands.length >= 60) break;
  }
  return commands.slice(0, 60);
}

function readCiWorkflowFacts(root: string, files: string[]): CiWorkflowFact[] {
  const facts: CiWorkflowFact[] = [];
  for (const file of files.filter(isCiWorkflowFile).slice(0, 20)) {
    let text = '';
    try {
      text = readFileSync(join(root, file), 'utf-8').slice(0, 120_000);
    } catch {
      continue;
    }
    facts.push(...extractCiWorkflowFacts(file, text));
    if (facts.length >= 80) break;
  }
  return facts.slice(0, 80);
}

function extractCiRunCommands(file: string, text: string): CiRunCommand[] {
  const commands: CiRunCommand[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)-?\s*run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const indent = match[1].length;
    let command = match[2].trim();

    if (/^[|>]/.test(command)) {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const raw = lines[j];
        const trimmed = raw.trim();
        const currentIndent = raw.match(/^\s*/)?.[0].length ?? 0;
        if (trimmed && currentIndent <= indent) break;
        if (trimmed && !trimmed.startsWith('#')) block.push(trimmed);
        if (block.length >= 5) break;
      }
      command = block.join(' && ');
    }

    command = normalizeCiRunCommand(command);
    if (command) {
      commands.push({ file, line: i + 1, command });
    }
  }
  return commands;
}

function extractCiWorkflowFacts(file: string, text: string): CiWorkflowFact[] {
  type ActiveBlock = {
    kind: 'env' | 'services';
    indent: number;
    childIndent?: number;
  };

  const facts: CiWorkflowFact[] = [];
  const seen = new Set<string>();
  const activeBlocks: ActiveBlock[] = [];
  const add = (kind: CiWorkflowFact['kind'], line: number, value: string) => {
    const cleaned = kind === 'env' ? value.trim() : cleanWorkflowScalar(value);
    if (!cleaned) return;
    const key = `${kind}|${line}|${cleaned}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ file, line, kind, value: cleaned });
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    while (activeBlocks.length > 0 && indent <= activeBlocks[activeBlocks.length - 1].indent) {
      activeBlocks.pop();
    }

    const usesMatch = /^\s*-?\s*uses:\s*([^#]+?)\s*$/.exec(raw);
    if (usesMatch && isLikelyCiSetupUse(usesMatch[1])) {
      add('setup', i + 1, usesMatch[1]);
    }

    const containerMatch = /^\s*(?:-?\s*)?container:\s*(.+?)\s*$/.exec(raw);
    if (containerMatch && !/^[|>{[]?\s*$/.test(containerMatch[1].trim())) {
      add('container', i + 1, containerMatch[1]);
    }

    const imageMatch = /^\s*(?:-?\s*)?image:\s*(.+?)\s*$/.exec(raw);
    if (imageMatch && !/^[|>{[]?\s*$/.test(imageMatch[1].trim())) {
      add('image', i + 1, imageMatch[1]);
    }

    for (const block of activeBlocks) {
      if (indent <= block.indent) continue;
      if (block.kind === 'env') {
        const keyMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(raw);
        if (keyMatch) add('env', i + 1, keyMatch[1]);
        continue;
      }

      const listMatch = /^\s*-\s*(?:name:\s*)?([^#]+?)\s*$/.exec(raw);
      if (listMatch) {
        if (block.childIndent == null) block.childIndent = indent;
        if (indent === block.childIndent) {
          add('service', i + 1, listMatch[1]);
          add('image', i + 1, listMatch[1]);
        }
        continue;
      }

      const keyMatch = /^\s*([A-Za-z0-9_.-]+)\s*:/.exec(raw);
      if (!keyMatch || isCiServiceNestedKey(keyMatch[1])) continue;
      if (block.childIndent == null) block.childIndent = indent;
      if (indent === block.childIndent) add('service', i + 1, keyMatch[1]);
    }

    const blockMatch = /^(\s*)(?:-?\s*)?(env|environment|variables|services)\s*:\s*(.*)$/i.exec(raw);
    if (blockMatch) {
      const kind = blockMatch[2].toLowerCase() === 'services' ? 'services' : 'env';
      const inline = blockMatch[3].trim();
      activeBlocks.push({ kind, indent: blockMatch[1].length });
      if (kind === 'env' && inline.startsWith('{') && inline.endsWith('}')) {
        for (const key of inline.slice(1, -1).split(',').map((part) => part.split(':', 1)[0]?.trim()).filter(Boolean)) {
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) add('env', i + 1, key);
        }
      }
      if (kind === 'services' && inline.startsWith('[') && inline.endsWith(']')) {
        for (const service of inline.slice(1, -1).split(',').map((part) => part.trim()).filter(Boolean)) {
          add('service', i + 1, service);
          add('image', i + 1, service);
        }
      }
    }

    if (facts.length >= 80) break;
  }

  return facts;
}

function normalizeCiRunCommand(command: string): string {
  return command
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWorkflowScalar(value: string): string {
  return value
    .trim()
    .replace(/\s+#.*$/g, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function sanitizeCiFactValue(value: string): string {
  return redactTraceText(value)
    .replace(/\$\{\{\s*secrets\.[^}]+}}/gi, '${{ secrets.[REDACTED] }}')
    .replace(/\$\{\{\s*vars\.[^}]+}}/gi, '${{ vars.[REDACTED] }}');
}

function isLikelyCiSetupUse(value: string): boolean {
  const cleaned = cleanWorkflowScalar(value);
  return /(?:^|\/)(?:setup-[^/@]+|cache)(?:@|$)/i.test(cleaned) ||
    /^docker\/(?:setup-|login-action|build-push-action)/i.test(cleaned);
}

function isCiServiceNestedKey(key: string): boolean {
  return /^(image|env|ports?|volumes?|options|credentials|command|entrypoint|alias|name|variables|with|if|needs|runs-on|steps|strategy|timeout-minutes|permissions)$/i.test(key);
}

function isLikelyCiVerifierCommand(command: string): boolean {
  return /\b(test|tests|pytest|tox|nox|vitest|jest|mocha|tap|cargo\s+test|go\s+test|mvnw?\s+.*test|gradlew?\s+.*test|dotnet\s+test|lint|typecheck|tsc|build|check|verify|make\s+(?:test|check|verify))\b/i.test(command);
}

function summarizeRuntimeEnvironment(root: string, files: string[], manifests: string[]): string[] {
  const lines: string[] = [
    `platform: ${process.platform}/${process.arch}`,
  ];
  const packageManager = detectPackageManager(manifests);
  if (manifests.some((m) => basename(m) === 'package.json')) {
    lines.push(`node package manager hint: ${packageManager}`);
  }
  if (manifests.some((m) => basename(m) === 'uv.lock')) {
    lines.push('python environment hint: uv project detected; prefer `uv run ...` over system python/pip.');
  } else if (manifests.some((m) => basename(m) === 'Pipfile' || basename(m) === 'Pipfile.lock')) {
    lines.push('python environment hint: Pipenv project detected; prefer `pipenv run ...`.');
  } else if (manifests.some((m) => ['pyproject.toml', 'requirements.txt', 'setup.py', 'tox.ini'].includes(basename(m)))) {
    lines.push('python environment hint: Python project detected; verify interpreter and virtualenv before declaring done.');
  }
  if (manifests.some((m) => basename(m) === 'go.mod')) {
    lines.push('go environment hint: Go module detected; prefer `go test ./...` for broad verification.');
  }
  if (manifests.some((m) => basename(m) === 'pom.xml')) {
    lines.push('jvm environment hint: Maven project detected; prefer the wrapper `./mvnw test` when present.');
  }
  if (manifests.some((m) => /^(build|settings)\.gradle/.test(basename(m)))) {
    lines.push('jvm environment hint: Gradle project detected; prefer the wrapper `./gradlew test` when present.');
  }
  if (manifests.some((m) => /\.(sln|csproj|fsproj|vbproj)$/i.test(basename(m)))) {
    lines.push('.NET environment hint: solution/project file detected; prefer `dotnet test` for broad verification.');
  }
  if (existsSync(join(root, '.venv'))) lines.push('virtualenv: .venv present');
  if (existsSync(join(root, 'venv'))) lines.push('virtualenv: venv present');
  const versions = [
    commandVersion('node', ['--version']),
    commandVersion('npm', ['--version'], 'npm'),
    commandVersion('python', ['--version']),
    commandVersion('python3', ['--version']),
    commandVersion('uv', ['--version']),
    commandVersion('go', ['version'], 'go'),
    commandVersion('dotnet', ['--version'], 'dotnet'),
  ].filter((line): line is string => Boolean(line));
  lines.push(...versions);
  if (files.some((f) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/.test(f))) {
    lines.push('container hint: Docker/Compose artifacts present; verify whether services must run in containers.');
  }
  lines.push('network/offline hint: this read-only snapshot does not probe the network; if downloads/models/APIs are involved, verify network availability early.');
  return lines;
}

function commandVersion(command: string, args: string[], label = command): string | null {
  try {
    const out = execFileSync(command, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1500,
      maxBuffer: 16 * 1024,
    }).trim();
    if (!out) return null;
    return `${label}: ${out.split(/\r?\n/)[0]}`;
  } catch {
    return null;
  }
}

function summarizeServiceHints(
  files: string[],
  scripts: Array<{ name: string; command: string }>,
): string[] {
  const hints: string[] = [];
  const add = (line: string) => {
    if (!hints.includes(line)) hints.push(line);
  };

  for (const script of scripts) {
    if (/(^|:)(start|serve|server|dev|watch)$/i.test(script.name) ||
        /\b(flask|uvicorn|gunicorn|fastapi|next|vite|webpack-dev-server|node .*server|python .*server)\b/i.test(script.command)) {
      add(`package script may start a service: ${script.name}: ${script.command}`);
    }
  }
  for (const file of files) {
    const base = basename(file).toLowerCase();
    if (
      /(^|[_-])(server|service|daemon)\.(py|js|ts|mjs|cjs|go|rs)$/.test(base) ||
      ['app.py', 'main.py', 'server.py', 'service.py', 'docker-compose.yml', 'compose.yml'].includes(base)
    ) {
      add(`service-like file: ${file}`);
    }
  }
  if (hints.length > 0) {
    add('service persistence: plain `command &` may die with the shell; prefer bash background:true, `nohup ... & disown`, or detached tmux, then verify process/port/logs.');
  }
  return hints.slice(0, 30);
}

function detectPackageManager(manifests: string[]): string {
  const names = new Set(manifests.map((m) => basename(m)));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('bun.lock') || names.has('bun.lockb')) return 'bun';
  return 'npm';
}

function summarizeExtensions(files: string[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const base = basename(file);
    const idx = base.lastIndexOf('.');
    const ext = idx > 0 ? base.slice(idx).toLowerCase() : '(no ext)';
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([ext, count]) => `${ext}: ${count}`);
}

function detectTools(commands: string[]): string[] {
  return commands.map((cmd) => `${cmd}: ${commandExists(cmd) ? 'yes' : 'no'}`);
}

function commandExists(command: string): boolean {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('where.exe', [command], { stdio: 'ignore' });
      return result.status === 0;
    }
    const result = spawnSync('sh', ['-lc', `command -v ${shellQuote(command)} >/dev/null 2>&1`], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function readGitState(root: string): string {
  try {
    const inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    if (inside !== 'true') return 'Not a git worktree.';
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    const status = execFileSync('git', ['status', '--short'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 256 * 1024,
    }).trim();
    const relTop = relative(root, top) || '.';
    if (!status) return `Git worktree: ${relTop}; status clean.`;
    const lines = status.split(/\r?\n/).slice(0, 40);
    return [`Git worktree: ${relTop}; dirty entries shown below.`, ...lines].join('\n');
  } catch {
    return 'Git state unavailable.';
  }
}

function formatList(items: string[], limit: number): string {
  if (!items.length) return '(none found)';
  const shown = items.slice(0, limit).map((item) => `- ${item}`);
  if (items.length > limit) shown.push(`- ... ${items.length - limit} more`);
  return shown.join('\n');
}
