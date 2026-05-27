import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from './config.js';
import type { VentipusConfig, Message } from './types.js';

export interface BenchmarkTraceEvent {
  seq: number;
  tool: string;
  target: string;
  status: 'ok' | 'error';
  verification: boolean;
  elapsedMs: number;
  inputPreview: string;
  outputPreview: string;
}

export interface BenchmarkTraceSummary {
  version: 1;
  sessionId: string;
  mode: string;
  cwd: string;
  provider: string;
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  toolCallCount: number;
  errorCount: number;
  usage: BenchmarkUsageSummary;
  verificationCount: number;
  verificationCommands: string[];
  verificationEvidence: BenchmarkVerificationEvidence;
  finalAnswerEvidence: BenchmarkFinalAnswerEvidence;
  changedFiles: string[];
  worktreeChangedFiles: string[];
  artifacts: BenchmarkTraceArtifact[];
  openAgentLeaderboardDraft: OpenAgentLeaderboardDraft;
  trajectoryQuality: BenchmarkTrajectoryQuality;
  experienceCard: BenchmarkExperienceCard;
  finalAssistant: string;
  events: BenchmarkTraceEvent[];
}

export interface BenchmarkExperienceCard {
  version: 1;
  replayCheckpoints: BenchmarkExperienceReplayCheckpoint[];
  failureSignatures: BenchmarkVerifierFailureSignature[];
  sourceResearchCoverage: SourceResearchCoverage;
  taskContract: BenchmarkExperienceTaskContract;
  environmentReconstruction: BenchmarkExperienceEnvironmentReconstruction;
  dependencyUpgrade: BenchmarkExperienceDependencyUpgrade;
  decisionObservability: BenchmarkExperienceDecisionObservability;
  verificationCommands: string[];
  changedFiles: string[];
  warnings: string[];
}

export interface BenchmarkExperienceReplayCheckpoint {
  seq: number;
  tool: string;
  target: string;
  reason: 'file_context' | 'search_context' | 'failing_verifier';
  score: number;
}

export interface BenchmarkExperienceTaskContract {
  signalCount: number;
  signals: string[];
  checklistAfterContext: boolean | null;
  checklistComplete: boolean | null;
  incompleteCount: number;
  incompleteItems: BenchmarkTodoIncompleteItem[];
}

export interface BenchmarkExperienceDecisionObservability {
  editCount: number;
  predictedEditCount: number;
  verifiedPredictionCount: number;
  editPredictions: BenchmarkExperienceEditPrediction[];
}

export interface BenchmarkExperienceEditPrediction {
  editSeq: number;
  tool: string;
  target: string;
  prediction: string;
  nextVerifierSeq: number | null;
  nextVerifierStatus: 'ok' | 'error' | null;
  nextVerifierCommand: string | null;
}

export interface BenchmarkTraceArtifact {
  kind: 'patch' | 'git-status' | 'open-agent-leaderboard-draft';
  path: string;
  contentType: string;
  description: string;
  sizeBytes: number;
}

export interface BenchmarkUsageEvent {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface BenchmarkModelUsageSummary {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface BenchmarkUsageSummary {
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byModel: BenchmarkModelUsageSummary[];
}

export interface OpenAgentLeaderboardDraft {
  version: 1;
  source: 'ventipus benchmark trace';
  submissionReady: boolean;
  reason: string;
  agent: string;
  agent_name: string;
  benchmark: string;
  benchmark_name: string;
  model: string;
  model_name: string;
  total_sessions: number;
  planned_sessions: number;
  completed_sessions: number | null;
  incomplete_sessions: number | null;
  missing_sessions: number | null;
  successful_sessions: number | null;
  benchmark_score: number | null;
  average_score: number | null;
  average_steps: number;
  average_action_count: number;
  average_invalid_action_count: number;
  average_invalid_action_percent: number;
  average_agent_cost: number;
  total_agent_cost: number;
  average_benchmark_cost: number;
  total_benchmark_cost: number;
  total_run_cost: number;
  percent_finished: number | null;
  percent_successful: number | null;
  percent_finished_successful: number | null;
  percent_finished_unsuccessful: number | null;
  percent_unfinished: number | null;
  percent_error: number | null;
  compact_process_score: number;
  subset_name: string | null;
  compact_final_answer_completion: BenchmarkFinalAnswerEvidence['finalAnswerCompletion'];
  compact_latest_verification_status: BenchmarkVerificationEvidence['lastVerificationStatus'];
  compact_verification_count: number;
  compact_warnings: string[];
  missingOfficialFields: string[];
}

export interface BenchmarkVerificationEvidence {
  lastVerificationSeq: number | null;
  lastVerificationStatus: 'ok' | 'error' | null;
  lastSuccessfulVerificationSeq: number | null;
  lastFailedVerificationSeq: number | null;
  extracted: BenchmarkVerifierOutputSignal[];
  failureSignatures: BenchmarkVerifierFailureSignature[];
  incompleteRuns: BenchmarkVerifierIncompleteRun[];
}

export interface BenchmarkFinalAnswerEvidence {
  mentionsVerification: boolean;
  claimsPassingVerification: boolean;
  claimsNoVerificationRun: boolean;
  claimsIncomplete: boolean;
  claimsBlocked: boolean;
  finalAnswerCompletion: 'blocked' | 'incomplete' | 'unknown';
  unsupportedPassingClaim: boolean;
  contradictedPassingClaim: boolean;
  staleNoVerificationClaim: boolean;
  latestVerificationStatus: 'ok' | 'error' | null;
  lastSuccessfulVerificationSeq: number | null;
  verificationCount: number;
  warnings: string[];
}

export interface BenchmarkVerifierOutputSignal {
  seq: number;
  command: string;
  status: 'ok' | 'error';
  framework: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  errors?: number;
  total?: number;
  raw: string;
}

export interface BenchmarkVerifierFailureSignature {
  seq: number;
  command: string;
  framework: string;
  tests: string[];
  files: string[];
  errors: string[];
  raw: string;
}

export interface BenchmarkVerifierIncompleteRun {
  seq: number;
  command: string;
  timedOut: boolean;
  truncated: boolean;
  omittedLines?: number;
  omittedChars?: number;
  fullLog?: string;
  conclusiveFailureEvidence: boolean;
  reason: string;
}

export interface BenchmarkEnvironmentSetupEvent {
  seq: number;
  command: string;
  status: 'ok' | 'error';
  kind: string;
}

export interface BenchmarkEnvironmentSetupFailureEvent {
  seq: number;
  command: string;
  reason: string;
  evidence: string;
}

export interface BenchmarkExperienceEnvironmentReconstruction {
  setupFailureCount: number;
  unresolvedSetupFailureCount: number;
  setupCount: number;
  successfulSetupCount: number;
  setupEvents: BenchmarkEnvironmentSetupEvent[];
  setupFailures: BenchmarkEnvironmentSetupFailureEvent[];
  unresolvedSetupFailures: BenchmarkEnvironmentSetupFailureEvent[];
}

export interface BenchmarkDependencyEditEvent {
  seq: number;
  tool: string;
  target: string;
  ecosystem: string;
  kind: 'manifest' | 'lockfile';
}

export interface BenchmarkExperienceDependencyUpgrade {
  manifestEditCount: number;
  lockfileEditCount: number;
  manifestEdits: BenchmarkDependencyEditEvent[];
  lockfileEdits: BenchmarkDependencyEditEvent[];
  setupAfterManifestEdit: boolean | null;
  passingSetupAfterManifestEdit: boolean | null;
  validationAfterManifestEdit: boolean | null;
  passingValidationAfterManifestEdit: boolean | null;
  firstSetupAfterManifestEditSeq: number | null;
  firstValidationAfterManifestEditSeq: number | null;
}

export interface BenchmarkSkillViewEvent {
  seq: number;
  name: string;
}

export interface BenchmarkInvalidToolActionEvent {
  seq: number;
  tool: string;
  reason: string;
  evidence: string;
}

export interface BenchmarkTrajectoryQuality {
  version: 1;
  toolCallCount: number;
  usageCallCount: number;
  usageTotalTokens: number;
  usageEstimatedCostUsd: number;
  costEfficiencyRisk: boolean;
  invalidToolActionCount: number;
  invalidToolActionPercent: number;
  invalidToolActionEvents: BenchmarkInvalidToolActionEvent[];
  inspectCount: number;
  editCount: number;
  verificationCount: number;
  successfulVerificationCount: number;
  failedVerificationCount: number;
  incompleteVerifierCount: number;
  incompleteVerifierEvents: BenchmarkVerifierIncompleteRun[];
  inconclusiveVerifierEvents: BenchmarkVerifierIncompleteRun[];
  environmentSetupFailureCount: number;
  environmentSetupFailureEvents: BenchmarkEnvironmentSetupFailureEvent[];
  unresolvedEnvironmentSetupFailureCount: number;
  unresolvedEnvironmentSetupFailureEvents: BenchmarkEnvironmentSetupFailureEvent[];
  environmentSetupCount: number;
  successfulEnvironmentSetupCount: number;
  environmentSetupEvents: BenchmarkEnvironmentSetupEvent[];
  dependencyManifestEditCount: number;
  dependencyLockfileEditCount: number;
  dependencyManifestEditEvents: BenchmarkDependencyEditEvent[];
  dependencyLockfileEditEvents: BenchmarkDependencyEditEvent[];
  dependencySetupAfterManifestEdit: boolean | null;
  passingDependencySetupAfterManifestEdit: boolean | null;
  dependencyValidationAfterManifestEdit: boolean | null;
  passingDependencyValidationAfterManifestEdit: boolean | null;
  firstDependencySetupAfterManifestEditSeq: number | null;
  firstDependencyValidationAfterManifestEditSeq: number | null;
  skillViewCount: number;
  skillViewEvents: BenchmarkSkillViewEvent[];
  skillNames: string[];
  skillLoadedBeforeLocalContext: boolean;
  excessiveSkillViewCount: boolean;
  ciWorkflowCommandCount: number;
  ciVerifierCommands: string[];
  ciValidationAfterFirstEdit: boolean | null;
  passingCiValidationAfterFirstEdit: boolean | null;
  ciValidationAfterLastEdit: boolean | null;
  passingCiValidationAfterLastEdit: boolean | null;
  firstCiValidationAfterFirstEditSeq: number | null;
  benchmarkContextUsed: boolean;
  sourceResearchUsed: boolean;
  sourceResearchCoverage: SourceResearchCoverage;
  taskContractSignalCount: number;
  taskContractChecklistUsed: boolean;
  taskContractChecklistAfterContext: boolean | null;
  taskContractChecklistComplete: boolean | null;
  latestTodoSeq: number | null;
  todoIncompleteCount: number;
  todoIncompleteItems: BenchmarkTodoIncompleteItem[];
  noEditContractDetected: boolean;
  editAfterNoEditContract: boolean;
  editTargetCount: number;
  localizedEditTargetCount: number;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  contextUtilizationInspectCount: number;
  contextUtilizationHitCount: number;
  contextUtilizationMissCount: number;
  contextUtilizationPercent: number | null;
  contextUtilizationRisk: boolean;
  contextUtilizationMissEvents: BenchmarkContextUtilizationEvent[];
  broadEditContractDetected: boolean;
  largeEditSurfaceTargetCount: number;
  largeEditSurfaceTargets: string[];
  redundantToolCallCount: number;
  redundantToolCallEvents: BenchmarkRedundantToolCallEvent[];
  redundantVerifierCount: number;
  redundantVerifierEvents: BenchmarkRedundantVerifierEvent[];
  blindRepairCount: number;
  blindRepairEvents: BenchmarkBlindRepairEvent[];
  failureAlignedRepairCount: number;
  failureUnalignedRepairCount: number;
  failureUnalignedRepairEvents: BenchmarkFailureUnalignedRepairEvent[];
  postEditRegressionCycleCount: number;
  postEditRegressionCycleEvents: BenchmarkPostEditRegressionCycleEvent[];
  scratchArtifactPermissionDetected: boolean;
  scratchArtifactEvents: BenchmarkScratchArtifactEvent[];
  postEditDiffReview: boolean | null;
  diffReviewAfterLastEdit: boolean | null;
  testEditPermissionDetected: boolean;
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
  firstInspectSeq: number | null;
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  firstVerificationSeq: number | null;
  firstTaskContractSeq: number | null;
  firstNoEditContractSeq: number | null;
  firstTodoSeq: number | null;
  firstPostEditDiffReviewSeq: number | null;
  firstDiffReviewAfterLastEditSeq: number | null;
  firstBroadValidationAfterFirstEditSeq: number | null;
  lastPostEditVerificationSeq: number | null;
  lastPostEditVerificationStatus: 'ok' | 'error' | null;
  lastPostEditVerificationConclusiveFailure: boolean | null;
  finalEditVerificationCount: number;
  finalEditPassingVerificationCount: number;
  stableValidationAfterLastEdit: boolean | null;
  firstSuccessfulVerificationSeq: number | null;
  firstFailedVerificationSeq: number | null;
  firstConclusiveFailedVerificationSeq: number | null;
  localizationBeforeFirstEdit: boolean | null;
  reproductionBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  validationAfterFirstEdit: boolean | null;
  passingValidationAfterFirstEdit: boolean | null;
  broadValidationAfterFirstEdit: boolean | null;
  passingBroadValidationAfterFirstEdit: boolean | null;
  validationAfterLastEdit: boolean | null;
  passingValidationAfterLastEdit: boolean | null;
  broadValidationAfterLastEdit: boolean | null;
  passingBroadValidationAfterLastEdit: boolean | null;
  processScore: number;
  processDefects: BenchmarkProcessDefect[];
  warnings: string[];
}

export type BenchmarkProcessDefectCategory =
  | 'orientation'
  | 'requirement_fidelity'
  | 'benchmark_validity'
  | 'localization'
  | 'reproduction'
  | 'validation'
  | 'source_research'
  | 'leakage'
  | 'execution_control';

export type BenchmarkProcessDefectSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface BenchmarkProcessDefect {
  code: string;
  category: BenchmarkProcessDefectCategory;
  severity: BenchmarkProcessDefectSeverity;
  seq: number | null;
  message: string;
  evidence: string;
}

const COST_EFFICIENCY_TOKEN_THRESHOLD = 40_000;
const COST_EFFICIENCY_CALL_THRESHOLD = 6;
const COST_EFFICIENCY_USD_THRESHOLD = 0.5;
const COST_EFFICIENCY_HIGH_TOKEN_THRESHOLD = 80_000;
const COST_EFFICIENCY_HIGH_CALL_THRESHOLD = 10;
const COST_EFFICIENCY_HIGH_USD_THRESHOLD = 1.0;
export const BENCHMARK_INVALID_TOOL_ACTION_TOOL = '__invalid_tool_action__';

export interface SourceResearchCoverage {
  callCount: number;
  arxiv: boolean;
  github: boolean;
  huggingface: boolean;
  kaggle: boolean;
  sourceHitCount: number;
  sourceErrorCount: number;
  githubKinds: string[];
  huggingFaceKinds: string[];
  kaggleKinds: string[];
  resultSources: string[];
  topUrls: string[];
  recentDays: number[];
  freshTargetedCoverage: boolean;
  kaggleCompetitionsSkipped: boolean;
  coverageNotes: string[];
  completeTargetedCoverage: boolean;
}

export interface BenchmarkLeakageRiskEvent {
  seq: number;
  tool: string;
  target: string;
  reason: string;
}

export interface BenchmarkTodoIncompleteItem {
  content: string;
  status: 'pending' | 'in_progress';
}

type BenchmarkTodoStatus = 'pending' | 'in_progress' | 'completed';

interface BenchmarkTodoState {
  seq: number;
  incompleteCount: number;
  incompleteItems: BenchmarkTodoIncompleteItem[];
}

export interface BenchmarkTestHarnessEditEvent {
  seq: number;
  tool: string;
  target: string;
  reason: string;
}

export interface BenchmarkUnlocalizedEditEvent {
  seq: number;
  tool: string;
  target: string;
  reason: string;
}

export interface BenchmarkContextUtilizationEvent {
  seq: number;
  tool: string;
  target: string;
  reason: string;
}

export interface BenchmarkRedundantToolCallEvent {
  seq: number;
  tool: string;
  target: string;
  repeatOfSeq: number;
  repeatCount: number;
  reason: string;
}

export interface BenchmarkRedundantVerifierEvent {
  seq: number;
  command: string;
  repeatOfSeq: number;
  repeatCount: number;
  reason: string;
}

export interface BenchmarkBlindRepairEvent {
  failedVerificationSeq: number;
  editSeq: number;
  command: string;
  editTarget: string;
  reason: string;
}

export interface BenchmarkFailureUnalignedRepairEvent {
  failedVerificationSeq: number;
  editSeq: number;
  command: string;
  failureFiles: string[];
  inspectedTargets: string[];
  editTarget: string;
  reason: string;
}

export interface BenchmarkPostEditRegressionCycleEvent {
  firstPassingSeq: number;
  failingSeq: number;
  recoveryPassingSeq: number;
  failingCommand: string;
  recoveryCommand: string;
  broadFailure: boolean;
}

export interface BenchmarkScratchArtifactEvent {
  seq: number;
  tool: string;
  target: string;
  reason: string;
}

export interface BenchmarkTraceWriteInput {
  sessionId: string;
  mode: string;
  cwd: string;
  config: VentipusConfig;
  startedAtMs: number;
  endedAtMs?: number;
  messages: Message[];
  events: BenchmarkTraceEvent[];
  usageEvents?: BenchmarkUsageEvent[];
}

export interface BenchmarkTraceWriteResult {
  dir: string;
  summaryPath: string;
  jsonlPath: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-or-v1-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /hf_[A-Za-z0-9]{16,}/g,
  /KGAT_[A-Za-z0-9]{16,}/g,
  /npm_[A-Za-z0-9]{16,}/g,
  /(OPENROUTER|OPENAI|ANTHROPIC|DEEPSEEK|NVIDIA|GOOGLE|GEMINI|GLM|ZHIPUAI|HUGGINGFACE|KAGGLE|NPM)_API_KEY\s*=\s*["']?[^"'\s]+/gi,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*["'][^"']{8,}["']/gi,
];

const NO_EDIT_CONTRACT_RE =
  /\b(?:no\s+(?:code|source|repository|repo|file)?\s*changes?\s+(?:are\s+)?(?:required|needed|necessary)|no\s+modifications?\s+(?:are\s+)?(?:required|needed|necessary)|no\s+patch\s+(?:is\s+)?(?:required|needed|necessary)|(?:do\s+not|don't)\s+(?:modify|change|edit|patch)\s+(?:the\s+)?(?:code|source|repository|repo|codebase|implementation|application)|(?:must|should)\s+not\s+make\s+(?:any\s+)?code\s+changes?|leave\s+(?:the\s+)?(?:code|source|repository|repo|codebase|implementation|application)\s+(?:unchanged|as-is)|(?:issue|bug|problem|codebase)\s+(?:is\s+)?(?:already\s+)?(?:fixed|resolved)|already\s+(?:fixed|resolved|passing))\b/i;
const TEST_EDIT_PERMISSION_RE =
  /\b(?:(?:add|write|create|update|fix|implement|modify|adjust)\s+(?:a\s+|the\s+|new\s+|regression\s+|unit\s+|integration\s+|e2e\s+|end-to-end\s+){0,6}(?:tests?|specs?|assertions?|pytest|vitest|jest|playwright|cypress)|(?:tests?|specs?|assertions?)\s+(?:must|should|need|needs|are\s+expected|are\s+required|are\s+needed|should\s+be|must\s+be)\s+(?:be\s+)?(?:added|written|created|updated|modified|fixed|implemented))\b/i;
const BROAD_EDIT_CONTRACT_RE =
  /\b(?:refactor(?:ing)?|rewrite|rework|migrat(?:e|ion)|rename|move|split|modulariz(?:e|ation)|restructur(?:e|ing)|project-wide|repo-wide|repository-wide|codebase-wide|workspace-wide|across\s+(?:the\s+)?(?:repo|repository|project|codebase|workspace|modules?|packages?|components?)|all\s+(?:files|modules|packages|components|routes|call\s+sites|usages|references)|multiple\s+(?:files|modules|packages|components|services)|bulk\s+(?:update|change|edit|migration)|sweeping\s+(?:change|refactor|update))\b/i;
const SCRATCH_ARTIFACT_PERMISSION_RE =
  /\b(?:(?:add|write|create|include|commit|save|generate)\s+(?:a\s+|an\s+|the\s+|new\s+|minimal\s+|standalone\s+|temporary\s+|diagnostic\s+|debug\s+|repro(?:duction)?\s+|reproducer\s+){0,8}(?:repro(?:duction)?|reproducer|debug|diagnostic|probe|scratch|playground|sandbox)\s+(?:script|file|artifact|case|tool|fixture|example)|(?:repro(?:duction)?|reproducer|debug|diagnostic|probe|scratch|playground|sandbox)\s+(?:script|file|artifact|case|tool|fixture|example)\s+(?:is|are|must|should|need|needs|requested|required|expected|allowed|permitted))\b/i;
const FINAL_ANSWER_VERIFICATION_MENTION_RE =
  /\b(?:tests?|checks?|verifiers?|verification|validation|validated|verified|pytest|vitest|jest|npm\s+test|pnpm\s+test|yarn\s+test|cargo\s+test|go\s+test|dotnet\s+test|mvn\s+test|gradle\s+test|build|lint)\b/i;
const FINAL_ANSWER_PASSING_VERIFICATION_RE =
  /\b(?:(?:all\s+)?(?:tests?|checks?|verifiers?|verification|validation|build|lint)\s+(?:now\s+)?(?:pass(?:ed|es)?|succeed(?:ed|s)?|green|ok)|(?:verified|validated)\b.{0,80}\b(?:pass(?:ed|es)?|success(?:ful|fully)?|green|ok)|(?:ran|run)\b.{0,80}\b(?:tests?|checks?|verifiers?|verification|validation|build|lint)\b.{0,80}\b(?:pass(?:ed|es)?|success(?:ful|fully)?|green|ok))\b/i;
const FINAL_ANSWER_NO_VERIFICATION_RE =
  /\b(?:(?:tests?|checks?|verifiers?|verification|validation|build|lint)\s+(?:were\s+|was\s+)?(?:not\s+run|not\s+executed|unrun)|(?:did(?:n't| not)|could(?:n't| not)|unable\s+to|was(?:n't| not)\s+able\s+to)\s+(?:run|execute)\s+(?:the\s+)?(?:tests?|checks?|verifiers?|verification|validation|build|lint)|not\s+tested)\b/i;
const FINAL_ANSWER_INCOMPLETE_RE =
  /\b(?:(?:could(?:n't| not)|did(?:n't| not)|unable\s+to|was(?:n't| not)\s+able\s+to)\s+(?:finish|complete|resolve|fully\s+implement)|(?:not|isn't|aren't)\s+(?:fully\s+)?(?:finished|complete|implemented|resolved)|(?:partially|incompletely)\s+(?:done|implemented|fixed|resolved)|(?:still|currently)\s+(?:failing|broken|unresolved|incomplete)|(?:tests?|checks?|build|lint)\s+(?:still\s+)?(?:fail|failing|failed)|ran\s+out\s+of\s+time|out\s+of\s+time)\b/i;
const FINAL_ANSWER_REMAINING_WORK_RE =
  /\b(?:remaining|leftover|follow-?up)\s+(?:work|tasks?|items?|fixes?|steps?)\b/i;
const FINAL_ANSWER_NO_REMAINING_WORK_RE =
  /\b(?:no|without)\s+(?:remaining|leftover|follow-?up)\s+(?:work|tasks?|items?|fixes?|steps?)\b/i;
const FINAL_ANSWER_BLOCKED_RE =
  /\b(?:(?:i(?:'m| am)?|we(?:'re| are)?)\s+blocked|blocked\s+(?:by|on|because)|(?:cannot|can't|unable\s+to)\s+proceed|waiting\s+for\s+(?:you|user|input|permissions?|credentials?|access)|need(?:ed|s)?\s+(?:more\s+)?(?:user\s+)?(?:input|permissions?|credentials?|access)\s+to\s+(?:continue|proceed|finish|complete))\b/i;
const LARGE_EDIT_SURFACE_THRESHOLD = 6;
const CONTEXT_UTILIZATION_MIN_INSPECTIONS = 6;
const CONTEXT_UTILIZATION_MIN_PERCENT = 35;

export function redactTraceText(value: unknown): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const eq = match.indexOf('=');
      if (eq > 0) return `${match.slice(0, eq + 1)}[REDACTED]`;
      const colon = match.indexOf(':');
      if (colon > 0 && /(api|token|secret|password)/i.test(match.slice(0, colon))) {
        return `${match.slice(0, colon + 1)} "[REDACTED]"`;
      }
      if (match.startsWith('sk-or-v1-')) return 'sk-or-v1-[REDACTED]';
      if (match.startsWith('sk-')) return 'sk-[REDACTED]';
      if (match.startsWith('hf_')) return 'hf_[REDACTED]';
      if (match.startsWith('KGAT_')) return 'KGAT_[REDACTED]';
      if (match.startsWith('npm_')) return 'npm_[REDACTED]';
      return '[REDACTED]';
    });
  }
  return text;
}

export function makeBenchmarkTraceEvent(opts: {
  seq: number;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  isError: boolean;
  elapsedMs: number;
}): BenchmarkTraceEvent {
  const inputPreview = truncate(redactTraceText(opts.input), 600);
  const verification = isVerificationTool(opts.tool, opts.input);
  const outputPreview = traceOutputPreview(redactTraceText(opts.output), opts.tool, verification);
  const target = summarizeTarget(opts.tool, opts.input);

  return {
    seq: opts.seq,
    tool: opts.tool,
    target: truncate(redactTraceText(target), 240),
    status: opts.isError ? 'error' : 'ok',
    verification,
    elapsedMs: Math.max(0, Math.floor(opts.elapsedMs)),
    inputPreview,
    outputPreview,
  };
}

function normalizeInvalidToolActionReason(reason: string): string {
  const normalized = reason.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.slice(0, 80) || 'invalid_action';
}

export function makeBenchmarkInvalidToolActionEvent(opts: {
  seq: number;
  tool: string;
  reason: string;
  evidence: string;
  input?: Record<string, unknown>;
  elapsedMs?: number;
}): BenchmarkTraceEvent {
  const tool = opts.tool.trim() || 'unknown';
  const reason = normalizeInvalidToolActionReason(opts.reason);
  const inputPreview = truncate(redactTraceText({
    tool,
    reason,
    ...(opts.input ? { input: opts.input } : {}),
  }), 600);
  return {
    seq: opts.seq,
    tool: BENCHMARK_INVALID_TOOL_ACTION_TOOL,
    target: truncate(redactTraceText(`${reason}:${tool}`), 240),
    status: 'error',
    verification: false,
    elapsedMs: Math.max(0, Math.floor(opts.elapsedMs ?? 0)),
    inputPreview,
    outputPreview: traceOutputPreview(redactTraceText(opts.evidence), BENCHMARK_INVALID_TOOL_ACTION_TOOL, false),
  };
}

export function buildBenchmarkTraceSummary(input: BenchmarkTraceWriteInput): BenchmarkTraceSummary {
  const endedAtMs = input.endedAtMs ?? Date.now();
  const events = input.events.map((event) => ({
    ...event,
    target: redactTraceText(event.target),
    inputPreview: truncate(redactTraceText(event.inputPreview), 600),
    outputPreview: traceOutputPreview(redactTraceText(event.outputPreview), event.tool, event.verification),
  }));
  const changedFiles = Array.from(new Set(input.messages.flatMap(extractChangedFiles))).slice(0, 80);
  const verificationCommands = Array.from(new Set(
    events
      .filter((event) => event.verification && event.tool === 'bash')
      .map((event) => event.target.replace(/^\$ /, '').trim())
      .filter(Boolean),
  )).slice(0, 40);
  const finalAssistant = [...input.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim())
    ?.content ?? '';
  const finalAssistantText = truncate(redactTraceText(finalAssistant), 3000);
  const usage = buildBenchmarkUsageSummary(input.usageEvents ?? []);
  const verificationEvidence = buildBenchmarkVerificationEvidence(events);
  const finalAnswerEvidence = buildBenchmarkFinalAnswerEvidence(finalAssistantText, verificationEvidence, events);
  const trajectoryQuality = buildBenchmarkTrajectoryQuality(events, usage);
  const experienceCard = buildBenchmarkExperienceCard({
    events,
    messages: input.messages,
    changedFiles,
    verificationCommands,
    verificationEvidence,
    trajectoryQuality,
  });

  return {
    version: 1,
    sessionId: input.sessionId,
    mode: input.mode,
    cwd: input.cwd,
    provider: input.config.provider,
    model: input.config.model,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs: Math.max(0, endedAtMs - input.startedAtMs),
    toolCallCount: events.length,
    errorCount: events.filter((event) => event.status === 'error').length,
    usage,
    verificationCount: events.filter((event) => event.verification).length,
    verificationCommands,
    verificationEvidence,
    finalAnswerEvidence,
    changedFiles,
    worktreeChangedFiles: [],
    artifacts: [],
    openAgentLeaderboardDraft: buildOpenAgentLeaderboardDraft(input, events, usage, verificationEvidence, finalAnswerEvidence, trajectoryQuality),
    trajectoryQuality,
    experienceCard,
    finalAssistant: finalAssistantText,
    events,
  };
}

export function buildBenchmarkExperienceCard(input: {
  events: BenchmarkTraceEvent[];
  messages: Message[];
  changedFiles: string[];
  verificationCommands: string[];
  verificationEvidence: BenchmarkVerificationEvidence;
  trajectoryQuality: BenchmarkTrajectoryQuality;
}): BenchmarkExperienceCard {
  return {
    version: 1,
    replayCheckpoints: buildBenchmarkExperienceReplayCheckpoints(input.events),
    failureSignatures: input.verificationEvidence.failureSignatures
      .slice(-4)
      .map((signature) => ({
        ...signature,
        command: truncate(redactTraceText(signature.command), 180),
        tests: signature.tests.map((test) => truncate(redactTraceText(test), 160)).slice(0, 4),
        files: signature.files.map((file) => truncate(redactTraceText(file), 160)).slice(0, 6),
        errors: signature.errors.map((error) => truncate(redactTraceText(error), 180)).slice(0, 3),
        raw: truncate(redactTraceText(signature.raw), 240),
      })),
    sourceResearchCoverage: input.trajectoryQuality.sourceResearchCoverage,
    taskContract: buildBenchmarkExperienceTaskContract(input.events, input.trajectoryQuality),
    environmentReconstruction: buildBenchmarkExperienceEnvironmentReconstruction(input.trajectoryQuality),
    dependencyUpgrade: buildBenchmarkExperienceDependencyUpgrade(input.trajectoryQuality),
    decisionObservability: buildBenchmarkExperienceDecisionObservability(input.messages, input.events),
    verificationCommands: input.verificationCommands
      .map((command) => truncate(redactTraceText(command), 180))
      .slice(0, 12),
    changedFiles: uniqueStrings(input.changedFiles)
      .map((file) => truncate(redactTraceText(file), 160))
      .slice(0, 20),
    warnings: input.trajectoryQuality.warnings
      .map((warning) => truncate(redactTraceText(warning), 220))
      .slice(0, 8),
  };
}

function buildBenchmarkExperienceDecisionObservability(
  messages: Message[],
  events: BenchmarkTraceEvent[],
): BenchmarkExperienceDecisionObservability {
  const editEvents = [...events].filter(isEditEvent).sort((a, b) => a.seq - b.seq);
  const assistantEditCalls = extractAssistantEditDecisionCalls(messages);
  const editPredictions: BenchmarkExperienceEditPrediction[] = [];

  for (let index = 0; index < editEvents.length; index++) {
    const event = editEvents[index];
    const decision = assistantEditCalls[index];
    const prediction = extractExplicitEditPrediction(decision?.content ?? '');
    if (!prediction) continue;
    const nextVerifier = [...events]
      .filter((candidate) => candidate.seq > event.seq && candidate.verification)
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
    editPredictions.push({
      editSeq: event.seq,
      tool: truncate(redactTraceText(event.tool), 80),
      target: truncate(redactTraceText(decision?.target || event.target || 'unknown'), 160),
      prediction,
      nextVerifierSeq: nextVerifier?.seq ?? null,
      nextVerifierStatus: nextVerifier?.status ?? null,
      nextVerifierCommand: nextVerifier ? truncate(redactTraceText(verifierCommandForEvent(nextVerifier)), 180) : null,
    });
  }

  return {
    editCount: editEvents.length,
    predictedEditCount: editPredictions.length,
    verifiedPredictionCount: editPredictions.filter((prediction) => prediction.nextVerifierStatus === 'ok').length,
    editPredictions: editPredictions.slice(0, 12),
  };
}

function extractAssistantEditDecisionCalls(messages: Message[]): Array<{ content: string; tool: string; target: string }> {
  const out: Array<{ content: string; tool: string; target: string }> = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.tool_calls) continue;
    const content = typeof message.content === 'string' ? message.content : '';
    for (const call of message.tool_calls) {
      const tool = call.function?.name ?? '';
      if (!isEditToolName(tool)) continue;
      const args = parseJsonObject(call.function?.arguments ?? '');
      out.push({
        content,
        tool,
        target: summarizeTarget(tool, args),
      });
    }
  }
  return out;
}

function isEditToolName(tool: string): boolean {
  return ['write_file', 'edit_file', 'apply_patch'].includes(tool);
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function extractExplicitEditPrediction(content: string): string | null {
  const text = content.replace(/\r/g, '').trim();
  if (!text) return null;
  const tagged = text.match(/<prediction>\s*([\s\S]*?)\s*<\/prediction>/i)?.[1]?.trim();
  if (tagged) return truncate(redactTraceText(tagged.replace(/\s+/g, ' ')), 220);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = /^(?:[-*]\s*)?(?:prediction|hypothesis|expected outcome|verification prediction)\s*[:\-]\s*(.+)$/i.exec(line);
    if (match?.[1]) return truncate(redactTraceText(match[1].replace(/\s+/g, ' ').trim()), 220);
  }
  return null;
}

function buildBenchmarkExperienceEnvironmentReconstruction(
  quality: BenchmarkTrajectoryQuality,
): BenchmarkExperienceEnvironmentReconstruction {
  return {
    setupFailureCount: quality.environmentSetupFailureCount,
    unresolvedSetupFailureCount: quality.unresolvedEnvironmentSetupFailureCount,
    setupCount: quality.environmentSetupCount,
    successfulSetupCount: quality.successfulEnvironmentSetupCount,
    setupEvents: quality.environmentSetupEvents
      .map(compactBenchmarkEnvironmentSetupEvent)
      .slice(0, 8),
    setupFailures: quality.environmentSetupFailureEvents
      .map(compactBenchmarkEnvironmentSetupFailureEvent)
      .slice(0, 8),
    unresolvedSetupFailures: quality.unresolvedEnvironmentSetupFailureEvents
      .map(compactBenchmarkEnvironmentSetupFailureEvent)
      .slice(0, 8),
  };
}

function compactBenchmarkEnvironmentSetupEvent(event: BenchmarkEnvironmentSetupEvent): BenchmarkEnvironmentSetupEvent {
  return {
    seq: event.seq,
    command: truncate(redactTraceText(event.command), 180),
    status: event.status,
    kind: truncate(redactTraceText(event.kind), 100),
  };
}

function compactBenchmarkEnvironmentSetupFailureEvent(
  event: BenchmarkEnvironmentSetupFailureEvent,
): BenchmarkEnvironmentSetupFailureEvent {
  return {
    seq: event.seq,
    command: truncate(redactTraceText(event.command), 180),
    reason: truncate(redactTraceText(event.reason), 120),
    evidence: truncate(redactTraceText(event.evidence), 180),
  };
}

function buildBenchmarkExperienceDependencyUpgrade(
  quality: BenchmarkTrajectoryQuality,
): BenchmarkExperienceDependencyUpgrade {
  return {
    manifestEditCount: quality.dependencyManifestEditCount,
    lockfileEditCount: quality.dependencyLockfileEditCount,
    manifestEdits: quality.dependencyManifestEditEvents
      .map(compactBenchmarkDependencyEditEvent)
      .slice(0, 8),
    lockfileEdits: quality.dependencyLockfileEditEvents
      .map(compactBenchmarkDependencyEditEvent)
      .slice(0, 8),
    setupAfterManifestEdit: quality.dependencySetupAfterManifestEdit,
    passingSetupAfterManifestEdit: quality.passingDependencySetupAfterManifestEdit,
    validationAfterManifestEdit: quality.dependencyValidationAfterManifestEdit,
    passingValidationAfterManifestEdit: quality.passingDependencyValidationAfterManifestEdit,
    firstSetupAfterManifestEditSeq: quality.firstDependencySetupAfterManifestEditSeq,
    firstValidationAfterManifestEditSeq: quality.firstDependencyValidationAfterManifestEditSeq,
  };
}

function compactBenchmarkDependencyEditEvent(event: BenchmarkDependencyEditEvent): BenchmarkDependencyEditEvent {
  return {
    seq: event.seq,
    tool: truncate(redactTraceText(event.tool), 80),
    target: truncate(redactTraceText(event.target), 160),
    ecosystem: truncate(redactTraceText(event.ecosystem), 80),
    kind: event.kind,
  };
}

function buildBenchmarkExperienceTaskContract(
  events: BenchmarkTraceEvent[],
  quality: BenchmarkTrajectoryQuality,
): BenchmarkExperienceTaskContract {
  return {
    signalCount: quality.taskContractSignalCount,
    signals: extractBenchmarkExperienceTaskContractSignals(events),
    checklistAfterContext: quality.taskContractChecklistAfterContext,
    checklistComplete: quality.taskContractChecklistComplete,
    incompleteCount: quality.todoIncompleteCount,
    incompleteItems: quality.todoIncompleteItems
      .map((item) => ({
        status: item.status,
        content: truncate(redactTraceText(item.content), 160),
      }))
      .slice(0, 10),
  };
}

function extractBenchmarkExperienceTaskContractSignals(events: BenchmarkTraceEvent[]): string[] {
  return uniqueStrings(events
    .filter((event) => event.tool === 'benchmark_context')
    .flatMap((event) => extractTaskContractSignalLines(event.outputPreview))
    .map((line) => truncate(redactTraceText(line), 220)))
    .slice(0, 12);
}

function buildBenchmarkExperienceReplayCheckpoints(events: BenchmarkTraceEvent[]): BenchmarkExperienceReplayCheckpoint[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const firstEditSeq = firstSeq(sorted, isEditEvent);
  const candidates: BenchmarkExperienceReplayCheckpoint[] = [];
  for (const event of sorted) {
    if (firstEditSeq != null && event.seq > firstEditSeq) continue;
    const checkpoint = experienceReplayCheckpointForEvent(event);
    if (checkpoint) candidates.push(checkpoint);
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, 8)
    .sort((a, b) => a.seq - b.seq);
}

function experienceReplayCheckpointForEvent(event: BenchmarkTraceEvent): BenchmarkExperienceReplayCheckpoint | null {
  if (event.tool === 'bash' && event.verification && event.status === 'error') {
    const command = verifierCommandForEvent(event);
    if (!command) return null;
    return {
      seq: event.seq,
      tool: event.tool,
      target: truncate(redactTraceText(command), 180),
      reason: 'failing_verifier',
      score: 12,
    };
  }

  if (!['read_file', 'grep', 'glob', 'list_dir'].includes(event.tool)) return null;
  const target = event.target.trim() || summarizeReplayInputTarget(event.inputPreview);
  if (!target || (event.tool === 'list_dir' && target === '.')) return null;
  const score = event.tool === 'read_file'
    ? 11
    : event.tool === 'grep'
      ? 10
      : event.tool === 'glob'
        ? 8
        : 5;
  return {
    seq: event.seq,
    tool: event.tool,
    target: truncate(redactTraceText(target), 180),
    reason: event.tool === 'read_file' ? 'file_context' : 'search_context',
    score,
  };
}

function summarizeReplayInputTarget(inputPreview: string): string {
  const input = parseEventInputPreview(inputPreview);
  for (const key of ['file_path', 'path', 'pattern', 'command']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function buildOpenAgentLeaderboardDraft(
  input: BenchmarkTraceWriteInput,
  events: BenchmarkTraceEvent[],
  usage: BenchmarkUsageSummary,
  verificationEvidence: BenchmarkVerificationEvidence,
  finalAnswerEvidence: BenchmarkFinalAnswerEvidence,
  trajectoryQuality: BenchmarkTrajectoryQuality,
): OpenAgentLeaderboardDraft {
  const benchmark = extractBenchmarkSlug(input.messages);
  const finished = finalAnswerEvidence.finalAnswerCompletion === 'blocked'
    || finalAnswerEvidence.finalAnswerCompletion === 'incomplete'
    ? 0
    : (events.length > 0 || finalAnswerEvidence.mentionsVerification ? 1 : null);
  const incompleteSessions = finalAnswerEvidence.finalAnswerCompletion === 'blocked'
    || finalAnswerEvidence.finalAnswerCompletion === 'incomplete'
    ? 1
    : 0;
  const percentError = events.length > 0 && events.every((event) => event.status === 'error') ? 1 : 0;
  const compactWarnings = Array.from(new Set([
    ...trajectoryQuality.warnings,
    ...finalAnswerEvidence.warnings,
    'Draft only: official Exgentic/Open Agent Leaderboard results are required before claiming a leaderboard score.',
  ])).slice(0, 20);

  return {
    version: 1,
    source: 'ventipus benchmark trace',
    submissionReady: false,
    reason: 'Ventipus trace draft lacks official benchmark_score, successful_sessions, and benchmark-owned session_results. Run an official harness such as Exgentic, HAL, Terminal-Bench, or KBench before submitting or claiming leaderboard performance.',
    agent: 'ventipus_agent',
    agent_name: 'Ventipus',
    benchmark,
    benchmark_name: formatBenchmarkName(benchmark),
    model: input.config.model,
    model_name: input.config.model,
    total_sessions: 1,
    planned_sessions: 1,
    completed_sessions: finished,
    incomplete_sessions: incompleteSessions,
    missing_sessions: 0,
    successful_sessions: null,
    benchmark_score: null,
    average_score: null,
    average_steps: events.length,
    average_action_count: events.length,
    average_invalid_action_count: trajectoryQuality.invalidToolActionCount,
    average_invalid_action_percent: trajectoryQuality.invalidToolActionPercent,
    average_agent_cost: usage.estimatedCostUsd,
    total_agent_cost: usage.estimatedCostUsd,
    average_benchmark_cost: 0,
    total_benchmark_cost: 0,
    total_run_cost: usage.estimatedCostUsd,
    percent_finished: finished,
    percent_successful: null,
    percent_finished_successful: null,
    percent_finished_unsuccessful: null,
    percent_unfinished: finished === null ? null : 1 - finished,
    percent_error: percentError,
    compact_process_score: trajectoryQuality.processScore,
    subset_name: extractBenchmarkSubsetName(input.messages),
    compact_final_answer_completion: finalAnswerEvidence.finalAnswerCompletion,
    compact_latest_verification_status: verificationEvidence.lastVerificationStatus,
    compact_verification_count: events.filter((event) => event.verification).length,
    compact_warnings: compactWarnings,
    missingOfficialFields: ['benchmark_score', 'successful_sessions', 'session_results'],
  };
}

function extractBenchmarkSlug(messages: Message[]): string {
  const text = messages.map(messageText).join('\n');
  const slashMatch = text.match(/\/(?:benchmark|bench|leaderboard)\s+([A-Za-z0-9_.-]+)/i);
  const profile = (slashMatch?.[1] ?? '').toLowerCase().trim();
  if (profile) return normalizeBenchmarkSlug(profile);

  if (/\bswe[-_ ]?chain\b/i.test(text)) return 'swechain';
  if (/\bci[-_ ]?repair(?:[-_ ]?bench)?\b|\bswe[-_ ]?ci\b/i.test(text)) return 'cirepairbench';
  if (/\bterminal[- ]bench\b/i.test(text)) return 'terminalbench';
  if (/\bswe[- ]bench\b/i.test(text)) return 'swebench';
  if (/\bappworld\b/i.test(text)) return 'appworld';
  if (/\btau\s*2\b|\btau2\b/i.test(text)) return 'tau2';
  if (/\bbfcl\b|berkeley function calling/i.test(text)) return 'bfcl';
  if (/\bgsm8k\b/i.test(text)) return 'gsm8k';
  if (/\bhotpotqa\b/i.test(text)) return 'hotpotqa';
  if (/\bbrowsecomp/i.test(text)) return 'browsecompplus';
  return 'ventipus_agent_benchmark';
}

function normalizeBenchmarkSlug(value: string): string {
  const cleaned = value.replace(/[^a-z0-9]+/g, '');
  if (cleaned === 'swebench' || cleaned === 'swe') return 'swebench';
  if (cleaned === 'terminalbench' || cleaned === 'tb' || cleaned === 'tb2') return 'terminalbench';
  if (cleaned === 'swecontext') return 'swecontext';
  if (cleaned === 'swechain' || cleaned === 'chain' || cleaned === 'upgrade') return 'swechain';
  if (cleaned === 'cirepair' || cleaned === 'cirepairbench' || cleaned === 'sweci' || cleaned === 'ci') return 'cirepairbench';
  if (cleaned === 'taubench' || cleaned === 'tau' || cleaned === 'tau2') return 'tau2';
  if (cleaned === 'browsecomp' || cleaned === 'browsecompplus') return 'browsecompplus';
  return cleaned || 'ventipus_agent_benchmark';
}

function formatBenchmarkName(slug: string): string {
  const names: Record<string, string> = {
    appworld: 'AppWorld',
    bfcl: 'Berkeley Function Calling Leaderboard',
    browsecompplus: 'BrowseCompPlus',
    ventipus_agent_benchmark: 'Ventipus Benchmark',
    gsm8k: 'GSM8K',
    hotpotqa: 'HotpotQA',
    cirepairbench: 'CI-Repair-Bench',
    swebench: 'SWE-bench',
    swechain: 'SWE-Chain',
    swecontext: 'SWE-context',
    tau2: 'Tau Bench 2',
    terminalbench: 'Terminal-Bench',
  };
  return names[slug] ?? slug;
}

function extractBenchmarkSubsetName(messages: Message[]): string | null {
  const text = messages.map(messageText).join('\n');
  const subset = text.match(/\b(?:subset|split)\s*[:=]\s*([A-Za-z0-9_.-]+)/i);
  if (subset?.[1]) return subset[1];
  if (/\btest_normal\b/i.test(text)) return 'test_normal';
  if (/\bairline\b/i.test(text)) return 'airline';
  if (/\bretail\b/i.test(text)) return 'retail';
  if (/\btelecom\b/i.test(text)) return 'telecom';
  return null;
}

function messageText(message: Message): string {
  const content: unknown = (message as any).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      if (part && typeof part.content === 'string') return part.content;
      return '';
    }).filter(Boolean).join('\n');
  }
  return '';
}

export function buildBenchmarkUsageSummary(events: BenchmarkUsageEvent[]): BenchmarkUsageSummary {
  const byModelMap = new Map<string, BenchmarkModelUsageSummary>();
  const summary: BenchmarkUsageSummary = {
    callCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: [],
  };

  for (const event of events) {
    const model = event.model.trim() || 'unknown';
    const promptTokens = safeTokenCount(event.promptTokens);
    const completionTokens = safeTokenCount(event.completionTokens);
    const totalTokens = safeTokenCount(event.totalTokens) || promptTokens + completionTokens;
    const estimatedCostUsd = Number.isFinite(event.estimatedCostUsd)
      ? Math.max(0, event.estimatedCostUsd)
      : 0;

    summary.callCount++;
    summary.promptTokens += promptTokens;
    summary.completionTokens += completionTokens;
    summary.totalTokens += totalTokens;
    summary.estimatedCostUsd += estimatedCostUsd;

    const modelSummary = byModelMap.get(model) ?? {
      model,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    modelSummary.calls++;
    modelSummary.promptTokens += promptTokens;
    modelSummary.completionTokens += completionTokens;
    modelSummary.totalTokens += totalTokens;
    modelSummary.estimatedCostUsd += estimatedCostUsd;
    byModelMap.set(model, modelSummary);
  }

  summary.estimatedCostUsd = roundCost(summary.estimatedCostUsd);
  summary.byModel = Array.from(byModelMap.values())
    .map((model) => ({ ...model, estimatedCostUsd: roundCost(model.estimatedCostUsd) }))
    .sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model))
    .slice(0, 20);
  return summary;
}

function emptyBenchmarkUsageSummary(): BenchmarkUsageSummary {
  return {
    callCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: [],
  };
}

function formatBenchmarkUsageSummary(usage: BenchmarkUsageSummary): string {
  const tokenLabel = `${usage.totalTokens.toLocaleString()} tokens`;
  const callLabel = `${usage.callCount} ${usage.callCount === 1 ? 'call' : 'calls'}`;
  const costLabel = `$${usage.estimatedCostUsd.toFixed(4)}`;
  return `${callLabel}, ${tokenLabel}, ${costLabel}`;
}

function isHighBenchmarkUsage(usage: BenchmarkUsageSummary): boolean {
  return usage.totalTokens >= COST_EFFICIENCY_TOKEN_THRESHOLD
    || usage.callCount >= COST_EFFICIENCY_CALL_THRESHOLD
    || usage.estimatedCostUsd >= COST_EFFICIENCY_USD_THRESHOLD;
}

function costEfficiencySeverity(usage: BenchmarkUsageSummary): BenchmarkProcessDefectSeverity {
  return usage.totalTokens >= COST_EFFICIENCY_HIGH_TOKEN_THRESHOLD
    || usage.callCount >= COST_EFFICIENCY_HIGH_CALL_THRESHOLD
    || usage.estimatedCostUsd >= COST_EFFICIENCY_HIGH_USD_THRESHOLD
    ? 'high'
    : 'medium';
}

function hasBenchmarkCostEfficiencyRisk(input: {
  usage: BenchmarkUsageSummary;
  benchmarkContextUsed: boolean;
  editCount: number;
  verificationCount: number;
  successfulVerificationCount: number;
  passingValidationAfterFirstEdit: boolean | null;
  passingValidationAfterLastEdit: boolean | null;
  redundantToolCallCount: number;
  redundantVerifierCount: number;
  blindRepairCount: number;
  incompleteVerifierCount: number;
  inconclusiveVerifierCount: number;
  sourceResearchUsed: boolean;
  sourceResearchCoverage: SourceResearchCoverage;
  leakageRiskCount: number;
  invalidToolActionCount: number;
}): boolean {
  if (!isHighBenchmarkUsage(input.usage)) return false;
  if (!input.benchmarkContextUsed) return true;
  if (input.leakageRiskCount > 0) return true;
  if (input.invalidToolActionCount > 0) return true;
  if (input.editCount > 0 && input.passingValidationAfterFirstEdit !== true) return true;
  if (input.editCount > 0 && input.passingValidationAfterLastEdit === false) return true;
  if (input.editCount === 0 && input.verificationCount === 0 && input.successfulVerificationCount === 0) return true;
  if (input.redundantToolCallCount >= 2 || input.redundantVerifierCount >= 2) return true;
  if (input.blindRepairCount >= 2) return true;
  if (input.incompleteVerifierCount > 0 || input.inconclusiveVerifierCount > 0) return true;
  if (input.sourceResearchUsed && (!input.sourceResearchCoverage.completeTargetedCoverage || input.sourceResearchCoverage.sourceHitCount === 0)) return true;
  return false;
}

export function buildBenchmarkTrajectoryQuality(
  events: BenchmarkTraceEvent[],
  usage: BenchmarkUsageSummary = emptyBenchmarkUsageSummary(),
): BenchmarkTrajectoryQuality {
  const firstInspectSeq = firstSeq(events, isInspectionEvent);
  const firstEditSeq = firstSeq(events, isEditEvent);
  const lastEditSeq = lastSeq(events, isEditEvent);
  const firstVerificationSeq = firstSeq(events, (event) => event.verification);
  const firstSuccessfulVerificationSeq = firstSeq(events, (event) => event.verification && event.status === 'ok');
  const firstFailedVerificationSeq = firstSeq(events, (event) => event.verification && event.status === 'error');
  const firstConclusiveFailedVerificationSeq = firstSeq(events, isConclusiveFailedVerification);
  const firstBenchmarkContextSeq = firstSeq(events, (event) => event.tool === 'benchmark_context');
  const inspectCount = events.filter(isInspectionEvent).length;
  const editCount = events.filter(isEditEvent).length;
  const verificationCount = events.filter((event) => event.verification).length;
  const successfulVerificationCount = events.filter((event) => event.verification && event.status === 'ok').length;
  const failedVerificationCount = events.filter((event) => event.verification && event.status === 'error').length;
  const incompleteVerifierEvents = buildBenchmarkIncompleteVerifierEvents(events);
  const inconclusiveVerifierEvents = incompleteVerifierEvents.filter((event) => !event.conclusiveFailureEvidence);
  const environmentSetupFailureEvents = buildBenchmarkEnvironmentSetupFailureEvents(events);
  const environmentSetupEvents = buildBenchmarkEnvironmentSetupEvents(events);
  const unresolvedEnvironmentSetupFailureEvents = buildBenchmarkUnresolvedEnvironmentSetupFailureEvents(
    events,
    environmentSetupFailureEvents,
    environmentSetupEvents,
  );
  const dependencyEditEvents = buildBenchmarkDependencyEditEvents(events);
  const dependencyManifestEditEvents = dependencyEditEvents.filter((event) => event.kind === 'manifest');
  const dependencyLockfileEditEvents = dependencyEditEvents.filter((event) => event.kind === 'lockfile');
  const firstDependencyManifestEditSeq = dependencyManifestEditEvents[0]?.seq ?? null;
  const firstDependencySetupAfterManifestEditSeq = firstDependencyManifestEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > firstDependencyManifestEditSeq && isDependencySetupEvent(event));
  const firstDependencyValidationAfterManifestEditSeq = firstDependencyManifestEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > firstDependencyManifestEditSeq && event.verification);
  const dependencySetupAfterManifestEdit = firstDependencyManifestEditSeq == null
    ? null
    : firstDependencySetupAfterManifestEditSeq != null;
  const passingDependencySetupAfterManifestEdit = firstDependencyManifestEditSeq == null
    ? null
    : events.some((event) => event.seq > firstDependencyManifestEditSeq && event.status === 'ok' && isDependencySetupEvent(event));
  const dependencyValidationAfterManifestEdit = firstDependencyManifestEditSeq == null
    ? null
    : firstDependencyValidationAfterManifestEditSeq != null;
  const passingDependencyValidationAfterManifestEdit = firstDependencyManifestEditSeq == null
    ? null
    : events.some((event) => event.seq > firstDependencyManifestEditSeq && event.verification && event.status === 'ok');
  const skillViewEvents = buildBenchmarkSkillViewEvents(events);
  const firstSkillViewSeq = skillViewEvents[0]?.seq ?? null;
  const skillNames = uniqueStrings(skillViewEvents.map((event) => event.name)).slice(0, 12);
  const skillLoadedBeforeLocalContext = firstSkillViewSeq != null
    && (firstBenchmarkContextSeq == null || firstSkillViewSeq < firstBenchmarkContextSeq)
    && (firstInspectSeq == null || firstSkillViewSeq < firstInspectSeq);
  const excessiveSkillViewCount = skillViewEvents.length > 2;
  const ciVerifierCommands = extractCiVerifierCommandsFromContext(events);
  const ciWorkflowCommandCount = ciVerifierCommands.length;
  const benchmarkContextUsed = events.some((event) => event.tool === 'benchmark_context');
  const sourceResearchUsed = events.some((event) => event.tool === 'research_sources');
  const sourceResearchCoverage = buildSourceResearchCoverage(events);
  const taskContractSignalCount = countTaskContractSignals(events);
  const firstTaskContractSeq = firstSeq(events, (event) => event.tool === 'benchmark_context' && countTaskContractSignalsInOutput(event.outputPreview) > 0);
  const firstNoEditContractSeq = firstSeq(events, (event) => event.tool === 'benchmark_context' && hasNoEditContractInOutput(event.outputPreview));
  const firstTodoSeq = firstSeq(events, isTodoChecklistEvent);
  const latestTodoState = buildBenchmarkLatestTodoState(events);
  const taskContractChecklistUsed = firstTodoSeq != null;
  const taskContractChecklistAfterContext = taskContractSignalCount === 0
    ? null
    : firstTaskContractSeq != null && firstTodoSeq != null && firstTodoSeq > firstTaskContractSeq;
  const taskContractChecklistComplete = taskContractSignalCount === 0
    ? null
    : taskContractChecklistAfterContext === true && latestTodoState != null && latestTodoState.incompleteCount === 0;
  const noEditContractDetected = firstNoEditContractSeq != null;
  const editAfterNoEditContract = noEditContractDetected && firstEditSeq != null && firstEditSeq > firstNoEditContractSeq;
  const editTargetEvidence = buildBenchmarkEditTargetEvidence(events);
  const contextUtilization = buildBenchmarkContextUtilization(events, editTargetEvidence.targets);
  const broadEditContractDetected = hasBroadEditContract(events);
  const editSurface = buildBenchmarkEditSurface(events);
  const redundantToolCallEvents = buildBenchmarkRedundantToolCallEvents(events);
  const redundantVerifierEvents = buildBenchmarkRedundantVerifierEvents(events);
  const blindRepairEvents = buildBenchmarkBlindRepairEvents(events);
  const failureRepairAlignment = buildBenchmarkFailureRepairAlignment(events);
  const postEditRegressionCycleEvents = buildBenchmarkPostEditRegressionCycleEvents(events);
  const scratchArtifactPermissionDetected = hasScratchArtifactPermission(events);
  const scratchArtifactEvents = buildBenchmarkScratchArtifactEvents(events);
  const testEditPermissionDetected = hasTestEditPermission(events);
  const testHarnessEditEvents = buildBenchmarkTestHarnessEditEvents(events);
  const leakageRiskEvents = buildBenchmarkLeakageRiskEvents(events);
  const invalidToolActionEvents = buildBenchmarkInvalidToolActionEvents(events);
  const invalidToolActionPercent = events.length === 0
    ? 0
    : Number(((invalidToolActionEvents.length / events.length) * 100).toFixed(2));
  const firstPostEditDiffReviewSeq = firstEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > firstEditSeq && isDiffReviewEvent(event));
  const firstDiffReviewAfterLastEditSeq = lastEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > lastEditSeq && isDiffReviewEvent(event));
  const firstBroadValidationAfterFirstEditSeq = firstEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > firstEditSeq && event.verification && isBroadVerificationEvent(event));
  const firstCiValidationAfterFirstEditSeq = firstEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : firstSeq(events, (event) => event.seq > firstEditSeq && isCiVerificationEvent(event, ciVerifierCommands));
  const firstValidationAfterLastEditSeq = lastEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > lastEditSeq && event.verification);
  const firstBroadValidationAfterLastEditSeq = lastEditSeq == null
    ? null
    : firstSeq(events, (event) => event.seq > lastEditSeq && event.verification && isBroadVerificationEvent(event));
  const firstCiValidationAfterLastEditSeq = lastEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : firstSeq(events, (event) => event.seq > lastEditSeq && isCiVerificationEvent(event, ciVerifierCommands));
  const lastPostEditVerification = firstEditSeq == null
    ? undefined
    : [...events].reverse().find((event) => event.verification && event.seq > firstEditSeq);
  const lastPostEditVerificationSeq = lastPostEditVerification?.seq ?? null;
  const lastPostEditVerificationStatus = lastPostEditVerification?.status ?? null;
  const lastPostEditVerificationConclusiveFailure = lastPostEditVerification == null
    ? null
    : isConclusiveFailedVerification(lastPostEditVerification);

  const localizationBeforeFirstEdit = firstEditSeq == null
    ? null
    : firstInspectSeq != null && firstInspectSeq < firstEditSeq;
  const reproductionBeforeFirstEdit = firstEditSeq == null
    ? null
    : firstVerificationSeq != null && firstVerificationSeq < firstEditSeq;
  const failingReproductionBeforeFirstEdit = firstEditSeq == null
    ? null
    : firstConclusiveFailedVerificationSeq != null && firstConclusiveFailedVerificationSeq < firstEditSeq;
  const validationAfterFirstEdit = firstEditSeq == null
    ? null
    : events.some((event) => event.verification && event.seq > firstEditSeq);
  const passingValidationAfterFirstEdit = firstEditSeq == null
    ? null
    : events.some((event) => event.verification && event.status === 'ok' && event.seq > firstEditSeq);
  const broadValidationAfterFirstEdit = firstEditSeq == null
    ? null
    : firstBroadValidationAfterFirstEditSeq != null;
  const passingBroadValidationAfterFirstEdit = firstEditSeq == null
    ? null
    : events.some((event) => event.verification && event.status === 'ok' && event.seq > firstEditSeq && isBroadVerificationEvent(event));
  const ciValidationAfterFirstEdit = firstEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : firstCiValidationAfterFirstEditSeq != null;
  const passingCiValidationAfterFirstEdit = firstEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : events.some((event) => event.status === 'ok' && event.seq > firstEditSeq && isCiVerificationEvent(event, ciVerifierCommands));
  const validationAfterLastEdit = lastEditSeq == null
    ? null
    : firstValidationAfterLastEditSeq != null;
  const passingValidationAfterLastEdit = lastEditSeq == null
    ? null
    : events.some((event) => event.verification && event.status === 'ok' && event.seq > lastEditSeq);
  const broadValidationAfterLastEdit = lastEditSeq == null
    ? null
    : firstBroadValidationAfterLastEditSeq != null;
  const passingBroadValidationAfterLastEdit = lastEditSeq == null
    ? null
    : events.some((event) => event.verification && event.status === 'ok' && event.seq > lastEditSeq && isBroadVerificationEvent(event));
  const ciValidationAfterLastEdit = lastEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : firstCiValidationAfterLastEditSeq != null;
  const passingCiValidationAfterLastEdit = lastEditSeq == null || ciVerifierCommands.length === 0
    ? null
    : events.some((event) => event.status === 'ok' && event.seq > lastEditSeq && isCiVerificationEvent(event, ciVerifierCommands));
  const finalEditVerificationEvents = lastEditSeq == null
    ? []
    : events.filter((event) => event.verification && event.seq > lastEditSeq);
  const finalEditPassingVerificationEvents = finalEditVerificationEvents.filter((event) => event.status === 'ok');
  const finalEditVerificationCount = finalEditVerificationEvents.length;
  const finalEditPassingVerificationCount = finalEditPassingVerificationEvents.length;
  const stableValidationAfterLastEdit = lastEditSeq == null || passingValidationAfterLastEdit !== true
    ? null
    : finalEditPassingVerificationCount >= 2
      || passingBroadValidationAfterLastEdit === true
      || passingCiValidationAfterLastEdit === true;
  const postEditDiffReview = firstEditSeq == null
    ? null
    : firstPostEditDiffReviewSeq != null;
  const diffReviewAfterLastEdit = lastEditSeq == null
    ? null
    : firstDiffReviewAfterLastEditSeq != null;
  const requireFinalPostEditValidation = shouldRequireFinalPostEditValidation({
    firstEditSeq,
    lastEditSeq,
    validationAfterLastEdit,
    passingValidationAfterFirstEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireFinalPassingPostEditValidation = shouldRequireFinalPassingPostEditValidation({
    firstEditSeq,
    lastEditSeq,
    validationAfterLastEdit,
    passingValidationAfterLastEdit,
    passingValidationAfterFirstEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requirePostEditDiffReview = shouldRequirePostEditDiffReview({
    firstEditSeq,
    passingValidationAfterFirstEdit,
    postEditDiffReview,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testEditPermissionDetected,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireBroadPostEditValidation = shouldRequireBroadPostEditValidation({
    firstEditSeq,
    passingValidationAfterFirstEdit,
    broadValidationAfterFirstEdit,
    passingBroadValidationAfterFirstEdit,
    postEditDiffReview,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testEditPermissionDetected,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireLatestPostEditVerifierPassing = shouldRequireLatestPostEditVerifierPassing({
    firstEditSeq,
    passingValidationAfterFirstEdit,
    lastPostEditVerificationConclusiveFailure,
    requireFinalPassingPostEditValidation,
    requireBroadPostEditValidation,
    broadValidationAfterFirstEdit,
    passingBroadValidationAfterFirstEdit,
  });
  const requireStablePostEditValidation = shouldRequireStablePostEditValidation({
    firstEditSeq,
    passingValidationAfterLastEdit,
    stableValidationAfterLastEdit,
    lastPostEditVerificationStatus,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireTaskContractChecklistCompletion = shouldRequireTaskContractChecklistCompletion({
    taskContractSignalCount,
    taskContractChecklistAfterContext,
    taskContractChecklistComplete,
    todoIncompleteCount: latestTodoState?.incompleteCount ?? 0,
    passingValidationAfterFirstEdit,
    successfulVerificationCount,
    noEditContractDetected,
    editAfterNoEditContract,
    lastPostEditVerificationConclusiveFailure,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireFinalBroadPostEditValidation = shouldRequireFinalBroadPostEditValidation({
    firstEditSeq,
    lastEditSeq,
    firstBroadValidationAfterFirstEditSeq,
    passingValidationAfterLastEdit,
    passingBroadValidationAfterFirstEdit,
    passingBroadValidationAfterLastEdit,
    diffReviewAfterLastEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireFinalPostEditDiffReview = shouldRequireFinalPostEditDiffReview({
    firstEditSeq,
    lastEditSeq,
    passingValidationAfterLastEdit,
    postEditDiffReview,
    diffReviewAfterLastEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const largeEditSurfaceRequiresReview = editSurface.targets.length >= LARGE_EDIT_SURFACE_THRESHOLD
    && benchmarkContextUsed
    && !broadEditContractDetected
    && localizationBeforeFirstEdit !== false
    && editTargetEvidence.unlocalized.length === 0
    && !editAfterNoEditContract
    && !(testHarnessEditEvents.length > 0 && !testEditPermissionDetected)
    && leakageRiskEvents.length === 0;
  const requireCiPostEditValidation = shouldRequireCiPostEditValidation({
    ciVerifierCommands,
    firstEditSeq,
    passingValidationAfterFirstEdit,
    ciValidationAfterFirstEdit,
    passingCiValidationAfterFirstEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const requireFinalCiPostEditValidation = shouldRequireFinalCiPostEditValidation({
    ciVerifierCommands,
    firstEditSeq,
    lastEditSeq,
    firstCiValidationAfterFirstEditSeq,
    passingCiValidationAfterFirstEdit,
    ciValidationAfterLastEdit,
    passingCiValidationAfterLastEdit,
    passingValidationAfterLastEdit,
    diffReviewAfterLastEdit,
    localizationBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    testHarnessEditEvents,
    leakageRiskEvents,
  });
  const costEfficiencyRisk = hasBenchmarkCostEfficiencyRisk({
    usage,
    benchmarkContextUsed,
    editCount,
    verificationCount,
    successfulVerificationCount,
    passingValidationAfterFirstEdit,
    passingValidationAfterLastEdit,
    redundantToolCallCount: redundantToolCallEvents.length,
    redundantVerifierCount: redundantVerifierEvents.length,
    blindRepairCount: blindRepairEvents.length,
    incompleteVerifierCount: incompleteVerifierEvents.length,
    inconclusiveVerifierCount: inconclusiveVerifierEvents.length,
    sourceResearchUsed,
    sourceResearchCoverage,
    leakageRiskCount: leakageRiskEvents.length,
    invalidToolActionCount: invalidToolActionEvents.length,
  });

  const warnings: string[] = [];
  if (!benchmarkContextUsed) {
    warnings.push('benchmark_context was not used; early environment/task discovery may be weaker.');
  }
  if (localizationBeforeFirstEdit === false) {
    warnings.push('first edit happened before a read/search/list localization tool.');
  }
  if (reproductionBeforeFirstEdit === false) {
    warnings.push('first edit happened before a visible reproduction or verifier command.');
  }
  if (reproductionBeforeFirstEdit === true && failingReproductionBeforeFirstEdit === false && !noEditContractDetected) {
    warnings.push('no failing reproduction was observed before the first edit; for repair benchmarks, capture a failing verifier or make the no-visible-failure case explicit before finalizing.');
  }
  if (validationAfterFirstEdit === false) {
    warnings.push('edits have not been followed by a visible verifier command.');
  }
  if (validationAfterFirstEdit === true && passingValidationAfterFirstEdit === false) {
    warnings.push('edits have only been followed by failing verifier commands; fix the failure or run a passing verifier before finalizing.');
  }
  if (requireFinalPostEditValidation && validationAfterLastEdit === false) {
    warnings.push('a later edit happened after earlier validation, but the final edit was not followed by a verifier; run a verifier after the last edit before finalizing.');
  }
  if (requireFinalPassingPostEditValidation && passingValidationAfterLastEdit === false) {
    warnings.push('the final edit was followed only by failing verifier commands; fix the failure or rerun a passing verifier after the last edit.');
  }
  if (requireLatestPostEditVerifierPassing) {
    warnings.push('the latest verifier after editing failed after earlier passing validation; fix the failure or rerun a passing verifier before finalizing.');
  }
  if (requireStablePostEditValidation) {
    warnings.push('lucky-pass risk: final post-edit validation has only one narrow passing verifier. Rerun that verifier or run a broad/CI verifier after the final edit before treating validation as stable.');
  }
  if (invalidToolActionEvents.length > 0) {
    const actions = invalidToolActionEvents
      .slice(0, 3)
      .map((event) => `#${event.seq} ${event.reason}:${event.tool}`)
      .join('; ');
    warnings.push(`invalid tool action(s) occurred: ${actions}. Fix the tool name, JSON/schema shape, permission, or blocking condition before repeating the action.`);
  }
  if (events.filter((event) => event.status === 'error').length >= 3) {
    warnings.push('multiple tool errors occurred; inspect the failure pattern before repeating the same strategy.');
  }
  if (inconclusiveVerifierEvents.length > 0) {
    const targets = inconclusiveVerifierEvents
      .slice(0, 3)
      .map((event) => `#${event.seq} ${event.command}${event.fullLog ? ` (${event.fullLog})` : ''}`)
      .join('; ');
    warnings.push(`inconclusive verifier failure(s) were caused by timeout or truncated output without parsed failure evidence: ${targets}. Inspect the full log or rerun a narrower/longer verifier before treating the issue as reproduced.`);
  }
  if (unresolvedEnvironmentSetupFailureEvents.length > 0) {
    const failures = unresolvedEnvironmentSetupFailureEvents
      .slice(0, 3)
      .map((event) => `#${event.seq} ${event.reason}: ${event.evidence}`)
      .join('; ');
    warnings.push(`verifier failure(s) looked like an unprepared environment or missing dependency/build artifact: ${failures}. Run project-native setup/restore/install or record why the environment is already reconstructed before treating verifier results as code evidence.`);
  }
  if (dependencyManifestEditEvents.length > 0 && dependencySetupAfterManifestEdit === false) {
    const targets = dependencyManifestEditEvents
      .slice(0, 4)
      .map((event) => `${event.ecosystem}:${event.target}`)
      .join('; ');
    warnings.push(`dependency manifest edit(s) lacked a later package setup/install/lockfile command: ${targets}. Run the project-native install/update/lockfile step or document why validation does not require dependency resolution.`);
  }
  if (dependencyManifestEditEvents.length > 0
    && dependencySetupAfterManifestEdit === false
    && passingDependencyValidationAfterManifestEdit !== true) {
    warnings.push('dependency manifest edit(s) had neither a dependency setup command nor passing post-edit validation; resolve dependency state before finalizing a package-upgrade task.');
  }
  if (skillLoadedBeforeLocalContext) {
    const names = skillNames.slice(0, 3).join(', ');
    warnings.push(`skill prompt loaded before local task/repo context: ${names || 'unknown skill'}. Verify domain/version fit against benchmark_context or file evidence before applying skill guidance.`);
  }
  if (excessiveSkillViewCount) {
    warnings.push(`multiple full skill prompts were loaded (${skillViewEvents.length}); narrow to the one domain-fit skill or ignore generic skills to avoid token overhead and version-mismatched guidance.`);
  }
  if (sourceResearchUsed && !sourceResearchCoverage.completeTargetedCoverage) {
    warnings.push('source research was partial; targeted benchmark research should cover arXiv, GitHub github_kind:"all", Hugging Face kind:"all", and Kaggle kaggle_kind:"both" when external research is relevant.');
  }
  if (sourceResearchUsed && sourceResearchCoverage.completeTargetedCoverage && !sourceResearchCoverage.freshTargetedCoverage) {
    warnings.push('targeted source research omitted recent_days; newest-science and leaderboard work should bound arXiv, GitHub, and Hugging Face recency before relying on external evidence.');
  }
  if (sourceResearchUsed && sourceResearchCoverage.sourceHitCount === 0) {
    warnings.push('source research produced no parsed source hits; broaden the query or verify endpoint/auth failures before relying on it.');
  }
  if (sourceResearchCoverage.sourceErrorCount > 0) {
    warnings.push(`source research reported ${sourceResearchCoverage.sourceErrorCount} source error(s); inspect endpoint/auth coverage before treating external research as complete.`);
  }
  if (sourceResearchCoverage.kaggleCompetitionsSkipped) {
    warnings.push('Kaggle competition research was requested but skipped due missing auth; leaderboard/source coverage is dataset-only until Kaggle credentials are available.');
  }
  if (taskContractSignalCount > 0 && taskContractChecklistAfterContext !== true) {
    warnings.push('task contract signals were detected but no post-context todo_write checklist was recorded; preserve visible acceptance criteria before editing or finalizing.');
  }
  if (requireTaskContractChecklistCompletion) {
    const items = (latestTodoState?.incompleteItems ?? [])
      .slice(0, 3)
      .map((item) => `${item.status}:${item.content}`)
      .join('; ');
    warnings.push(`task contract checklist still has incomplete item(s) after validation: ${items}. Mark completed acceptance items with todo_write or finish the remaining contract work before finalizing.`);
  }
  if (editAfterNoEditContract) {
    warnings.push('no-edit/no-op task contract was detected but edit tools were used; verify the issue is already resolved and treat inaction as a valid success path when appropriate.');
  }
  if (editTargetEvidence.unlocalized.length > 0 && localizationBeforeFirstEdit !== false && !editAfterNoEditContract) {
    const targets = editTargetEvidence.unlocalized
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} ${event.target}`)
      .join('; ');
    warnings.push(`edited target(s) lacked prior file-level localization evidence: ${targets}. Read or search the target file before patching benchmark code.`);
  }
  if (contextUtilization.risk) {
    const misses = contextUtilization.missEvents
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} ${event.target}`)
      .join('; ');
    warnings.push(`low context utilization: ${contextUtilization.hitCount}/${contextUtilization.inspectCount} local read/search/list inspections matched edited targets (${contextUtilization.percent?.toFixed(2) ?? 'n/a'}%). Narrow broad exploration to candidate files/tests before spending more turns${misses ? `; unused examples: ${misses}` : ''}.`);
  }
  if (largeEditSurfaceRequiresReview) {
    const targets = editSurface.targets.slice(0, 6).join(', ');
    warnings.push(`large edit surface without an explicit broad-change task contract: ${editSurface.targets.length} source/config target(s) changed (${targets}). Reduce the patch scope or justify why the task requires this many files.`);
  }
  if (redundantToolCallEvents.length >= 2) {
    const repeats = redundantToolCallEvents
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} repeats #${event.repeatOfSeq} (${event.target})`)
      .join('; ');
    warnings.push(`redundant tool calls repeated the same read/search inputs without intervening edit or verification progress: ${repeats}. Change query, target, or strategy instead of reissuing identical calls.`);
  }
  if (redundantVerifierEvents.length >= 2) {
    const repeats = redundantVerifierEvents
      .slice(0, 3)
      .map((event) => `#${event.seq} repeats #${event.repeatOfSeq} (${event.command})`)
      .join('; ');
    warnings.push(`redundant verifier reruns repeated the same failing command without intervening edit or inspection progress: ${repeats}. Inspect the failure, change the patch, or run a more targeted verifier instead of rerunning the same failure loop.`);
  }
  if (blindRepairEvents.length > 0) {
    const repairs = blindRepairEvents
      .slice(0, 3)
      .map((event) => `fail#${event.failedVerificationSeq}->edit#${event.editSeq} (${event.editTarget})`)
      .join('; ');
    warnings.push(`blind repair after failed verifier: ${repairs}. Inspect the failure output or referenced files before patching again.`);
  }
  if (failureRepairAlignment.unalignedEvents.length > 0) {
    const repairs = failureRepairAlignment.unalignedEvents
      .slice(0, 3)
      .map((event) => `fail#${event.failedVerificationSeq}->edit#${event.editSeq} ${event.editTarget} (failure files: ${event.failureFiles.join(', ')})`)
      .join('; ');
    warnings.push(`failed-verifier repair target was not aligned with parsed source failure files: ${repairs}. Inspect the cited failure file(s) or make the cross-file dependency explicit before patching elsewhere.`);
  }
  if (postEditRegressionCycleEvents.length > 0) {
    const cycles = postEditRegressionCycleEvents
      .slice(0, 3)
      .map((event) => `pass#${event.firstPassingSeq}->fail#${event.failingSeq}->pass#${event.recoveryPassingSeq}`)
      .join('; ');
    warnings.push(`post-edit regression cycle detected after earlier passing validation: ${cycles}. Inspect whether the failure reflected a real regression or unstable verifier before treating final validation as clean.`);
  }
  if (scratchArtifactEvents.length > 0 && !scratchArtifactPermissionDetected) {
    const targets = scratchArtifactEvents
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} ${event.target}`)
      .join('; ');
    warnings.push(`scratch/probe artifact(s) were edited without task-contract permission: ${targets}. Remove temporary repro/debug files or justify them before finalizing.`);
  }
  if (requirePostEditDiffReview && postEditDiffReview === false) {
    warnings.push('edits passed visible validation but no post-edit diff/status review was recorded; inspect git diff or git status before finalizing to catch over-broad or accidental changes.');
  }
  if (requireFinalPostEditDiffReview) {
    warnings.push('a later edit happened after a diff/status review, but no diff/status review ran after the final edit; inspect git diff or git status again before finalizing.');
  }
  if (requireBroadPostEditValidation && broadValidationAfterFirstEdit === false) {
    warnings.push('edits passed a narrow verifier but no broad post-edit verifier was recorded; run the broad harness/build/test command before finalizing when feasible.');
  }
  if (requireBroadPostEditValidation && broadValidationAfterFirstEdit === true && passingBroadValidationAfterFirstEdit === false) {
    warnings.push('a broad post-edit verifier ran but did not pass; fix the failure or make the residual environment issue explicit before finalizing.');
  }
  if (requireFinalBroadPostEditValidation) {
    warnings.push('a later edit happened after broad validation, but no passing broad verifier ran after the final edit; rerun the broad harness/build/test command before finalizing.');
  }
  if (requireCiPostEditValidation && ciValidationAfterFirstEdit === false) {
    warnings.push(`CI verifier command(s) were discovered but no matching CI post-edit verifier was recorded; rerun the relevant CI command before finalizing: ${ciVerifierCommands.slice(0, 3).join(' | ')}.`);
  }
  if (requireCiPostEditValidation && ciValidationAfterFirstEdit === true && passingCiValidationAfterFirstEdit === false) {
    warnings.push('a CI-derived post-edit verifier ran but did not pass; fix the failure or make the residual environment issue explicit before finalizing.');
  }
  if (requireFinalCiPostEditValidation && ciValidationAfterLastEdit === false) {
    warnings.push('a later edit happened after CI-derived validation, but no matching CI verifier ran after the final edit; rerun the relevant CI command before finalizing.');
  }
  if (requireFinalCiPostEditValidation && ciValidationAfterLastEdit === true && passingCiValidationAfterLastEdit === false) {
    warnings.push('the final edit was followed by a CI-derived verifier, but it did not pass; fix the failure or rerun a passing CI verifier before finalizing.');
  }
  if (costEfficiencyRisk) {
    warnings.push(`cost-efficiency risk: ${formatBenchmarkUsageSummary(usage)} was spent while key benchmark evidence is still weak. Close the highest-value evidence gap before spending more turns.`);
  }
  if (testHarnessEditEvents.length > 0 && !testEditPermissionDetected) {
    const targets = testHarnessEditEvents
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} ${event.target}`)
      .join('; ');
    warnings.push(`test/harness/verifier file(s) were edited without an explicit task-contract test-edit requirement: ${targets}. Confirm hidden-benchmark validity before relying on these changes.`);
  }
  if (leakageRiskEvents.length > 0) {
    const targets = leakageRiskEvents
      .slice(0, 3)
      .map((event) => `${event.tool}#${event.seq} ${event.target}`)
      .join('; ');
    warnings.push(`potential benchmark leakage risk: touched read-with-care artifact(s): ${targets}. Confirm the task explicitly permits these files before relying on them.`);
  }
  const processDefects = buildBenchmarkProcessDefects({
    benchmarkContextUsed,
    localizationBeforeFirstEdit,
    reproductionBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    validationAfterFirstEdit,
    passingValidationAfterFirstEdit,
    broadValidationAfterFirstEdit,
    passingBroadValidationAfterFirstEdit,
    validationAfterLastEdit,
    passingValidationAfterLastEdit,
    broadValidationAfterLastEdit,
    passingBroadValidationAfterLastEdit,
    requireFinalPostEditValidation,
    requireFinalPassingPostEditValidation,
    requireLatestPostEditVerifierPassing,
    requireStablePostEditValidation,
    requireFinalBroadPostEditValidation,
    requireFinalPostEditDiffReview,
    sourceResearchUsed,
    sourceResearchCoverage,
    taskContractSignalCount,
    taskContractChecklistAfterContext,
    taskContractChecklistComplete,
    requireTaskContractChecklistCompletion,
    latestTodoSeq: latestTodoState?.seq ?? null,
    todoIncompleteCount: latestTodoState?.incompleteCount ?? 0,
    todoIncompleteItems: latestTodoState?.incompleteItems ?? [],
    noEditContractDetected,
    editAfterNoEditContract,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    contextUtilizationInspectCount: contextUtilization.inspectCount,
    contextUtilizationHitCount: contextUtilization.hitCount,
    contextUtilizationMissCount: contextUtilization.missCount,
    contextUtilizationPercent: contextUtilization.percent,
    contextUtilizationRisk: contextUtilization.risk,
    contextUtilizationMissEvents: contextUtilization.missEvents,
    broadEditContractDetected,
    largeEditSurfaceTargetCount: editSurface.targets.length,
    largeEditSurfaceTargets: editSurface.targets,
    largeEditSurfaceRequiresReview,
    redundantToolCallEvents,
    redundantVerifierEvents,
    blindRepairEvents,
    failureAlignedRepairCount: failureRepairAlignment.alignedCount,
    failureUnalignedRepairEvents: failureRepairAlignment.unalignedEvents,
    postEditRegressionCycleEvents,
    scratchArtifactPermissionDetected,
    scratchArtifactEvents,
    incompleteVerifierEvents,
    inconclusiveVerifierEvents,
    environmentSetupFailureEvents,
    unresolvedEnvironmentSetupFailureEvents,
    environmentSetupEvents,
    dependencyManifestEditEvents,
    dependencyLockfileEditEvents,
    dependencySetupAfterManifestEdit,
    passingDependencySetupAfterManifestEdit,
    dependencyValidationAfterManifestEdit,
    passingDependencyValidationAfterManifestEdit,
    firstDependencySetupAfterManifestEditSeq,
    firstDependencyValidationAfterManifestEditSeq,
    skillViewEvents,
    skillLoadedBeforeLocalContext,
    excessiveSkillViewCount,
    postEditDiffReview,
    diffReviewAfterLastEdit,
    requirePostEditDiffReview,
    requireBroadPostEditValidation,
    ciWorkflowCommandCount,
    ciVerifierCommands,
    ciValidationAfterFirstEdit,
    passingCiValidationAfterFirstEdit,
    ciValidationAfterLastEdit,
    passingCiValidationAfterLastEdit,
    requireCiPostEditValidation,
    requireFinalCiPostEditValidation,
    firstCiValidationAfterFirstEditSeq,
    firstPostEditDiffReviewSeq,
    firstDiffReviewAfterLastEditSeq,
    firstBroadValidationAfterFirstEditSeq,
    lastPostEditVerificationSeq,
    lastPostEditVerificationStatus,
    lastPostEditVerificationConclusiveFailure,
    finalEditVerificationCount,
    finalEditPassingVerificationCount,
    stableValidationAfterLastEdit,
    testEditPermissionDetected,
    testHarnessEditEvents,
    leakageRiskEvents,
    invalidToolActionEvents,
    firstInspectSeq,
    firstEditSeq,
    lastEditSeq,
    firstTaskContractSeq,
    firstNoEditContractSeq,
    firstTodoSeq,
    firstVerificationSeq,
    firstConclusiveFailedVerificationSeq,
    errorCount: events.filter((event) => event.status === 'error').length,
    usage,
    costEfficiencyRisk,
  });

  return {
    version: 1,
    toolCallCount: events.length,
    usageCallCount: usage.callCount,
    usageTotalTokens: usage.totalTokens,
    usageEstimatedCostUsd: usage.estimatedCostUsd,
    costEfficiencyRisk,
    invalidToolActionCount: invalidToolActionEvents.length,
    invalidToolActionPercent,
    invalidToolActionEvents,
    inspectCount,
    editCount,
    verificationCount,
    successfulVerificationCount,
    failedVerificationCount,
    incompleteVerifierCount: incompleteVerifierEvents.length,
    incompleteVerifierEvents,
    inconclusiveVerifierEvents,
    environmentSetupFailureCount: environmentSetupFailureEvents.length,
    environmentSetupFailureEvents,
    unresolvedEnvironmentSetupFailureCount: unresolvedEnvironmentSetupFailureEvents.length,
    unresolvedEnvironmentSetupFailureEvents,
    environmentSetupCount: environmentSetupEvents.length,
    successfulEnvironmentSetupCount: environmentSetupEvents.filter((event) => event.status === 'ok').length,
    environmentSetupEvents,
    dependencyManifestEditCount: dependencyManifestEditEvents.length,
    dependencyLockfileEditCount: dependencyLockfileEditEvents.length,
    dependencyManifestEditEvents,
    dependencyLockfileEditEvents,
    dependencySetupAfterManifestEdit,
    passingDependencySetupAfterManifestEdit,
    dependencyValidationAfterManifestEdit,
    passingDependencyValidationAfterManifestEdit,
    firstDependencySetupAfterManifestEditSeq,
    firstDependencyValidationAfterManifestEditSeq,
    skillViewCount: skillViewEvents.length,
    skillViewEvents,
    skillNames,
    skillLoadedBeforeLocalContext,
    excessiveSkillViewCount,
    ciWorkflowCommandCount,
    ciVerifierCommands,
    ciValidationAfterFirstEdit,
    passingCiValidationAfterFirstEdit,
    ciValidationAfterLastEdit,
    passingCiValidationAfterLastEdit,
    firstCiValidationAfterFirstEditSeq,
    benchmarkContextUsed,
    sourceResearchUsed,
    sourceResearchCoverage,
    taskContractSignalCount,
    taskContractChecklistUsed,
    taskContractChecklistAfterContext,
    taskContractChecklistComplete,
    latestTodoSeq: latestTodoState?.seq ?? null,
    todoIncompleteCount: latestTodoState?.incompleteCount ?? 0,
    todoIncompleteItems: latestTodoState?.incompleteItems ?? [],
    noEditContractDetected,
    editAfterNoEditContract,
    editTargetCount: editTargetEvidence.total,
    localizedEditTargetCount: editTargetEvidence.localized,
    unlocalizedEditTargetEvents: editTargetEvidence.unlocalized,
    contextUtilizationInspectCount: contextUtilization.inspectCount,
    contextUtilizationHitCount: contextUtilization.hitCount,
    contextUtilizationMissCount: contextUtilization.missCount,
    contextUtilizationPercent: contextUtilization.percent,
    contextUtilizationRisk: contextUtilization.risk,
    contextUtilizationMissEvents: contextUtilization.missEvents,
    broadEditContractDetected,
    largeEditSurfaceTargetCount: editSurface.targets.length,
    largeEditSurfaceTargets: editSurface.targets,
    redundantToolCallCount: redundantToolCallEvents.length,
    redundantToolCallEvents,
    redundantVerifierCount: redundantVerifierEvents.length,
    redundantVerifierEvents,
    blindRepairCount: blindRepairEvents.length,
    blindRepairEvents,
    failureAlignedRepairCount: failureRepairAlignment.alignedCount,
    failureUnalignedRepairCount: failureRepairAlignment.unalignedEvents.length,
    failureUnalignedRepairEvents: failureRepairAlignment.unalignedEvents,
    postEditRegressionCycleCount: postEditRegressionCycleEvents.length,
    postEditRegressionCycleEvents,
    scratchArtifactPermissionDetected,
    scratchArtifactEvents,
    postEditDiffReview,
    diffReviewAfterLastEdit,
    testEditPermissionDetected,
    testHarnessEditEvents,
    leakageRiskEvents,
    firstInspectSeq,
    firstEditSeq,
    lastEditSeq,
    firstVerificationSeq,
    firstTaskContractSeq,
    firstNoEditContractSeq,
    firstTodoSeq,
    firstPostEditDiffReviewSeq,
    firstDiffReviewAfterLastEditSeq,
    firstBroadValidationAfterFirstEditSeq,
    lastPostEditVerificationSeq,
    lastPostEditVerificationStatus,
    lastPostEditVerificationConclusiveFailure,
    finalEditVerificationCount,
    finalEditPassingVerificationCount,
    stableValidationAfterLastEdit,
    firstSuccessfulVerificationSeq,
    firstFailedVerificationSeq,
    firstConclusiveFailedVerificationSeq,
    localizationBeforeFirstEdit,
    reproductionBeforeFirstEdit,
    failingReproductionBeforeFirstEdit,
    validationAfterFirstEdit,
    passingValidationAfterFirstEdit,
    broadValidationAfterFirstEdit,
    passingBroadValidationAfterFirstEdit,
    validationAfterLastEdit,
    passingValidationAfterLastEdit,
    broadValidationAfterLastEdit,
    passingBroadValidationAfterLastEdit,
    processScore: scoreBenchmarkProcess(processDefects),
    processDefects,
    warnings,
  };
}

export function buildBenchmarkTrajectorySystemBlock(
  events: BenchmarkTraceEvent[],
  usageEvents: BenchmarkUsageEvent[] = [],
): string | null {
  if (events.length === 0) return null;
  const quality = buildBenchmarkTrajectoryQuality(events, buildBenchmarkUsageSummary(usageEvents));
  const verificationEvidence = buildBenchmarkVerificationEvidence(events);
  const lines = [
    '<benchmark_trajectory>',
    `Signals: benchmark_context=${yn(quality.benchmarkContextUsed)}, source_research=${yn(quality.sourceResearchUsed)}, usage_calls=${quality.usageCallCount} usage_tokens=${quality.usageTotalTokens} usage_cost=$${quality.usageEstimatedCostUsd.toFixed(4)} cost_risk=${yn(quality.costEfficiencyRisk)}, invalid_actions=${quality.invalidToolActionCount} invalid_action_pct=${quality.invalidToolActionPercent.toFixed(2)}, skill_views=${quality.skillViewCount} skill_before_context=${yn(quality.skillLoadedBeforeLocalContext)} excessive_skills=${yn(quality.excessiveSkillViewCount)}, leakage_risks=${quality.leakageRiskEvents.length}, test_harness_edits=${quality.testHarnessEditEvents.length}, scratch_artifacts=${quality.scratchArtifactEvents.length}, redundant_calls=${quality.redundantToolCallCount}, redundant_verifiers=${quality.redundantVerifierCount}, blind_repairs=${quality.blindRepairCount}, failure_aligned_repairs=${quality.failureAlignedRepairCount} failure_unaligned_repairs=${quality.failureUnalignedRepairCount}, regression_cycles=${quality.postEditRegressionCycleCount}, env_setup_failures=${quality.environmentSetupFailureCount} unresolved_env=${quality.unresolvedEnvironmentSetupFailureCount} env_setup=${quality.environmentSetupCount} env_setup_ok=${quality.successfulEnvironmentSetupCount}, dependency_manifests=${quality.dependencyManifestEditCount} dependency_lockfiles=${quality.dependencyLockfileEditCount} dependency_setup_after_manifest=${tri(quality.dependencySetupAfterManifestEdit)} dependency_setup_ok_after_manifest=${tri(quality.passingDependencySetupAfterManifestEdit)} dependency_validation_after_manifest=${tri(quality.dependencyValidationAfterManifestEdit)} dependency_validation_ok_after_manifest=${tri(quality.passingDependencyValidationAfterManifestEdit)}, ci_verifiers=${quality.ciWorkflowCommandCount}, inspect=${quality.inspectCount}, context_utilization=${formatPercent(quality.contextUtilizationPercent)} context_hits=${quality.contextUtilizationHitCount}/${quality.contextUtilizationInspectCount} context_misses=${quality.contextUtilizationMissCount} context_risk=${yn(quality.contextUtilizationRisk)}, edits=${quality.editCount}, edit_targets=${quality.editTargetCount} localized=${quality.localizedEditTargetCount} unlocalized=${quality.unlocalizedEditTargetEvents.length}, large_edit_targets=${quality.largeEditSurfaceTargetCount} broad_contract=${yn(quality.broadEditContractDetected)}, verifiers=${quality.verificationCount} ok=${quality.successfulVerificationCount} fail=${quality.failedVerificationCount} final_verifiers=${quality.finalEditVerificationCount} final_ok=${quality.finalEditPassingVerificationCount} stable_final=${tri(quality.stableValidationAfterLastEdit)} incomplete=${quality.incompleteVerifierCount} inconclusive=${quality.inconclusiveVerifierEvents.length}.`,
    `Verifier evidence: ${formatVerificationEvidence(verificationEvidence)}.`,
    `Source coverage: ${formatSourceCoverage(quality.sourceResearchCoverage)}.`,
    `Task contract: signals=${quality.taskContractSignalCount}, checklist=${tri(quality.taskContractChecklistAfterContext)}, complete=${tri(quality.taskContractChecklistComplete)}, incomplete=${quality.todoIncompleteCount}, no_edit=${yn(quality.noEditContractDetected)}, edited=${yn(quality.editAfterNoEditContract)}.`,
    `Process score: ${quality.processScore}/100, defects=${quality.processDefects.length}${quality.processDefects.length ? ` (${quality.processDefects.slice(0, 4).map((defect) => `${defect.severity}:${defect.code}`).join(', ')})` : ''}.`,
    `Method checks: localize_before_edit=${tri(quality.localizationBeforeFirstEdit)}, reproduce_before_edit=${tri(quality.reproductionBeforeFirstEdit)}, failing_reproduce_before_edit=${tri(quality.failingReproductionBeforeFirstEdit)}, validate_after_edit=${tri(quality.validationAfterFirstEdit)}, passing_validate_after_edit=${tri(quality.passingValidationAfterFirstEdit)}, latest_post_edit_verifier=${statusLabel(quality.lastPostEditVerificationStatus)}, final_validate_after_edit=${tri(quality.passingValidationAfterLastEdit)}, stable_final_validate=${tri(quality.stableValidationAfterLastEdit)}, broad_validate_after_edit=${tri(quality.passingBroadValidationAfterFirstEdit)}, final_broad_validate_after_edit=${tri(quality.passingBroadValidationAfterLastEdit)}, ci_validate_after_edit=${tri(quality.passingCiValidationAfterFirstEdit)}, final_ci_validate_after_edit=${tri(quality.passingCiValidationAfterLastEdit)}, diff_review_after_edit=${tri(quality.postEditDiffReview)}, final_diff_review_after_edit=${tri(quality.diffReviewAfterLastEdit)}.`,
  ];
  if (quality.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of quality.warnings.slice(0, 4)) lines.push(`- ${warning}`);
    lines.push('Next move: close the weakest evidence gap with a concrete tool call before claiming completion.');
  } else {
    lines.push('Next move: continue the narrow patch/validate ladder or summarize only with concrete verifier evidence.');
  }
  lines.push('</benchmark_trajectory>');
  return lines.join('\n');
}

export function buildBenchmarkVerificationEvidence(events: BenchmarkTraceEvent[]): BenchmarkVerificationEvidence {
  const verifierEvents = events.filter((event) => event.verification);
  const extracted = verifierEvents.flatMap((event) => {
    const signal = extractVerifierOutputSignal(event);
    return signal ? [signal] : [];
  });
  const failureSignatures = verifierEvents.flatMap((event) => {
    const signature = extractVerifierFailureSignature(event);
    return signature ? [signature] : [];
  });
  const incompleteRuns = buildBenchmarkIncompleteVerifierEvents(verifierEvents);
  const lastVerification = verifierEvents.at(-1);
  const lastSuccessfulVerification = [...verifierEvents].reverse().find((event) => event.status === 'ok');
  const lastFailedVerification = [...verifierEvents].reverse().find((event) => event.status === 'error');
  return {
    lastVerificationSeq: lastVerification?.seq ?? null,
    lastVerificationStatus: lastVerification?.status ?? null,
    lastSuccessfulVerificationSeq: lastSuccessfulVerification?.seq ?? null,
    lastFailedVerificationSeq: lastFailedVerification?.seq ?? null,
    extracted,
    failureSignatures,
    incompleteRuns,
  };
}

export function buildBenchmarkFinalAnswerEvidence(
  finalAssistant: string,
  verificationEvidence: BenchmarkVerificationEvidence,
  events: BenchmarkTraceEvent[] = [],
): BenchmarkFinalAnswerEvidence {
  const text = finalAssistant.trim();
  const mentionsVerification = FINAL_ANSWER_VERIFICATION_MENTION_RE.test(text);
  const claimsNoVerificationRun = FINAL_ANSWER_NO_VERIFICATION_RE.test(text);
  const claimsPassingVerification = !claimsNoVerificationRun && FINAL_ANSWER_PASSING_VERIFICATION_RE.test(text);
  const claimsBlocked = FINAL_ANSWER_BLOCKED_RE.test(text);
  const claimsRemainingWork =
    FINAL_ANSWER_REMAINING_WORK_RE.test(text) && !FINAL_ANSWER_NO_REMAINING_WORK_RE.test(text);
  const claimsIncomplete = claimsBlocked || claimsRemainingWork || FINAL_ANSWER_INCOMPLETE_RE.test(text);
  const finalAnswerCompletion = claimsBlocked ? 'blocked' : claimsIncomplete ? 'incomplete' : 'unknown';
  const verificationCount = events.filter((event) => event.verification).length;
  const latestVerificationStatus = verificationEvidence.lastVerificationStatus;
  const lastSuccessfulVerificationSeq = verificationEvidence.lastSuccessfulVerificationSeq;
  const unsupportedPassingClaim = claimsPassingVerification && lastSuccessfulVerificationSeq == null;
  const contradictedPassingClaim = claimsPassingVerification && latestVerificationStatus === 'error';
  const staleNoVerificationClaim = claimsNoVerificationRun && verificationCount > 0;
  const warnings: string[] = [];

  if (contradictedPassingClaim) {
    warnings.push('final answer claims passing verification, but the latest recorded verifier failed.');
  }
  if (unsupportedPassingClaim) {
    warnings.push('final answer claims passing verification, but no passing verifier event was recorded.');
  }
  if (staleNoVerificationClaim) {
    warnings.push('final answer says verification was not run, but verifier events are present in the trace.');
  }
  if (claimsIncomplete) {
    warnings.push('final answer indicates the task is incomplete or blocked.');
  }

  return {
    mentionsVerification,
    claimsPassingVerification,
    claimsNoVerificationRun,
    claimsIncomplete,
    claimsBlocked,
    finalAnswerCompletion,
    unsupportedPassingClaim,
    contradictedPassingClaim,
    staleNoVerificationClaim,
    latestVerificationStatus,
    lastSuccessfulVerificationSeq,
    verificationCount,
    warnings,
  };
}

interface BenchmarkProcessDefectInput {
  benchmarkContextUsed: boolean;
  localizationBeforeFirstEdit: boolean | null;
  reproductionBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  validationAfterFirstEdit: boolean | null;
  passingValidationAfterFirstEdit: boolean | null;
  broadValidationAfterFirstEdit: boolean | null;
  passingBroadValidationAfterFirstEdit: boolean | null;
  validationAfterLastEdit: boolean | null;
  passingValidationAfterLastEdit: boolean | null;
  broadValidationAfterLastEdit: boolean | null;
  passingBroadValidationAfterLastEdit: boolean | null;
  requireFinalPostEditValidation: boolean;
  requireFinalPassingPostEditValidation: boolean;
  requireLatestPostEditVerifierPassing: boolean;
  requireStablePostEditValidation: boolean;
  requireFinalBroadPostEditValidation: boolean;
  requireFinalPostEditDiffReview: boolean;
  sourceResearchUsed: boolean;
  sourceResearchCoverage: SourceResearchCoverage;
  taskContractSignalCount: number;
  taskContractChecklistAfterContext: boolean | null;
  taskContractChecklistComplete: boolean | null;
  requireTaskContractChecklistCompletion: boolean;
  latestTodoSeq: number | null;
  todoIncompleteCount: number;
  todoIncompleteItems: BenchmarkTodoIncompleteItem[];
  noEditContractDetected: boolean;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  contextUtilizationInspectCount: number;
  contextUtilizationHitCount: number;
  contextUtilizationMissCount: number;
  contextUtilizationPercent: number | null;
  contextUtilizationRisk: boolean;
  contextUtilizationMissEvents: BenchmarkContextUtilizationEvent[];
  broadEditContractDetected: boolean;
  largeEditSurfaceTargetCount: number;
  largeEditSurfaceTargets: string[];
  largeEditSurfaceRequiresReview: boolean;
  redundantToolCallEvents: BenchmarkRedundantToolCallEvent[];
  redundantVerifierEvents: BenchmarkRedundantVerifierEvent[];
  blindRepairEvents: BenchmarkBlindRepairEvent[];
  failureAlignedRepairCount: number;
  failureUnalignedRepairEvents: BenchmarkFailureUnalignedRepairEvent[];
  postEditRegressionCycleEvents: BenchmarkPostEditRegressionCycleEvent[];
  scratchArtifactPermissionDetected: boolean;
  scratchArtifactEvents: BenchmarkScratchArtifactEvent[];
  incompleteVerifierEvents: BenchmarkVerifierIncompleteRun[];
  inconclusiveVerifierEvents: BenchmarkVerifierIncompleteRun[];
  environmentSetupFailureEvents: BenchmarkEnvironmentSetupFailureEvent[];
  unresolvedEnvironmentSetupFailureEvents: BenchmarkEnvironmentSetupFailureEvent[];
  environmentSetupEvents: BenchmarkEnvironmentSetupEvent[];
  dependencyManifestEditEvents: BenchmarkDependencyEditEvent[];
  dependencyLockfileEditEvents: BenchmarkDependencyEditEvent[];
  dependencySetupAfterManifestEdit: boolean | null;
  passingDependencySetupAfterManifestEdit: boolean | null;
  dependencyValidationAfterManifestEdit: boolean | null;
  passingDependencyValidationAfterManifestEdit: boolean | null;
  firstDependencySetupAfterManifestEditSeq: number | null;
  firstDependencyValidationAfterManifestEditSeq: number | null;
  skillViewEvents: BenchmarkSkillViewEvent[];
  skillLoadedBeforeLocalContext: boolean;
  excessiveSkillViewCount: boolean;
  postEditDiffReview: boolean | null;
  diffReviewAfterLastEdit: boolean | null;
  requirePostEditDiffReview: boolean;
  requireBroadPostEditValidation: boolean;
  ciWorkflowCommandCount: number;
  ciVerifierCommands: string[];
  ciValidationAfterFirstEdit: boolean | null;
  passingCiValidationAfterFirstEdit: boolean | null;
  ciValidationAfterLastEdit: boolean | null;
  passingCiValidationAfterLastEdit: boolean | null;
  requireCiPostEditValidation: boolean;
  requireFinalCiPostEditValidation: boolean;
  firstCiValidationAfterFirstEditSeq: number | null;
  firstPostEditDiffReviewSeq: number | null;
  firstDiffReviewAfterLastEditSeq: number | null;
  firstBroadValidationAfterFirstEditSeq: number | null;
  lastPostEditVerificationSeq: number | null;
  lastPostEditVerificationStatus: 'ok' | 'error' | null;
  lastPostEditVerificationConclusiveFailure: boolean | null;
  finalEditVerificationCount: number;
  finalEditPassingVerificationCount: number;
  stableValidationAfterLastEdit: boolean | null;
  testEditPermissionDetected: boolean;
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
  invalidToolActionEvents: BenchmarkInvalidToolActionEvent[];
  firstInspectSeq: number | null;
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  firstTaskContractSeq: number | null;
  firstNoEditContractSeq: number | null;
  firstTodoSeq: number | null;
  firstVerificationSeq: number | null;
  firstConclusiveFailedVerificationSeq: number | null;
  errorCount: number;
  usage: BenchmarkUsageSummary;
  costEfficiencyRisk: boolean;
}

function buildBenchmarkProcessDefects(input: BenchmarkProcessDefectInput): BenchmarkProcessDefect[] {
  const defects: BenchmarkProcessDefect[] = [];
  const add = (
    code: string,
    category: BenchmarkProcessDefectCategory,
    severity: BenchmarkProcessDefectSeverity,
    seq: number | null,
    message: string,
    evidence: string,
  ): void => {
    defects.push({ code, category, severity, seq, message, evidence });
  };

  if (!input.benchmarkContextUsed) {
    add(
      'missing_benchmark_context',
      'orientation',
      'medium',
      null,
      'Benchmark context was not used before trajectory scoring.',
      'No benchmark_context tool event was recorded.',
    );
  }
  if (input.localizationBeforeFirstEdit === false) {
    add(
      'edit_before_localization',
      'localization',
      'high',
      input.firstEditSeq,
      'The first edit occurred before a visible read/search/list localization step.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.reproductionBeforeFirstEdit === false) {
    add(
      'edit_before_reproduction',
      'reproduction',
      'high',
      input.firstEditSeq,
      'The first edit occurred before a visible verifier or reproduction command.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}, first_verification_seq=${input.firstVerificationSeq ?? 'none'}`,
    );
  }
  if (input.reproductionBeforeFirstEdit === true && input.failingReproductionBeforeFirstEdit === false && !input.noEditContractDetected) {
    add(
      'no_failing_reproduction',
      'reproduction',
      'medium',
      input.firstVerificationSeq,
      'A pre-edit verifier ran, but no failing reproduction was observed.',
      `first_verification_seq=${input.firstVerificationSeq ?? 'unknown'}`,
    );
  }
  if (input.validationAfterFirstEdit === false) {
    add(
      'missing_post_edit_validation',
      'validation',
      'high',
      input.firstEditSeq,
      'Edits were not followed by a visible verifier command.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.validationAfterFirstEdit === true && input.passingValidationAfterFirstEdit === false) {
    add(
      'no_passing_post_edit_validation',
      'validation',
      'high',
      input.firstEditSeq,
      'Post-edit validation exists, but every visible verifier after editing failed.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireFinalPostEditValidation && input.validationAfterLastEdit === false) {
    add(
      'missing_final_post_edit_validation',
      'validation',
      'high',
      input.lastEditSeq,
      'A later edit occurred after prior validation, but the final edit was not followed by a visible verifier command.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}, first_edit_seq=${input.firstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireFinalPassingPostEditValidation && input.passingValidationAfterLastEdit === false) {
    add(
      'no_passing_final_post_edit_validation',
      'validation',
      'high',
      input.lastEditSeq,
      'The final edit was followed by verifier commands, but none passed.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireLatestPostEditVerifierPassing) {
    add(
      'latest_post_edit_verifier_failed',
      'validation',
      'high',
      input.lastPostEditVerificationSeq,
      'The latest verifier after editing failed after earlier passing validation.',
      `last_post_edit_verification_seq=${input.lastPostEditVerificationSeq ?? 'unknown'}, status=${input.lastPostEditVerificationStatus ?? 'unknown'}, conclusive_failure=${input.lastPostEditVerificationConclusiveFailure === true ? 'yes' : 'no'}`,
    );
  }
  if (input.invalidToolActionEvents.length > 0) {
    const terminalInvalidAction = input.invalidToolActionEvents.some((event) => /(?:loop|streak|blocked|denied)/i.test(event.reason));
    add(
      'invalid_tool_actions',
      'execution_control',
      input.invalidToolActionEvents.length >= 3 || terminalInvalidAction ? 'medium' : 'low',
      input.invalidToolActionEvents[0]?.seq ?? null,
      'The trajectory included invalid or blocked tool actions before execution.',
      input.invalidToolActionEvents.slice(0, 5).map((event) => `#${event.seq}:${event.reason}:${event.tool}`).join('; '),
    );
  }
  if (input.errorCount >= 3) {
    add(
      'repeated_tool_errors',
      'execution_control',
      'medium',
      null,
      'Multiple tool errors occurred in the trajectory.',
      `error_count=${input.errorCount}`,
    );
  }
  if (input.costEfficiencyRisk) {
    add(
      'costly_under_evidenced_trajectory',
      'execution_control',
      costEfficiencySeverity(input.usage),
      null,
      'High token/cost/call usage occurred while benchmark evidence remained weak.',
      formatBenchmarkUsageSummary(input.usage),
    );
  }
  if (input.inconclusiveVerifierEvents.length > 0) {
    add(
      'inconclusive_verifier_failure',
      'validation',
      input.inconclusiveVerifierEvents.some((event) => event.timedOut) ? 'medium' : 'low',
      input.inconclusiveVerifierEvents[0]?.seq ?? null,
      'One or more verifier failures were inconclusive because timeout/truncation hid parsed failure evidence.',
      input.inconclusiveVerifierEvents.slice(0, 3).map((event) => `#${event.seq}:timedOut=${event.timedOut},truncated=${event.truncated},fullLog=${event.fullLog ?? 'none'}`).join('; '),
    );
  }
  if (input.unresolvedEnvironmentSetupFailureEvents.length > 0) {
    add(
      'unresolved_environment_setup_failure',
      'execution_control',
      'medium',
      input.unresolvedEnvironmentSetupFailureEvents[0]?.seq ?? null,
      'A verifier failure looked like missing setup, dependencies, toolchain, or build artifacts and was not followed by successful setup evidence.',
      [
        `setup_failures=${input.environmentSetupFailureEvents.length}`,
        `setup_events=${input.environmentSetupEvents.length}`,
        input.unresolvedEnvironmentSetupFailureEvents
          .slice(0, 3)
          .map((event) => `#${event.seq}:${event.reason}:${event.evidence}`)
          .join('; '),
      ].filter(Boolean).join(', '),
    );
  }
  if (input.dependencyManifestEditEvents.length > 0 && input.dependencySetupAfterManifestEdit === false) {
    add(
      'dependency_manifest_without_setup',
      'execution_control',
      input.passingDependencyValidationAfterManifestEdit === true ? 'low' : 'medium',
      input.dependencyManifestEditEvents[0]?.seq ?? null,
      'A dependency manifest was edited without a later project-native install/update/lockfile command.',
      [
        `manifest_edits=${input.dependencyManifestEditEvents.length}`,
        `lockfile_edits=${input.dependencyLockfileEditEvents.length}`,
        `passing_validation=${input.passingDependencyValidationAfterManifestEdit === true ? 'yes' : 'no'}`,
        `first_setup_seq=${input.firstDependencySetupAfterManifestEditSeq ?? 'none'}`,
        `manifests=${input.dependencyManifestEditEvents.slice(0, 4).map((event) => `${event.ecosystem}:${event.target}`).join('; ')}`,
      ].join(', '),
    );
  }
  if (input.dependencyManifestEditEvents.length > 0
    && input.dependencySetupAfterManifestEdit === false
    && input.passingDependencyValidationAfterManifestEdit !== true) {
    add(
      'dependency_manifest_unvalidated',
      'validation',
      'medium',
      input.dependencyManifestEditEvents[0]?.seq ?? null,
      'A dependency manifest was edited without dependency setup evidence or passing post-edit validation.',
      `first_validation_seq=${input.firstDependencyValidationAfterManifestEditSeq ?? 'none'}, dependency_validation=${input.dependencyValidationAfterManifestEdit === true ? 'yes' : 'no'}, passing_dependency_validation=${input.passingDependencyValidationAfterManifestEdit ? 'yes' : 'no'}`,
    );
  }
  if (input.skillLoadedBeforeLocalContext) {
    add(
      'skill_loaded_before_local_context',
      'orientation',
      'low',
      input.skillViewEvents[0]?.seq ?? null,
      'A full skill prompt was loaded before benchmark_context or file-level local context established task/repo compatibility.',
      input.skillViewEvents.slice(0, 3).map((event) => `skill_view#${event.seq}:${event.name}`).join('; '),
    );
  }
  if (input.excessiveSkillViewCount) {
    add(
      'excessive_skill_loading',
      'execution_control',
      input.skillViewEvents.length >= 4 ? 'medium' : 'low',
      input.skillViewEvents[2]?.seq ?? input.skillViewEvents[0]?.seq ?? null,
      'Multiple full skill prompts were loaded in one benchmark trajectory.',
      input.skillViewEvents.slice(0, 5).map((event) => `skill_view#${event.seq}:${event.name}`).join('; '),
    );
  }
  if (input.sourceResearchUsed && !input.sourceResearchCoverage.completeTargetedCoverage) {
    add(
      'partial_source_research',
      'source_research',
      'medium',
      null,
      'Source research was used but did not satisfy targeted arXiv/GitHub/Hugging Face/Kaggle coverage.',
      formatSourceCoverage(input.sourceResearchCoverage),
    );
  }
  if (input.sourceResearchUsed && input.sourceResearchCoverage.completeTargetedCoverage && !input.sourceResearchCoverage.freshTargetedCoverage) {
    add(
      'source_research_missing_recency',
      'source_research',
      'medium',
      null,
      'Targeted source research did not include a recency window for newest-science evidence.',
      formatSourceCoverage(input.sourceResearchCoverage),
    );
  }
  if (input.sourceResearchUsed && input.sourceResearchCoverage.sourceHitCount === 0) {
    add(
      'source_research_no_hits',
      'source_research',
      'medium',
      null,
      'Source research produced no parsed source hits.',
      formatSourceCoverage(input.sourceResearchCoverage),
    );
  }
  if (input.sourceResearchCoverage.sourceErrorCount > 0) {
    add(
      'source_research_errors',
      'source_research',
      'medium',
      null,
      'Source research reported endpoint or auth errors.',
      `source_error_count=${input.sourceResearchCoverage.sourceErrorCount}`,
    );
  }
  if (input.sourceResearchCoverage.kaggleCompetitionsSkipped) {
    add(
      'kaggle_competitions_skipped',
      'source_research',
      'low',
      null,
      'Kaggle competition research was requested but skipped due missing auth.',
      formatSourceCoverage(input.sourceResearchCoverage),
    );
  }
  if (input.taskContractSignalCount > 0 && input.taskContractChecklistAfterContext !== true) {
    add(
      'missing_task_contract_checklist',
      'requirement_fidelity',
      'medium',
      input.firstTaskContractSeq,
      'Visible task-contract signals were detected, but no post-context todo checklist was recorded.',
      `task_contract_signals=${input.taskContractSignalCount}, first_task_contract_seq=${input.firstTaskContractSeq ?? 'unknown'}, first_todo_seq=${input.firstTodoSeq ?? 'none'}`,
    );
  }
  if (input.requireTaskContractChecklistCompletion) {
    add(
      'incomplete_task_contract_checklist',
      'requirement_fidelity',
      'medium',
      input.latestTodoSeq,
      'The task-contract checklist still had incomplete items after visible validation.',
      `latest_todo_seq=${input.latestTodoSeq ?? 'unknown'}, incomplete_count=${input.todoIncompleteCount}, items=${input.todoIncompleteItems.slice(0, 3).map((item) => `${item.status}:${item.content}`).join('; ')}`,
    );
  }
  if (input.editAfterNoEditContract) {
    add(
      'edit_despite_no_edit_contract',
      'requirement_fidelity',
      'high',
      input.firstEditSeq,
      'The trajectory used an edit tool after a no-edit/no-op task contract was detected.',
      `first_no_edit_contract_seq=${input.firstNoEditContractSeq ?? 'unknown'}, first_edit_seq=${input.firstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.unlocalizedEditTargetEvents.length > 0
    && input.localizationBeforeFirstEdit !== false
    && !input.editAfterNoEditContract) {
    add(
      'unlocalized_edit_target',
      'localization',
      'medium',
      input.unlocalizedEditTargetEvents[0]?.seq ?? null,
      'One or more edited source targets lacked prior file-level read/search evidence.',
      input.unlocalizedEditTargetEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}:${event.target}`).join('; '),
    );
  }
  if (input.contextUtilizationRisk) {
    add(
      'low_context_utilization',
      'localization',
      'low',
      input.contextUtilizationMissEvents[0]?.seq ?? input.firstInspectSeq,
      'Many local read/search/list inspections did not match the files eventually edited.',
      `utilized=${input.contextUtilizationHitCount}/${input.contextUtilizationInspectCount}, percent=${input.contextUtilizationPercent?.toFixed(2) ?? 'n/a'}, misses=${input.contextUtilizationMissCount}, examples=${input.contextUtilizationMissEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}:${event.target}`).join('; ')}`,
    );
  }
  if (input.largeEditSurfaceRequiresReview) {
    add(
      'large_edit_surface_without_contract',
      'requirement_fidelity',
      input.largeEditSurfaceTargetCount >= LARGE_EDIT_SURFACE_THRESHOLD + 2 ? 'medium' : 'low',
      input.firstEditSeq,
      'The trajectory edited many source/config targets without an explicit broad-change task contract.',
      `target_count=${input.largeEditSurfaceTargetCount}, broad_contract=${input.broadEditContractDetected ? 'yes' : 'no'}, targets=${input.largeEditSurfaceTargets.slice(0, 6).join(', ')}`,
    );
  }
  if (input.redundantToolCallEvents.length >= 2) {
    add(
      'redundant_tool_calls',
      'execution_control',
      input.redundantToolCallEvents.length >= 4 ? 'medium' : 'low',
      input.redundantToolCallEvents[0]?.seq ?? null,
      'The trajectory repeated identical read/search tool calls before any edit or verifier changed the state.',
      input.redundantToolCallEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}->#${event.repeatOfSeq}:${event.target}`).join('; '),
    );
  }
  if (input.redundantVerifierEvents.length >= 2) {
    add(
      'redundant_verifier_reruns',
      'execution_control',
      input.redundantVerifierEvents.length >= 4 ? 'medium' : 'low',
      input.redundantVerifierEvents[0]?.seq ?? null,
      'The trajectory repeated the same failing verifier command without intervening edit or inspection progress.',
      input.redundantVerifierEvents.slice(0, 3).map((event) => `bash#${event.seq}->#${event.repeatOfSeq}:${event.command}`).join('; '),
    );
  }
  if (input.blindRepairEvents.length > 0) {
    add(
      'blind_repair_after_failed_verifier',
      'localization',
      input.blindRepairEvents.length >= 2 ? 'medium' : 'low',
      input.blindRepairEvents[0]?.editSeq ?? null,
      'A failed verifier was followed by an edit before inspecting failure output or related files.',
      input.blindRepairEvents
        .slice(0, 3)
        .map((event) => `fail#${event.failedVerificationSeq}->edit#${event.editSeq}:${event.editTarget}`)
        .join('; '),
    );
  }
  if (input.failureUnalignedRepairEvents.length > 0) {
    add(
      'failure_unaligned_repair',
      'localization',
      'medium',
      input.failureUnalignedRepairEvents[0]?.editSeq ?? null,
      'A repair edit followed parsed source failure-file evidence but did not edit or inspect an aligned source failure file first.',
      input.failureUnalignedRepairEvents
        .slice(0, 3)
        .map((event) => `fail#${event.failedVerificationSeq}->edit#${event.editSeq}:${event.editTarget}; files=${event.failureFiles.join('|')}; inspected=${event.inspectedTargets.join('|') || 'none'}`)
        .join('; '),
    );
  }
  if (input.postEditRegressionCycleEvents.length > 0) {
    add(
      'post_edit_regression_cycle',
      'validation',
      input.postEditRegressionCycleEvents.length >= 2 ? 'medium' : 'low',
      input.postEditRegressionCycleEvents[0]?.failingSeq ?? null,
      'A post-edit verifier passed, then a later verifier failed, then validation recovered.',
      input.postEditRegressionCycleEvents
        .slice(0, 3)
        .map((event) => `pass#${event.firstPassingSeq}->fail#${event.failingSeq}->pass#${event.recoveryPassingSeq}:${event.failingCommand}`)
        .join('; '),
    );
  }
  if (input.scratchArtifactEvents.length > 0 && !input.scratchArtifactPermissionDetected) {
    add(
      'scratch_artifact_left_in_patch',
      'requirement_fidelity',
      input.scratchArtifactEvents.length >= 3 ? 'medium' : 'low',
      input.scratchArtifactEvents[0]?.seq ?? null,
      'The trajectory edited scratch, probe, debug, or repro artifact files without explicit task permission.',
      input.scratchArtifactEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}:${event.target}`).join('; '),
    );
  }
  if (input.requirePostEditDiffReview && input.postEditDiffReview === false) {
    add(
      'missing_post_edit_diff_review',
      'execution_control',
      'low',
      input.firstEditSeq,
      'The trajectory reached passing post-edit validation without a visible git diff/status review.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}, first_post_edit_diff_review_seq=${input.firstPostEditDiffReviewSeq ?? 'none'}`,
    );
  }
  if (input.requireFinalPostEditDiffReview) {
    add(
      'missing_final_post_edit_diff_review',
      'execution_control',
      'low',
      input.lastEditSeq,
      'A later edit occurred after prior diff/status review, but the final edit was not followed by a visible git diff/status review.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}, first_diff_review_after_last_edit_seq=${input.firstDiffReviewAfterLastEditSeq ?? 'none'}`,
    );
  }
  if (input.requireBroadPostEditValidation && input.broadValidationAfterFirstEdit === false) {
    add(
      'missing_broad_post_edit_validation',
      'validation',
      'medium',
      input.firstEditSeq,
      'The trajectory passed a narrow post-edit verifier but did not run a broad post-edit verifier.',
      `first_edit_seq=${input.firstEditSeq ?? 'unknown'}, first_broad_validation_seq=${input.firstBroadValidationAfterFirstEditSeq ?? 'none'}`,
    );
  }
  if (input.requireBroadPostEditValidation
    && input.broadValidationAfterFirstEdit === true
    && input.passingBroadValidationAfterFirstEdit === false) {
    add(
      'no_passing_broad_post_edit_validation',
      'validation',
      'high',
      input.firstBroadValidationAfterFirstEditSeq,
      'A broad post-edit verifier ran, but it did not pass.',
      `first_broad_validation_seq=${input.firstBroadValidationAfterFirstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireFinalBroadPostEditValidation) {
    add(
      'missing_final_broad_post_edit_validation',
      'validation',
      'medium',
      input.lastEditSeq,
      'A later edit occurred after broad validation, but no passing broad verifier ran after the final edit.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}, first_broad_validation_seq=${input.firstBroadValidationAfterFirstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireCiPostEditValidation && input.ciValidationAfterFirstEdit === false) {
    add(
      'missing_ci_post_edit_validation',
      'validation',
      'medium',
      input.firstEditSeq,
      'CI workflow verifier commands were discovered but no matching CI command ran after editing.',
      `ci_verifiers=${input.ciWorkflowCommandCount}, commands=${input.ciVerifierCommands.slice(0, 3).join(' | ')}`,
    );
  }
  if (input.requireCiPostEditValidation && input.ciValidationAfterFirstEdit === true && input.passingCiValidationAfterFirstEdit === false) {
    add(
      'no_passing_ci_post_edit_validation',
      'validation',
      'high',
      input.firstCiValidationAfterFirstEditSeq,
      'A CI-derived post-edit verifier ran, but it did not pass.',
      `ci_verifiers=${input.ciWorkflowCommandCount}, first_ci_seq=${input.firstCiValidationAfterFirstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireFinalCiPostEditValidation && input.ciValidationAfterLastEdit === false) {
    add(
      'missing_final_ci_post_edit_validation',
      'validation',
      'medium',
      input.lastEditSeq,
      'A later edit occurred after CI-derived validation, but the final edit was not followed by a matching CI verifier.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}, first_ci_seq=${input.firstCiValidationAfterFirstEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireFinalCiPostEditValidation && input.ciValidationAfterLastEdit === true && input.passingCiValidationAfterLastEdit === false) {
    add(
      'no_passing_final_ci_post_edit_validation',
      'validation',
      'high',
      input.lastEditSeq,
      'The final edit was followed by a CI-derived verifier, but it did not pass.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}`,
    );
  }
  if (input.requireStablePostEditValidation) {
    add(
      'single_pass_post_edit_validation',
      'validation',
      'low',
      input.lastPostEditVerificationSeq,
      'The final edit has only one narrow passing verifier and no broad/CI or repeated stability evidence.',
      `last_edit_seq=${input.lastEditSeq ?? 'unknown'}, final_verifiers=${input.finalEditVerificationCount}, final_passing_verifiers=${input.finalEditPassingVerificationCount}, stable=${input.stableValidationAfterLastEdit === true ? 'yes' : 'no'}`,
    );
  }
  if (input.testHarnessEditEvents.length > 0 && !input.testEditPermissionDetected) {
    add(
      'test_harness_edit_without_contract',
      'benchmark_validity',
      'high',
      input.testHarnessEditEvents[0]?.seq ?? null,
      'The trajectory edited test, harness, or verifier files without an explicit task-contract requirement to do so.',
      input.testHarnessEditEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}:${event.target}`).join('; '),
    );
  }
  if (input.leakageRiskEvents.length > 0) {
    add(
      'benchmark_leakage_risk',
      'leakage',
      'critical',
      input.leakageRiskEvents[0]?.seq ?? null,
      'The trajectory touched a read-with-care benchmark artifact.',
      input.leakageRiskEvents.slice(0, 3).map((event) => `${event.tool}#${event.seq}:${event.target}`).join('; '),
    );
  }

  return defects;
}

function scoreBenchmarkProcess(defects: BenchmarkProcessDefect[]): number {
  const penalty = defects.reduce((sum, defect) => {
    if (defect.severity === 'critical') return sum + 35;
    if (defect.severity === 'high') return sum + 20;
    if (defect.severity === 'medium') return sum + 10;
    return sum + 5;
  }, 0);
  return Math.max(0, 100 - penalty);
}

export function buildSourceResearchCoverage(events: BenchmarkTraceEvent[]): SourceResearchCoverage {
  const coverage: SourceResearchCoverage = {
    callCount: 0,
    arxiv: false,
    github: false,
    huggingface: false,
    kaggle: false,
    sourceHitCount: 0,
    sourceErrorCount: 0,
    githubKinds: [],
    huggingFaceKinds: [],
    kaggleKinds: [],
    resultSources: [],
    topUrls: [],
    recentDays: [],
    freshTargetedCoverage: false,
    kaggleCompetitionsSkipped: false,
    coverageNotes: [],
    completeTargetedCoverage: false,
  };

  for (const event of events) {
    if (event.tool !== 'research_sources') continue;
    coverage.callCount++;
    const input = parseEventInputPreview(event.inputPreview);
    const source = String(input.source ?? 'all').toLowerCase();
    const githubKind = String(input.github_kind ?? 'repositories').toLowerCase();
    const hfKind = String(input.kind ?? 'all').toLowerCase();
    const kaggleKind = String(input.kaggle_kind ?? 'both').toLowerCase();
    const recentDays = Number(input.recent_days);
    if (Number.isFinite(recentDays) && recentDays > 0) {
      pushUniqueNumber(coverage.recentDays, Math.floor(recentDays));
    }
    collectSourceCoverageNotes(coverage, event.outputPreview);
    collectSourceResearchEvidence(coverage, event.outputPreview);

    if (source === 'all' || source === 'arxiv') coverage.arxiv = true;
    if (source === 'all' || source === 'github') {
      coverage.github = true;
      pushUnique(coverage.githubKinds, githubKind);
    }
    if (source === 'all' || source === 'huggingface') {
      coverage.huggingface = true;
      pushUnique(coverage.huggingFaceKinds, hfKind);
    }
    if (source === 'all' || source === 'kaggle') {
      coverage.kaggle = true;
      pushUnique(coverage.kaggleKinds, kaggleKind);
    }
  }

  coverage.completeTargetedCoverage =
    coverage.arxiv &&
    coverage.github &&
    coverage.huggingface &&
    coverage.kaggle &&
    coverage.githubKinds.includes('all') &&
    coverage.huggingFaceKinds.includes('all') &&
    coverage.kaggleKinds.includes('both') &&
    !coverage.kaggleCompetitionsSkipped;
  coverage.freshTargetedCoverage = coverage.completeTargetedCoverage && coverage.recentDays.length > 0;

  return coverage;
}

export function countTaskContractSignals(events: BenchmarkTraceEvent[]): number {
  return events
    .filter((event) => event.tool === 'benchmark_context')
    .reduce((sum, event) => sum + countTaskContractSignalsInOutput(event.outputPreview), 0);
}

function countTaskContractSignalsInOutput(output: string): number {
  return extractTaskContractSignalLines(output).length;
}

function hasNoEditContractInOutput(output: string): boolean {
  return extractTaskContractSignalLines(output).some((line) => NO_EDIT_CONTRACT_RE.test(line));
}

function extractTaskContractSignalLines(output: string): string[] {
  return uniqueStrings([
    ...extractBenchmarkContextSectionLines(output, 'Task Instruction Excerpts', /no concise task instruction excerpts/i),
    ...extractBenchmarkContextSectionLines(output, 'Task Contract Signals', /no explicit acceptance criteria/i),
  ]);
}

function extractBenchmarkContextSectionLines(output: string, heading: string, emptyPattern: RegExp): string[] {
  const marker = output.indexOf(`## ${heading}`);
  if (marker < 0) return [];
  const afterMarker = output.slice(marker + `## ${heading}`.length);
  const nextHeading = afterMarker.search(/\n##\s+/);
  const section = nextHeading >= 0 ? afterMarker.slice(0, nextHeading) : afterMarker;
  if (emptyPattern.test(section)) return [];
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+\S/.test(line) && !/^- \.\.\./.test(line))
    .map((line) => line.replace(/^-\s+/, '').trim());
}

function isTodoChecklistEvent(event: BenchmarkTraceEvent): boolean {
  if (event.tool !== 'todo_write' || event.status !== 'ok') return false;
  const input = parseEventInputPreview(event.inputPreview);
  if (Array.isArray(input.items) && input.items.length > 0) return true;
  return /Todo list updated \([1-9]\d* item/.test(event.outputPreview);
}

function buildBenchmarkLatestTodoState(events: BenchmarkTraceEvent[]): BenchmarkTodoState | null {
  const event = events
    .slice()
    .reverse()
    .find((candidate) => candidate.tool === 'todo_write' && candidate.status === 'ok');
  if (!event) return null;

  const items = todoItemsForEvent(event);
  const incompleteItems: BenchmarkTodoIncompleteItem[] = [];
  for (const item of items) {
    if (item.status === 'completed') continue;
    incompleteItems.push({
      status: item.status,
      content: truncate(redactTraceText(item.content), 160),
    });
  }

  return {
    seq: event.seq,
    incompleteCount: incompleteItems.length,
    incompleteItems: incompleteItems.slice(0, 20),
  };
}

function todoItemsForEvent(event: BenchmarkTraceEvent): Array<{ content: string; status: BenchmarkTodoStatus }> {
  const input = parseEventInputPreview(event.inputPreview);
  const inputItems = normalizeBenchmarkTodoItems(input.items);
  if (inputItems.length > 0) return inputItems;
  return todoItemsFromOutput(event.outputPreview);
}

function normalizeBenchmarkTodoItems(items: unknown): Array<{ content: string; status: BenchmarkTodoStatus }> {
  if (!Array.isArray(items)) return [];
  const normalized: Array<{ content: string; status: BenchmarkTodoStatus }> = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const parsed = todoItemFromString(item);
      if (parsed) normalized.push(parsed);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const content = String(obj.content ?? obj.task ?? obj.text ?? '').trim();
    if (!content) continue;
    normalized.push({
      content,
      status: normalizeBenchmarkTodoStatus(obj.status),
    });
  }
  return normalized.slice(0, 40);
}

function todoItemFromString(value: string): { content: string; status: BenchmarkTodoStatus } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const checkbox = trimmed.match(/^\s*[-*]?\s*\[( |x|X|-)\]\s*(.+)$/);
  if (!checkbox) return { content: trimmed, status: 'pending' };
  const marker = checkbox[1];
  const status = marker.toLowerCase() === 'x'
    ? 'completed'
    : marker === '-'
      ? 'in_progress'
      : 'pending';
  return { content: checkbox[2].trim(), status };
}

function todoItemsFromOutput(output: string): Array<{ content: string; status: BenchmarkTodoStatus }> {
  const items: Array<{ content: string; status: BenchmarkTodoStatus }> = [];
  for (const line of output.split(/\r?\n/)) {
    const parsed = todoItemFromString(line);
    if (parsed && /^\s*[-*]?\s*\[(?: |x|X|-)\]/.test(line)) items.push(parsed);
  }
  return items.slice(0, 40);
}

function normalizeBenchmarkTodoStatus(value: unknown): BenchmarkTodoStatus {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (['done', 'complete', 'completed', 'x', 'checked'].includes(raw)) return 'completed';
  if (['active', 'current', 'doing', 'in_progress', 'inprogress'].includes(raw)) return 'in_progress';
  return 'pending';
}

function hasTestEditPermission(events: BenchmarkTraceEvent[]): boolean {
  return events
    .filter((event) => event.tool === 'benchmark_context')
    .flatMap((event) => extractTaskContractSignalLines(event.outputPreview))
    .some((line) => TEST_EDIT_PERMISSION_RE.test(line));
}

function hasBroadEditContract(events: BenchmarkTraceEvent[]): boolean {
  return events
    .filter((event) => event.tool === 'benchmark_context')
    .flatMap((event) => extractTaskContractSignalLines(event.outputPreview))
    .some((line) => BROAD_EDIT_CONTRACT_RE.test(line));
}

function hasScratchArtifactPermission(events: BenchmarkTraceEvent[]): boolean {
  return events
    .filter((event) => event.tool === 'benchmark_context')
    .flatMap((event) => extractTaskContractSignalLines(event.outputPreview))
    .some(lineAllowsScratchArtifact);
}

function lineAllowsScratchArtifact(line: string): boolean {
  if (!SCRATCH_ARTIFACT_PERMISSION_RE.test(line)) return false;
  return !/\b(?:do\s+not|don't|avoid|remove|delete|without|not\s+allowed|must\s+not|should\s+not)\b.{0,80}\b(?:repro(?:duction)?|reproducer|debug|diagnostic|probe|scratch|playground|sandbox)\b/i.test(line);
}

function shouldRequirePostEditDiffReview(input: {
  firstEditSeq: number | null;
  passingValidationAfterFirstEdit: boolean | null;
  postEditDiffReview: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testEditPermissionDetected: boolean;
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.postEditDiffReview === true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireBroadPostEditValidation(input: {
  firstEditSeq: number | null;
  passingValidationAfterFirstEdit: boolean | null;
  broadValidationAfterFirstEdit: boolean | null;
  passingBroadValidationAfterFirstEdit: boolean | null;
  postEditDiffReview: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testEditPermissionDetected: boolean;
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.passingBroadValidationAfterFirstEdit === true) return false;
  if (input.postEditDiffReview !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireFinalPostEditValidation(input: {
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  validationAfterLastEdit: boolean | null;
  passingValidationAfterFirstEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null || input.lastEditSeq == null) return false;
  if (input.lastEditSeq <= input.firstEditSeq) return false;
  if (input.validationAfterLastEdit === true) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireFinalPassingPostEditValidation(input: {
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  validationAfterLastEdit: boolean | null;
  passingValidationAfterLastEdit: boolean | null;
  passingValidationAfterFirstEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null || input.lastEditSeq == null) return false;
  if (input.lastEditSeq <= input.firstEditSeq) return false;
  if (input.validationAfterLastEdit !== true) return false;
  if (input.passingValidationAfterLastEdit === true) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireLatestPostEditVerifierPassing(input: {
  firstEditSeq: number | null;
  passingValidationAfterFirstEdit: boolean | null;
  lastPostEditVerificationConclusiveFailure: boolean | null;
  requireFinalPassingPostEditValidation: boolean;
  requireBroadPostEditValidation: boolean;
  broadValidationAfterFirstEdit: boolean | null;
  passingBroadValidationAfterFirstEdit: boolean | null;
}): boolean {
  if (input.firstEditSeq == null) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.lastPostEditVerificationConclusiveFailure !== true) return false;
  if (input.requireFinalPassingPostEditValidation) return false;
  if (input.requireBroadPostEditValidation
    && input.broadValidationAfterFirstEdit === true
    && input.passingBroadValidationAfterFirstEdit === false) {
    return false;
  }
  return true;
}

function shouldRequireStablePostEditValidation(input: {
  firstEditSeq: number | null;
  passingValidationAfterLastEdit: boolean | null;
  stableValidationAfterLastEdit: boolean | null;
  lastPostEditVerificationStatus: 'ok' | 'error' | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null) return false;
  if (input.passingValidationAfterLastEdit !== true) return false;
  if (input.stableValidationAfterLastEdit !== false) return false;
  if (input.lastPostEditVerificationStatus !== 'ok') return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireTaskContractChecklistCompletion(input: {
  taskContractSignalCount: number;
  taskContractChecklistAfterContext: boolean | null;
  taskContractChecklistComplete: boolean | null;
  todoIncompleteCount: number;
  passingValidationAfterFirstEdit: boolean | null;
  successfulVerificationCount: number;
  noEditContractDetected: boolean;
  editAfterNoEditContract: boolean;
  lastPostEditVerificationConclusiveFailure: boolean | null;
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.taskContractSignalCount === 0) return false;
  if (input.taskContractChecklistAfterContext !== true) return false;
  if (input.taskContractChecklistComplete !== false) return false;
  if (input.todoIncompleteCount <= 0) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.lastPostEditVerificationConclusiveFailure === true) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  if (input.passingValidationAfterFirstEdit === true) return true;
  if (input.noEditContractDetected && input.successfulVerificationCount > 0) return true;
  return false;
}

function shouldRequireFinalPostEditDiffReview(input: {
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  passingValidationAfterLastEdit: boolean | null;
  postEditDiffReview: boolean | null;
  diffReviewAfterLastEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null || input.lastEditSeq == null) return false;
  if (input.lastEditSeq <= input.firstEditSeq) return false;
  if (input.passingValidationAfterLastEdit !== true) return false;
  if (input.postEditDiffReview !== true) return false;
  if (input.diffReviewAfterLastEdit === true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireFinalBroadPostEditValidation(input: {
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  firstBroadValidationAfterFirstEditSeq: number | null;
  passingValidationAfterLastEdit: boolean | null;
  passingBroadValidationAfterFirstEdit: boolean | null;
  passingBroadValidationAfterLastEdit: boolean | null;
  diffReviewAfterLastEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.firstEditSeq == null || input.lastEditSeq == null) return false;
  if (input.lastEditSeq <= input.firstEditSeq) return false;
  if (input.firstBroadValidationAfterFirstEditSeq == null || input.lastEditSeq <= input.firstBroadValidationAfterFirstEditSeq) return false;
  if (input.passingBroadValidationAfterFirstEdit !== true) return false;
  if (input.passingBroadValidationAfterLastEdit === true) return false;
  if (input.passingValidationAfterLastEdit !== true) return false;
  if (input.diffReviewAfterLastEdit !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return true;
}

function shouldRequireCiPostEditValidation(input: {
  ciVerifierCommands: string[];
  firstEditSeq: number | null;
  passingValidationAfterFirstEdit: boolean | null;
  ciValidationAfterFirstEdit: boolean | null;
  passingCiValidationAfterFirstEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.ciVerifierCommands.length === 0) return false;
  if (input.firstEditSeq == null) return false;
  if (input.passingCiValidationAfterFirstEdit === true) return false;
  if (input.passingValidationAfterFirstEdit !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return input.ciValidationAfterFirstEdit !== null;
}

function shouldRequireFinalCiPostEditValidation(input: {
  ciVerifierCommands: string[];
  firstEditSeq: number | null;
  lastEditSeq: number | null;
  firstCiValidationAfterFirstEditSeq: number | null;
  passingCiValidationAfterFirstEdit: boolean | null;
  ciValidationAfterLastEdit: boolean | null;
  passingCiValidationAfterLastEdit: boolean | null;
  passingValidationAfterLastEdit: boolean | null;
  diffReviewAfterLastEdit: boolean | null;
  localizationBeforeFirstEdit: boolean | null;
  failingReproductionBeforeFirstEdit: boolean | null;
  editAfterNoEditContract: boolean;
  unlocalizedEditTargetEvents: BenchmarkUnlocalizedEditEvent[];
  testHarnessEditEvents: BenchmarkTestHarnessEditEvent[];
  leakageRiskEvents: BenchmarkLeakageRiskEvent[];
}): boolean {
  if (input.ciVerifierCommands.length === 0) return false;
  if (input.firstEditSeq == null || input.lastEditSeq == null) return false;
  if (input.lastEditSeq <= input.firstEditSeq) return false;
  if (input.firstCiValidationAfterFirstEditSeq == null || input.lastEditSeq <= input.firstCiValidationAfterFirstEditSeq) return false;
  if (input.passingCiValidationAfterFirstEdit !== true) return false;
  if (input.passingCiValidationAfterLastEdit === true) return false;
  if (input.passingValidationAfterLastEdit !== true) return false;
  if (input.diffReviewAfterLastEdit !== true) return false;
  if (input.localizationBeforeFirstEdit === false) return false;
  if (input.failingReproductionBeforeFirstEdit !== true) return false;
  if (input.editAfterNoEditContract) return false;
  if (input.unlocalizedEditTargetEvents.length > 0) return false;
  if (input.testHarnessEditEvents.length > 0) return false;
  if (input.leakageRiskEvents.length > 0) return false;
  return input.ciValidationAfterLastEdit !== null;
}

export function buildBenchmarkUnlocalizedEditEvents(events: BenchmarkTraceEvent[]): BenchmarkUnlocalizedEditEvent[] {
  return buildBenchmarkEditTargetEvidence(events).unlocalized;
}

export function buildBenchmarkRedundantToolCallEvents(events: BenchmarkTraceEvent[]): BenchmarkRedundantToolCallEvent[] {
  const seen = new Map<string, { seq: number; repeatCount: number; target: string }>();
  const redundant: BenchmarkRedundantToolCallEvent[] = [];
  let lastProgressSeq = 0;

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (isTraceProgressEvent(event)) {
      lastProgressSeq = event.seq;
      seen.clear();
      continue;
    }
    const fingerprint = redundantToolCallFingerprint(event);
    if (!fingerprint) continue;
    const prior = seen.get(fingerprint);
    if (prior && prior.seq > lastProgressSeq) {
      prior.repeatCount++;
      redundant.push({
        seq: event.seq,
        tool: event.tool,
        target: truncate(redactTraceText(event.target || prior.target || event.tool), 160),
        repeatOfSeq: prior.seq,
        repeatCount: prior.repeatCount,
        reason: 'same read/search tool input repeated without intervening edit or verification progress',
      });
    } else {
      seen.set(fingerprint, {
        seq: event.seq,
        repeatCount: 0,
        target: event.target,
      });
    }
  }

  return redundant.slice(0, 20);
}

export function buildBenchmarkRedundantVerifierEvents(events: BenchmarkTraceEvent[]): BenchmarkRedundantVerifierEvent[] {
  const seen = new Map<string, { seq: number; repeatCount: number; command: string }>();
  const redundant: BenchmarkRedundantVerifierEvent[] = [];
  let lastProgressSeq = 0;

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (isVerifierLoopProgressEvent(event)) {
      lastProgressSeq = event.seq;
      seen.clear();
      continue;
    }
    if (!isConclusiveFailedVerification(event)) continue;
    const command = verifierCommandForEvent(event);
    const fingerprint = normalizeVerifierCommand(command);
    if (!fingerprint) continue;
    const prior = seen.get(fingerprint);
    if (prior && prior.seq > lastProgressSeq) {
      prior.repeatCount++;
      redundant.push({
        seq: event.seq,
        command: truncate(redactTraceText(command), 180),
        repeatOfSeq: prior.seq,
        repeatCount: prior.repeatCount,
        reason: 'same failing verifier command repeated without intervening edit or inspection progress',
      });
    } else {
      seen.set(fingerprint, {
        seq: event.seq,
        repeatCount: 0,
        command,
      });
    }
  }

  return redundant.slice(0, 20);
}

export function buildBenchmarkBlindRepairEvents(events: BenchmarkTraceEvent[]): BenchmarkBlindRepairEvent[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const firstEditSeq = firstSeq(sorted, isEditEvent);
  const repairs: BenchmarkBlindRepairEvent[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const failed = sorted[index];
    if (!isConclusiveFailedVerification(failed)) continue;
    if (firstEditSeq == null || failed.seq <= firstEditSeq) continue;
    let inspectedFailure = false;

    for (const next of sorted.slice(index + 1)) {
      if (isFailureInspectionEvent(next)) {
        inspectedFailure = true;
        break;
      }
      if (next.verification) break;
      if (!isEditEvent(next)) continue;
      if (!inspectedFailure && !editTargetSupportedByFailureEvidence(failed, next)) {
        repairs.push({
          failedVerificationSeq: failed.seq,
          editSeq: next.seq,
          command: truncate(redactTraceText(verifierCommandForEvent(failed)), 180),
          editTarget: truncate(redactTraceText(formatEditTargetsForEvent(next)), 180),
          reason: blindRepairReason(failed, next),
        });
      }
      break;
    }
  }

  return repairs.slice(0, 20);
}

export function buildBenchmarkPostEditRegressionCycleEvents(events: BenchmarkTraceEvent[]): BenchmarkPostEditRegressionCycleEvent[] {
  const firstEditSeq = firstSeq(events, isEditEvent);
  if (firstEditSeq == null) return [];
  const verifierEvents = [...events]
    .filter((event) => event.verification && event.seq > firstEditSeq)
    .sort((a, b) => a.seq - b.seq);
  const cycles: BenchmarkPostEditRegressionCycleEvent[] = [];

  for (let index = 0; index < verifierEvents.length; index++) {
    const event = verifierEvents[index];
    if (!isConclusiveFailedVerification(event)) continue;
    const priorPassing = [...verifierEvents.slice(0, index)].reverse().find((candidate) => candidate.status === 'ok');
    if (!priorPassing) continue;
    const recoveryPassing = verifierEvents.slice(index + 1).find((candidate) => candidate.status === 'ok');
    if (!recoveryPassing) continue;
    cycles.push({
      firstPassingSeq: priorPassing.seq,
      failingSeq: event.seq,
      recoveryPassingSeq: recoveryPassing.seq,
      failingCommand: truncate(redactTraceText(verifierCommandForEvent(event)), 180),
      recoveryCommand: truncate(redactTraceText(verifierCommandForEvent(recoveryPassing)), 180),
      broadFailure: isBroadVerificationEvent(event),
    });
  }

  return cycles.slice(0, 20);
}

export function buildBenchmarkFailureUnalignedRepairEvents(events: BenchmarkTraceEvent[]): BenchmarkFailureUnalignedRepairEvent[] {
  return buildBenchmarkFailureRepairAlignment(events).unalignedEvents;
}

function buildBenchmarkFailureRepairAlignment(events: BenchmarkTraceEvent[]): {
  alignedCount: number;
  unalignedEvents: BenchmarkFailureUnalignedRepairEvent[];
} {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let alignedCount = 0;
  const unalignedEvents: BenchmarkFailureUnalignedRepairEvent[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const failed = sorted[index];
    if (!isConclusiveFailedVerification(failed)) continue;
    const failureFiles = sourceFailureFilesForVerifier(failed);
    if (failureFiles.length === 0) continue;
    const failureFileSet = new Set(failureFiles.map(normalizeTracePath).filter(Boolean));
    let alignedInspection = false;
    const inspectedTargets: string[] = [];

    for (const next of sorted.slice(index + 1)) {
      if (next.verification) break;
      if (isFailureInspectionEvent(next)) {
        inspectedTargets.push(formatFailureInspectionTarget(next));
        if (failureInspectionMatchesFiles(next, failureFileSet)) alignedInspection = true;
        continue;
      }
      if (!isEditEvent(next)) continue;
      const editTargets = supportedEditTargetsForBlindRepair(next)
        .filter((target) => !detectTestHarnessEditRisk(target))
        .map(normalizeTracePath)
        .filter(Boolean);
      if (editTargets.length === 0) break;
      const directFailureTargetEdit = editTargets.some((target) => isLocalizedTarget(target, failureFileSet));
      if (directFailureTargetEdit || alignedInspection) {
        alignedCount++;
      } else {
        unalignedEvents.push({
          failedVerificationSeq: failed.seq,
          editSeq: next.seq,
          command: truncate(redactTraceText(verifierCommandForEvent(failed)), 180),
          failureFiles: failureFiles.slice(0, 6),
          inspectedTargets: uniqueStrings(inspectedTargets).slice(0, 6),
          editTarget: truncate(redactTraceText(formatEditTargetsForEvent(next)), 180),
          reason: inspectedTargets.length === 0
            ? 'repair edited a different source target before inspecting parsed source failure files'
            : 'repair inspected only targets that did not match parsed source failure files before editing elsewhere',
        });
      }
      break;
    }
  }

  return { alignedCount, unalignedEvents: unalignedEvents.slice(0, 20) };
}

export function buildBenchmarkIncompleteVerifierEvents(events: BenchmarkTraceEvent[]): BenchmarkVerifierIncompleteRun[] {
  return events.flatMap((event) => {
    const incomplete = extractVerifierIncompleteRun(event);
    return incomplete ? [incomplete] : [];
  }).slice(0, 20);
}

export function buildBenchmarkEnvironmentSetupEvents(events: BenchmarkTraceEvent[]): BenchmarkEnvironmentSetupEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((event) => {
      if (event.tool !== 'bash') return [];
      const command = verifierCommandForEvent(event);
      const kind = classifyEnvironmentSetupCommand(command);
      if (!kind) return [];
      return [{
        seq: event.seq,
        command: truncate(redactTraceText(command), 180),
        status: event.status,
        kind,
      }];
    })
    .slice(0, 20);
}

export function buildBenchmarkDependencyEditEvents(events: BenchmarkTraceEvent[]): BenchmarkDependencyEditEvent[] {
  const seen = new Set<string>();
  const dependencyEvents: BenchmarkDependencyEditEvent[] = [];
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!isEditEvent(event)) continue;
    for (const target of editedTargetsForEvent(event)) {
      const dependency = classifyDependencyFileTarget(target);
      if (!dependency) continue;
      const key = `${event.seq}\0${normalizeTracePath(target)}\0${dependency.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dependencyEvents.push({
        seq: event.seq,
        tool: event.tool,
        target: truncate(redactTraceText(target), 240),
        ecosystem: dependency.ecosystem,
        kind: dependency.kind,
      });
    }
  }
  return dependencyEvents.slice(0, 40);
}

export function buildBenchmarkSkillViewEvents(events: BenchmarkTraceEvent[]): BenchmarkSkillViewEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((event) => {
      if (event.tool !== 'skill_view') return [];
      const input = parseEventInputPreview(event.inputPreview);
      const fromInput = typeof input.name === 'string' ? input.name : '';
      const fromOutput = event.outputPreview.match(/^#\s+(.+?)\s*$/m)?.[1] ?? '';
      const name = truncate(redactTraceText(fromOutput || fromInput || event.target || 'unknown skill'), 120);
      return [{ seq: event.seq, name }];
    })
    .slice(0, 20);
}

export function buildBenchmarkInvalidToolActionEvents(events: BenchmarkTraceEvent[]): BenchmarkInvalidToolActionEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((event) => {
      if (event.tool !== BENCHMARK_INVALID_TOOL_ACTION_TOOL) return [];
      const input = parseEventInputPreview(event.inputPreview);
      const target = String(event.target ?? '');
      const [targetReason, ...targetToolParts] = target.split(':');
      const tool = truncate(redactTraceText(String(input.tool ?? targetToolParts.join(':') ?? 'unknown')), 120);
      const reason = normalizeInvalidToolActionReason(String(input.reason ?? targetReason ?? 'invalid_action'));
      return [{
        seq: event.seq,
        tool: tool || 'unknown',
        reason,
        evidence: truncate(redactTraceText(event.outputPreview), 240),
      }];
    })
    .slice(0, 20);
}

export function buildBenchmarkEnvironmentSetupFailureEvents(events: BenchmarkTraceEvent[]): BenchmarkEnvironmentSetupFailureEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((event) => {
      const failure = extractEnvironmentSetupFailure(event);
      return failure ? [failure] : [];
    })
    .slice(0, 20);
}

function buildBenchmarkUnresolvedEnvironmentSetupFailureEvents(
  events: BenchmarkTraceEvent[],
  failures: BenchmarkEnvironmentSetupFailureEvent[],
  setupEvents: BenchmarkEnvironmentSetupEvent[],
): BenchmarkEnvironmentSetupFailureEvent[] {
  return failures.filter((failure) => {
    const laterSuccessfulSetup = setupEvents.some((setup) => setup.seq > failure.seq && setup.status === 'ok');
    if (laterSuccessfulSetup) return false;
    const laterPassingVerifier = events.some((event) => event.seq > failure.seq && event.verification && event.status === 'ok');
    return !laterPassingVerifier;
  }).slice(0, 20);
}

function isTraceProgressEvent(event: BenchmarkTraceEvent): boolean {
  return isEditEvent(event) || event.verification || event.tool === 'todo_write';
}

function isVerifierLoopProgressEvent(event: BenchmarkTraceEvent): boolean {
  return isEditEvent(event)
    || isInspectionEvent(event)
    || isDiffReviewEvent(event)
    || event.tool === 'todo_write'
    || event.tool === 'web_search'
    || event.tool === 'web_fetch'
    || event.tool === 'research_sources';
}

function isFailureInspectionEvent(event: BenchmarkTraceEvent): boolean {
  if (event.verification || isEditEvent(event)) return false;
  if (['read_file', 'grep', 'glob', 'list_dir', 'memory_search', 'memory_recall'].includes(event.tool)) return true;
  if (event.tool !== 'bash') return false;
  const command = verifierCommandForEvent(event).replace(/\s+/g, ' ').trim();
  return /\b(?:rg|grep|find|fd|ls|dir|cat|type|sed|awk|less|bat|git\s+(?:diff|status|show|grep|log|blame)|get-content|select-string)\b/i.test(command);
}

function editTargetSupportedByFailureEvidence(failedVerifier: BenchmarkTraceEvent, editEvent: BenchmarkTraceEvent): boolean {
  const signature = extractVerifierFailureSignature(failedVerifier);
  const failureFiles = new Set(
    (signature?.files ?? [])
      .map(normalizeTracePath)
      .filter(Boolean),
  );
  if (failureFiles.size === 0) return false;
  return supportedEditTargetsForBlindRepair(editEvent)
    .map(normalizeTracePath)
    .filter(Boolean)
    .some((target) => isLocalizedTarget(target, failureFiles));
}

function sourceFailureFilesForVerifier(event: BenchmarkTraceEvent): string[] {
  const signature = extractVerifierFailureSignature(event);
  if (!signature) return [];
  return uniqueStrings(
    signature.files
      .map(normalizeTracePath)
      .filter((file) => file && !isCommonNonSourceReference(file) && !detectTestHarnessEditRisk(file)),
  ).slice(0, 12);
}

function failureInspectionMatchesFiles(event: BenchmarkTraceEvent, failureFiles: Set<string>): boolean {
  if (failureFiles.size === 0) return false;
  const evidenceTargets = new Set<string>();
  if (isLocalContextInspectionEvent(event)) {
    for (const ref of localContextInspectionFileReferences(event)) {
      const normalized = normalizeTracePath(ref);
      if (normalized) evidenceTargets.add(normalized);
    }
  } else if (event.tool === 'bash') {
    for (const ref of extractFileReferences(`${event.target}\n${event.outputPreview}`)) {
      const normalized = normalizeTracePath(ref);
      if (normalized) evidenceTargets.add(normalized);
    }
  }
  for (const failureFile of failureFiles) {
    if (isLocalizedTarget(failureFile, evidenceTargets)) return true;
  }
  return false;
}

function formatFailureInspectionTarget(event: BenchmarkTraceEvent): string {
  const input = parseEventInputPreview(event.inputPreview);
  if (event.tool === 'bash') return truncate(redactTraceText(verifierCommandForEvent(event)), 180);
  const target = event.target || String(input.file_path ?? input.path ?? input.pattern ?? event.tool);
  return truncate(redactTraceText(target), 180);
}

function blindRepairReason(failedVerifier: BenchmarkTraceEvent, editEvent: BenchmarkTraceEvent): string {
  const signature = extractVerifierFailureSignature(failedVerifier);
  const editTargets = supportedEditTargetsForBlindRepair(editEvent)
    .map(normalizeTracePath)
    .filter(Boolean);
  if ((signature?.files ?? []).length === 0) {
    return 'failed verifier was followed by an edit before read/search inspection and without parsed failure-file evidence';
  }
  if (editTargets.length === 0) {
    return 'failed verifier was followed by an edit before read/search inspection and without a parseable edit target';
  }
  return 'edit target did not match parsed failure-file evidence and no read/search inspection happened after the failed verifier';
}

function supportedEditTargetsForBlindRepair(event: BenchmarkTraceEvent): string[] {
  const localizedTargets = localizationRequiredEditTargets(event);
  return localizedTargets.length > 0 ? localizedTargets : editedTargetsForEvent(event);
}

function formatEditTargetsForEvent(event: BenchmarkTraceEvent): string {
  const targets = supportedEditTargetsForBlindRepair(event).filter(Boolean);
  return targets.length > 0 ? targets.slice(0, 3).join(', ') : event.target || event.tool;
}

function verifierCommandForEvent(event: BenchmarkTraceEvent): string {
  const input = parseEventInputPreview(event.inputPreview);
  return String(input.command ?? event.target ?? '').replace(/^\$\s*/, '').trim();
}

function normalizeVerifierCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim().toLowerCase();
}

function redundantToolCallFingerprint(event: BenchmarkTraceEvent): string | null {
  if (event.status !== 'ok') return null;
  if (!['benchmark_context', 'read_file', 'grep', 'glob', 'list_dir', 'web_search', 'web_fetch', 'research_sources'].includes(event.tool)) {
    return null;
  }
  const input = normalizePreviewForFingerprint(event.inputPreview);
  const target = normalizePreviewForFingerprint(event.target);
  return `${event.tool}\0${input}\0${target}`;
}

function normalizePreviewForFingerprint(value: string): string {
  const parsed = parseEventInputPreview(value);
  if (Object.keys(parsed).length > 0) return stableStringify(parsed);
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildBenchmarkScratchArtifactEvents(events: BenchmarkTraceEvent[]): BenchmarkScratchArtifactEvent[] {
  const risks: BenchmarkScratchArtifactEvent[] = [];
  for (const event of events) {
    for (const target of scratchArtifactTargetsForEvent(event)) {
      const normalized = normalizeTracePath(target);
      if (!normalized) continue;
      if (detectTestHarnessEditRisk(normalized)) continue;
      const reason = detectScratchArtifactRisk(normalized);
      if (!reason) continue;
      risks.push({
        seq: event.seq,
        tool: event.tool,
        target: truncate(redactTraceText(target), 240),
        reason,
      });
    }
  }
  return risks.slice(0, 20);
}

function buildBenchmarkEditSurface(events: BenchmarkTraceEvent[]): { targets: string[] } {
  const targets = new Map<string, string>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!isEditEvent(event)) continue;
    for (const target of editedTargetsForEvent(event)) {
      const normalized = normalizeTracePath(target);
      if (!normalized) continue;
      if (detectTestHarnessEditRisk(normalized)) continue;
      if (!isLargeEditSurfaceTarget(normalized)) continue;
      targets.set(normalized, truncate(redactTraceText(target), 160));
    }
  }
  return { targets: Array.from(targets.values()).slice(0, 40) };
}

function isLargeEditSurfaceTarget(target: string): boolean {
  if (!target || isCommonNonSourceReference(target)) return false;
  const base = target.split('/').at(-1) ?? target;
  if (/^(?:package-lock|pnpm-lock|yarn\.lock|bun\.lockb?|poetry\.lock|cargo\.lock|go\.sum)$/.test(base)) return false;
  if (/\.(?:md|mdx|txt|rst|png|jpe?g|gif|webp|svg|ico|pdf|zip|tar|gz|map|snap|lock)$/i.test(base)) return false;
  if (/^(?:package|pyproject|cargo|go\.mod|pom|build\.gradle|settings\.gradle|tsconfig|vite\.config|next\.config|webpack\.config|rollup\.config|eslint\.config|prettier\.config)\b/i.test(base)) {
    return true;
  }
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|cs|rb|php|swift|scala|c|cc|cpp|cxx|h|hpp|m|mm|dart|vue|svelte|astro|html|css|scss|sass|less|sql|graphql|gql|json|ya?ml|toml)$/i.test(base);
}

function buildBenchmarkEditTargetEvidence(events: BenchmarkTraceEvent[]): {
  total: number;
  localized: number;
  unlocalized: BenchmarkUnlocalizedEditEvent[];
  targets: string[];
} {
  const localizedTargets = new Set<string>();
  const targetMap = new Map<string, string>();
  let total = 0;
  let localized = 0;
  const unlocalized: BenchmarkUnlocalizedEditEvent[] = [];

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (isEditEvent(event)) {
      for (const target of localizationRequiredEditTargets(event)) {
        total++;
        const normalized = normalizeTracePath(target);
        if (!normalized) continue;
        targetMap.set(normalized, truncate(redactTraceText(target), 240));
        if (isLocalizedTarget(normalized, localizedTargets)) {
          localized++;
        } else {
          unlocalized.push({
            seq: event.seq,
            tool: event.tool,
            target: truncate(redactTraceText(target), 240),
            reason: 'edited source target was not read or found in prior search/verifier output',
          });
        }
      }
    }
    collectLocalizationEvidence(event, localizedTargets);
  }

  return {
    total,
    localized,
    unlocalized: unlocalized.slice(0, 20),
    targets: Array.from(targetMap.values()).slice(0, 100),
  };
}

function buildBenchmarkContextUtilization(
  events: BenchmarkTraceEvent[],
  editTargets: string[],
): {
  inspectCount: number;
  hitCount: number;
  missCount: number;
  percent: number | null;
  risk: boolean;
  missEvents: BenchmarkContextUtilizationEvent[];
} {
  const normalizedTargets = new Set(editTargets.map(normalizeTracePath).filter(Boolean));
  const inspected = [...events]
    .sort((a, b) => a.seq - b.seq)
    .filter(isLocalContextInspectionEvent);
  let hitCount = 0;
  const missEvents: BenchmarkContextUtilizationEvent[] = [];

  for (const event of inspected) {
    if (localContextInspectionMatchesEditTarget(event, normalizedTargets)) {
      hitCount++;
    } else {
      missEvents.push({
        seq: event.seq,
        tool: event.tool,
        target: truncate(redactTraceText(event.target || summarizeReplayInputTarget(event.inputPreview) || event.tool), 180),
        reason: 'local read/search/list inspection did not match any edited source target',
      });
    }
  }

  const inspectCount = inspected.length;
  const missCount = inspectCount - hitCount;
  const percent = inspectCount === 0 ? null : Number(((hitCount / inspectCount) * 100).toFixed(2));
  const risk = normalizedTargets.size > 0
    && inspectCount >= CONTEXT_UTILIZATION_MIN_INSPECTIONS
    && percent !== null
    && percent < CONTEXT_UTILIZATION_MIN_PERCENT;

  return {
    inspectCount,
    hitCount,
    missCount,
    percent,
    risk,
    missEvents: missEvents.slice(0, 20),
  };
}

function isLocalContextInspectionEvent(event: BenchmarkTraceEvent): boolean {
  return event.status === 'ok' && ['read_file', 'grep', 'glob', 'list_dir'].includes(event.tool);
}

function localContextInspectionMatchesEditTarget(
  event: BenchmarkTraceEvent,
  normalizedTargets: Set<string>,
): boolean {
  if (normalizedTargets.size === 0) return false;

  const evidenceTargets = new Set<string>();
  for (const ref of localContextInspectionFileReferences(event)) {
    const normalized = normalizeTracePath(ref);
    if (normalized) evidenceTargets.add(normalized);
  }
  for (const target of normalizedTargets) {
    if (isLocalizedTarget(target, evidenceTargets)) return true;
  }

  for (const directory of localContextInspectionDirectories(event)) {
    const normalizedDirectory = normalizeTracePath(directory).replace(/\/+$/, '');
    if (!normalizedDirectory || normalizedDirectory === '.') continue;
    for (const target of normalizedTargets) {
      if (target.startsWith(`${normalizedDirectory}/`)) return true;
    }
  }
  return false;
}

function localContextInspectionFileReferences(event: BenchmarkTraceEvent): string[] {
  const input = parseEventInputPreview(event.inputPreview);
  if (event.tool === 'read_file') {
    return stringsFromUnknown(input.file_path ?? input.path ?? event.target);
  }
  if (event.tool === 'grep' || event.tool === 'glob') {
    return extractFileReferences(`${event.target}\n${event.outputPreview}`);
  }
  if (event.tool === 'list_dir') {
    return extractFileReferences(`${event.target}\n${event.outputPreview}`);
  }
  return [];
}

function localContextInspectionDirectories(event: BenchmarkTraceEvent): string[] {
  if (event.tool !== 'list_dir') return [];
  const input = parseEventInputPreview(event.inputPreview);
  return stringsFromUnknown(input.path ?? event.target);
}

function localizationRequiredEditTargets(event: BenchmarkTraceEvent): string[] {
  const targets = editedTargetsForEvent(event)
    .map((target) => target.trim())
    .filter(Boolean)
    .filter((target) => !detectTestHarnessEditRisk(target))
    .filter((target) => !isDependencyLockfileTarget(target));
  if (event.tool === 'edit_file') return targets;
  if (event.tool === 'apply_patch') {
    const input = parseEventInputPreview(event.inputPreview);
    const patch = typeof input.patch === 'string' ? input.patch : '';
    return extractPatchTargetsByOperation(patch)
      .filter((target) => target.operation !== 'Add')
      .map((target) => target.file)
      .filter((target) => target && !detectTestHarnessEditRisk(target) && !isDependencyLockfileTarget(target));
  }
  return [];
}

function isDependencyLockfileTarget(target: string): boolean {
  return classifyDependencyFileTarget(target)?.kind === 'lockfile';
}

function collectLocalizationEvidence(event: BenchmarkTraceEvent, localizedTargets: Set<string>): void {
  const input = parseEventInputPreview(event.inputPreview);
  if (event.tool === 'read_file') {
    for (const target of stringsFromUnknown(input.file_path ?? input.path ?? event.target)) {
      addLocalizedTarget(localizedTargets, target);
    }
    return;
  }
  if (['grep', 'glob', 'bash'].includes(event.tool)) {
    for (const target of extractFileReferences(`${event.target}\n${event.outputPreview}`)) {
      addLocalizedTarget(localizedTargets, target);
    }
  }
}

function addLocalizedTarget(targets: Set<string>, raw: string): void {
  const normalized = normalizeTracePath(raw);
  if (normalized) targets.add(normalized);
}

function isLocalizedTarget(target: string, localizedTargets: Set<string>): boolean {
  if (localizedTargets.has(target)) return true;
  const base = target.split('/').at(-1);
  if (!base) return false;
  let basenameMatches = 0;
  for (const localized of localizedTargets) {
    if (localized.split('/').at(-1) === base) basenameMatches++;
  }
  return basenameMatches === 1;
}

function extractFileReferences(text: string): string[] {
  const refs = new Set<string>();
  const normalized = text.replace(/\\/g, '/');
  const re = /(?:^|[\s"'([<{])((?:\.{1,2}\/)?[A-Za-z0-9_@+~.-]+(?:\/[A-Za-z0-9_@+~.-]+)*\.[A-Za-z0-9]{1,10})(?::\d+)?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const ref = normalizeTracePath(match[1]);
    if (ref && !isCommonNonSourceReference(ref)) refs.add(ref);
  }
  return Array.from(refs).slice(0, 100);
}

function normalizeTracePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\.\//, '')
    .replace(/:\d+(?::\d+)?$/, '')
    .trim()
    .toLowerCase();
}

function isCommonNonSourceReference(path: string): boolean {
  return /^(?:https?|file):/.test(path)
    || /\.(?:com|org|net|io|dev|invalid|test|local)$/i.test(path)
    || /^\d+(?:\.\d+)?s$/i.test(path)
    || /(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock|bun\.lockb?)$/.test(path);
}

export function buildBenchmarkTestHarnessEditEvents(events: BenchmarkTraceEvent[]): BenchmarkTestHarnessEditEvent[] {
  const risks: BenchmarkTestHarnessEditEvent[] = [];
  for (const event of events) {
    for (const target of editedTargetsForEvent(event)) {
      const reason = detectTestHarnessEditRisk(target);
      if (!reason) continue;
      risks.push({
        seq: event.seq,
        tool: event.tool,
        target: truncate(redactTraceText(target), 240),
        reason,
      });
    }
  }
  return risks.slice(0, 20);
}

function editedTargetsForEvent(event: BenchmarkTraceEvent): string[] {
  if (!isEditEvent(event)) return [];
  const input = parseEventInputPreview(event.inputPreview);
  if (event.tool === 'write_file' || event.tool === 'edit_file') {
    return stringsFromUnknown(input.file_path ?? input.path ?? event.target);
  }
  if (event.tool === 'apply_patch') {
    const patch = typeof input.patch === 'string' ? input.patch : '';
    const targets = extractPatchTargets(patch);
    return targets.length > 0 ? targets : stringsFromUnknown(event.target);
  }
  return [];
}

function scratchArtifactTargetsForEvent(event: BenchmarkTraceEvent): string[] {
  if (!isEditEvent(event)) return [];
  const input = parseEventInputPreview(event.inputPreview);
  if (event.tool === 'write_file' || event.tool === 'edit_file') {
    return stringsFromUnknown(input.file_path ?? input.path ?? event.target);
  }
  if (event.tool === 'apply_patch') {
    const patch = typeof input.patch === 'string' ? input.patch : '';
    return extractPatchTargetsByOperation(patch)
      .filter((target) => target.operation !== 'Delete')
      .map((target) => target.file);
  }
  return [];
}

function detectScratchArtifactRisk(target: string): string | null {
  const normalized = normalizeTracePath(target);
  if (!normalized || isCommonNonSourceReference(normalized)) return null;
  if (/(^|\/)(?:node_modules|vendor|dist|build|coverage|\.git)(\/|$)/.test(normalized)) return null;

  const parts = normalized.split('/').filter(Boolean);
  const base = parts.at(-1) ?? normalized;
  const stem = base.replace(/\.[^.]+$/, '');
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';
  const rootOrToolingPath = parts.length === 1 || ['scripts', 'script', 'tools', 'tooling', 'dev', 'bin'].includes(first);
  const scratchDirNames = new Set([
    'scratch',
    'scratches',
    'tmp',
    'temp',
    'debug',
    'debugging',
    'probe',
    'probes',
    'repro',
    'repros',
    'reproduction',
    'reproductions',
    'playground',
    'sandbox',
  ]);

  if (/(?:~|\.tmp|\.temp|\.bak|\.orig|\.rej|\.swp)$/.test(base)) {
    return 'file name resembles a temporary patch/editor artifact';
  }
  if (scratchDirNames.has(first)) {
    return 'path is under a root scratch/probe/debug/repro directory';
  }
  if (['scripts', 'script', 'tools', 'tooling', 'dev', 'bin'].includes(first) && scratchDirNames.has(second)) {
    return 'path is under a tooling scratch/probe/debug/repro directory';
  }
  if (rootOrToolingPath
    && /^(?:scratch|tmp|temp|probe|debug|debugrepro|debug-repro|debug_repro|repro|reproduce|reproducer|minimal[-_]?repro|quick[-_]?test|test[-_]?script|playground|sandbox)(?:[._-]|$)/.test(stem)) {
    return 'file name resembles a temporary scratch/probe/debug/repro artifact';
  }
  if (parts.length === 1 && /^(?:check|try|experiment)[._-].+\.(?:js|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|kts|sh|bash|ps1|php|cs|ipynb)$/.test(base)) {
    return 'root-level script name resembles a temporary diagnostic artifact';
  }
  return null;
}

function detectTestHarnessEditRisk(target: string): string | null {
  const normalized = target.replace(/\\/g, '/').replace(/^["']|["']$/g, '').toLowerCase();
  if (!normalized) return null;
  const base = normalized.split('/').at(-1) ?? normalized;
  if (/(^|\/)(tests?|__tests__|specs?|e2e|cypress|playwright)(\/|$)/.test(normalized)) {
    return 'path is under a test/spec/e2e directory';
  }
  if (/(^|\/)(run-tests?|run_tests?|test|tests|verify|check|validate|grade|grader)\.(sh|bash|bat|py|js|ts|mjs|cjs)$/.test(normalized)) {
    return 'path resembles a benchmark verifier or grading script';
  }
  if (/^(task|instruction|instructions|problem|prompt)\.(ya?ml|toml|md|txt)$/.test(base)) {
    return 'path resembles a benchmark task or instruction artifact';
  }
  if (/(\.test|\.spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(base)
    || /^test_.*\.py$/.test(base)
    || /_test\.py$/.test(base)
    || /_test\.go$/.test(base)
    || /(test|tests)\.(java|kt|cs|rb|php)$/.test(base)
    || /_spec\.rb$/.test(base)) {
    return 'file name resembles a test/spec file';
  }
  return null;
}

function collectSourceCoverageNotes(coverage: SourceResearchCoverage, output: string): void {
  const normalized = output.replace(/\s+/g, ' ').trim();
  if (!normalized) return;
  if (/Kaggle unauthenticated fallback: competitions skipped/i.test(normalized)) {
    coverage.kaggleCompetitionsSkipped = true;
    pushUnique(coverage.coverageNotes, 'kaggle competitions skipped');
  }
  if (/Targeted benchmark coverage requested:/i.test(normalized)) {
    pushUnique(coverage.coverageNotes, 'targeted benchmark coverage requested');
  }
  const recency = normalized.match(/Recency filter requested:\s*recent_days=(\d+)/i);
  if (recency) {
    pushUniqueNumber(coverage.recentDays, Number(recency[1]));
    pushUnique(coverage.coverageNotes, `recent_days=${recency[1]}`);
  }
}

function collectSourceResearchEvidence(coverage: SourceResearchCoverage, output: string): void {
  let inSourceErrors = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^##\s+Source errors\b/i.test(line)) {
      inSourceErrors = true;
      continue;
    }
    if (/^##\s+Coverage notes\b/i.test(line)) {
      inSourceErrors = false;
      continue;
    }

    const hit = line.match(/^##\s+([^:]+):\s+(.+)$/);
    if (hit && !/^Source errors$/i.test(hit[1]) && !/^Coverage notes$/i.test(hit[1])) {
      inSourceErrors = false;
      coverage.sourceHitCount++;
      pushUnique(coverage.resultSources, normalizeResearchSourceLabel(hit[1]));
      continue;
    }

    if (inSourceErrors && /^-\s+\S+/.test(line)) {
      coverage.sourceErrorCount++;
    }

    const url = line.match(/^https?:\/\/\S+/i)?.[0];
    if (url && coverage.topUrls.length < 12) {
      pushUnique(coverage.topUrls, url.replace(/[),.;]+$/, ''));
    }
  }
}

function normalizeResearchSourceLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function buildBenchmarkLeakageRiskEvents(events: BenchmarkTraceEvent[]): BenchmarkLeakageRiskEvent[] {
  const risks: BenchmarkLeakageRiskEvent[] = [];
  for (const event of events) {
    const input = parseEventInputPreview(event.inputPreview);
    const candidates = benchmarkLeakageCandidateStrings(event, input);
    const reason = candidates
      .map((candidate) => detectBenchmarkLeakageRisk(candidate, event.tool))
      .find(Boolean);
    if (!reason) continue;
    risks.push({
      seq: event.seq,
      tool: event.tool,
      target: event.target || candidates[0] || event.tool,
      reason,
    });
  }
  return risks.slice(0, 20);
}

export function buildBenchmarkCompletionReminder(
  events: BenchmarkTraceEvent[],
  usageEvents: BenchmarkUsageEvent[] = [],
): string | null {
  const quality = buildBenchmarkTrajectoryQuality(events, buildBenchmarkUsageSummary(usageEvents));
  const blockingWarnings = quality.warnings.filter((warning) =>
    warning.includes('benchmark_context')
    || warning.includes('cost-efficiency risk')
    || warning.includes('invalid tool action')
    || warning.includes('first edit happened')
    || warning.includes('no failing reproduction')
    || warning.includes('not been followed by a visible verifier')
    || warning.includes('final edit')
    || warning.includes('lucky-pass risk')
    || warning.includes('latest verifier after editing failed')
    || warning.includes('failing verifier commands')
    || warning.includes('inconclusive verifier failure')
    || warning.includes('unprepared environment')
    || warning.includes('dependency manifest edit')
    || warning.includes('skill prompt loaded')
    || warning.includes('multiple full skill prompts')
    || warning.includes('source research was partial')
    || warning.includes('targeted source research omitted recent_days')
    || warning.includes('source research produced no parsed source hits')
    || warning.includes('source research reported')
    || warning.includes('Kaggle competition research')
    || warning.includes('task contract signals')
    || warning.includes('task contract checklist still has incomplete')
    || warning.includes('no-edit/no-op task contract')
    || warning.includes('edited target(s) lacked prior file-level localization evidence')
    || warning.includes('low context utilization')
    || warning.includes('large edit surface')
    || warning.includes('redundant tool calls')
    || warning.includes('redundant verifier reruns')
    || warning.includes('blind repair after failed verifier')
    || warning.includes('failed-verifier repair target')
    || warning.includes('post-edit regression cycle')
    || warning.includes('scratch/probe artifact')
    || warning.includes('post-edit diff/status review')
    || warning.includes('broad post-edit verifier')
    || warning.includes('CI verifier')
    || warning.includes('CI-derived')
    || warning.includes('test/harness/verifier file')
    || warning.includes('potential benchmark leakage risk'),
  );
  if (blockingWarnings.length === 0) return null;
  return [
    'Benchmark trajectory is under-evidenced. Do not provide the final answer yet.',
    '',
    ...blockingWarnings.slice(0, 4).map((warning) => `- ${warning}`),
    '',
    'Use tools to close these gaps now: run benchmark_context if it has not been used, convert visible task-contract signals into todo_write checklist items, mark completed task-contract todo items with todo_write, localize the relevant files/functions, narrow broad context gathering to candidate files/tests, reduce or explicitly justify a large edit surface, remove or justify scratch/probe artifacts, change query/target/strategy instead of repeating identical read/search calls, fix malformed JSON/schema/tool-name/permission issues before repeating invalid tool actions, inspect failures or patch before repeating identical failing verifier commands, inspect failed verifier output or referenced files before patching again after a failure, inspect parsed source failure files before patching a different target, verify skill domain/version fit against local repo evidence and avoid loading multiple generic skill prompts, close the highest-value evidence gap before spending more turns when cost-efficiency risk is high, Read or search the target file before patching benchmark code, run the narrowest visible reproduction/verifier, run project-native setup/restore/install when verifier failures look like missing dependencies, toolchains, or build artifacts, run the package-manager install/update/lockfile step after dependency manifest edits, inspect full logs or rerun with a narrower/longer verifier when timeout/truncation makes evidence inconclusive, fix any latest verifier failure before relying on earlier passing validation, explain or close any post-edit regression cycle before treating final validation as clean, run a verifier after the final edit, rerun the final narrow verifier or run broad/CI validation to reduce lucky-pass risk, inspect git diff or git status after validated edits and again after the final edit, run the broad harness/build/test command after narrow validation when feasible, rerun matching CI-derived test/build/lint commands discovered by benchmark_context when feasible, avoid edit tools when a no-edit/no-op contract is verified, revert or justify test/harness edits unless the task explicitly asks for them, complete targeted research_sources coverage when relevant, or make a concrete evidence-based case that no verifier/source exists for this task.',
  ].join('\n');
}

export function writeBenchmarkTrace(input: BenchmarkTraceWriteInput): BenchmarkTraceWriteResult | null {
  if (input.mode !== 'benchmark' && process.env.VENTIPUS_BENCHMARK_TRACE !== '1') return null;

  const summary = buildBenchmarkTraceSummary(input);
  const baseDir = process.env.VENTIPUS_BENCHMARK_TRACE_DIR?.trim()
    || join(getConfigDir(), 'benchmark-runs');
  const stamp = summary.startedAt.replace(/[:.]/g, '-');
  const safeSession = input.sessionId.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 40) || 'session';
  const dir = join(baseDir, `${stamp}-${safeSession}`);
  mkdirSync(dir, { recursive: true });

  const artifactResult = collectBenchmarkTraceArtifacts(input.cwd, dir);
  summary.worktreeChangedFiles = artifactResult.changedFiles;
  summary.artifacts = artifactResult.artifacts;
  summary.experienceCard.changedFiles = uniqueStrings([
    ...summary.experienceCard.changedFiles,
    ...summary.worktreeChangedFiles,
  ])
    .map((file) => truncate(redactTraceText(file), 160))
    .slice(0, 20);

  const summaryPath = join(dir, 'summary.json');
  const jsonlPath = join(dir, 'trace.jsonl');
  const leaderboardDraftPath = join(dir, 'open-agent-leaderboard-draft.json');
  const leaderboardDraftText = JSON.stringify(summary.openAgentLeaderboardDraft, null, 2);
  writeFileSync(leaderboardDraftPath, leaderboardDraftText, 'utf-8');
  summary.artifacts.push({
    kind: 'open-agent-leaderboard-draft',
    path: leaderboardDraftPath,
    contentType: 'application/json',
    description: 'Draft Open Agent Leaderboard-style row from ventipus trace metadata; not an official benchmark result.',
    sizeBytes: Buffer.byteLength(leaderboardDraftText),
  });
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  writeFileSync(jsonlPath, summary.events.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf-8');
  return { dir, summaryPath, jsonlPath };
}

function collectBenchmarkTraceArtifacts(cwd: string, dir: string): { artifacts: BenchmarkTraceArtifact[]; changedFiles: string[] } {
  const artifacts: BenchmarkTraceArtifact[] = [];
  const changedFiles: string[] = [];
  if (!isGitWorktree(cwd)) return { artifacts, changedFiles };

  const diff = buildBenchmarkWorktreePatch(cwd);
  if (diff.trim()) {
    const patchPath = join(dir, 'worktree.patch');
    const redacted = redactTraceText(diff);
    writeFileSync(patchPath, redacted, 'utf-8');
    artifacts.push({
      kind: 'patch',
      path: patchPath,
      contentType: 'text/x-diff',
      description: 'Redacted git diff from the benchmark worktree after the run.',
      sizeBytes: Buffer.byteLength(redacted),
    });
  }

  const status = runGit(cwd, ['status', '--short'], 512 * 1024, 5_000);
  if (status.trim()) {
    const statusPath = join(dir, 'git-status.txt');
    const redacted = redactTraceText(status);
    writeFileSync(statusPath, redacted, 'utf-8');
    artifacts.push({
      kind: 'git-status',
      path: statusPath,
      contentType: 'text/plain',
      description: 'Redacted git status from the benchmark worktree after the run.',
      sizeBytes: Buffer.byteLength(redacted),
    });
    changedFiles.push(...parseGitStatusFiles(redacted));
  }

  return {
    artifacts,
    changedFiles: Array.from(new Set(changedFiles)).slice(0, 100),
  };
}

function isGitWorktree(cwd: string): boolean {
  return runGit(cwd, ['rev-parse', '--is-inside-work-tree'], 64 * 1024, 5_000).trim() === 'true';
}

function buildBenchmarkWorktreePatch(cwd: string): string {
  const parts = [
    runGit(cwd, ['diff', '--binary', '--no-ext-diff'], 20 * 1024 * 1024, 10_000),
    runGit(cwd, ['diff', '--cached', '--binary', '--no-ext-diff'], 20 * 1024 * 1024, 10_000),
    ...collectUntrackedFileDiffs(cwd),
  ].map((part) => part.trim()).filter(Boolean);
  return parts.join('\n\n') + (parts.length > 0 ? '\n' : '');
}

function collectUntrackedFileDiffs(cwd: string): string[] {
  const raw = runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], 1024 * 1024, 5_000);
  const files = raw.split('\0').map((file) => file.trim()).filter(Boolean).slice(0, 80);
  const diffs: string[] = [];
  for (const file of files) {
    const diff = runGitWithOptions(cwd, ['diff', '--no-index', '--binary', '--no-ext-diff', '--', '/dev/null', file], 5 * 1024 * 1024, 5_000, true);
    if (diff.trim()) diffs.push(diff);
  }
  return diffs;
}

function runGit(cwd: string, args: string[], maxBuffer: number, timeout: number): string {
  return runGitWithOptions(cwd, args, maxBuffer, timeout, false);
}

function runGitWithOptions(cwd: string, args: string[], maxBuffer: number, timeout: number, allowDiffExit: boolean): string {
  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout,
      maxBuffer,
    });
    if (result.error) return '';
    if (result.status !== 0 && !(allowDiffExit && result.status === 1)) return '';
    return String(result.stdout ?? '');
  } catch {
    return '';
  }
}

function parseGitStatusFiles(status: string): string[] {
  const files: string[] = [];
  for (const line of status.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const raw = line.slice(3).trim();
    if (!raw) continue;
    const renamed = raw.includes(' -> ') ? raw.split(' -> ').at(-1) ?? raw : raw;
    files.push(renamed.replace(/^"|"$/g, ''));
  }
  return files;
}

function summarizeTarget(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'bash':
      return `$ ${String(input.command ?? '')}`;
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return String(input.file_path ?? input.path ?? '');
    case 'apply_patch':
      return extractPatchTargets(String(input.patch ?? '')).join(', ') || 'patch';
    case 'grep':
      return `/${String(input.pattern ?? '')}/${input.path ? ` in ${String(input.path)}` : ''}`;
    case 'glob':
      return String(input.pattern ?? '');
    case 'list_dir':
      return String(input.path || '.');
    case 'web_fetch':
      return String(input.url ?? '');
    case 'web_search':
    case 'research_sources':
      return String(input.query ?? input.q ?? '');
    default:
      return truncate(JSON.stringify(input), 160);
  }
}

function isVerificationTool(tool: string, input: Record<string, unknown>): boolean {
  if (tool !== 'bash') return false;
  const command = String(input.command ?? '');
  return /\b((?:npm|pnpm|yarn)\s+(?:run\s+)?(test|build|lint|check)|bun\s+(test|run)|vitest|jest|pytest|ruff|mypy|tsc|cargo\s+(test|build|check)|go\s+test|dotnet\s+test|gradle\s+test|gradlew\s+test|mvn\s+test|mvnw\s+test|make\s+(test|check|verify)|tb\s+run|harbor\s+run)\b/i
    .test(command)
    || /(?:^|[\s;&|])\.\/(?:gradlew|mvnw)\s+test\b/i.test(command);
}

function isDiffReviewEvent(event: BenchmarkTraceEvent): boolean {
  if (event.tool !== 'bash') return false;
  const input = parseEventInputPreview(event.inputPreview);
  const command = String(input.command ?? event.target ?? '').replace(/\s+/g, ' ').trim();
  return /\bgit(?:\s+-[A-Za-z](?:\s+\S+)?|\s+--[A-Za-z0-9-]+(?:=\S+)?)*\s+(?:diff|status)\b/i.test(command);
}

function extractCiVerifierCommandsFromContext(events: BenchmarkTraceEvent[]): string[] {
  const commands: string[] = [];
  for (const event of events) {
    if (event.tool !== 'benchmark_context') continue;
    for (const command of extractCiVerifierCommandsFromOutput(event.outputPreview)) {
      const normalized = normalizeCiVerifierCommand(command);
      if (!normalized) continue;
      if (!commands.some((existing) => normalizeCiVerifierCommand(existing) === normalized)) {
        commands.push(truncate(redactTraceText(command), 180));
      }
    }
  }
  return commands.slice(0, 20);
}

function extractCiVerifierCommandsFromOutput(output: string): string[] {
  const commands: string[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, '');
    if (!line) continue;

    const verifier = line.match(/\bci verifier:\s+(.+)$/i);
    if (verifier) {
      const payload = verifier[1].trim();
      const withLocation = payload.match(/^(.+?):\d+:\s+(.+)$/);
      commands.push((withLocation ? withLocation[2] : payload).trim());
      continue;
    }

    const candidates = line.match(/\bci verifier candidates:\s+(.+)$/i);
    if (candidates) {
      for (const command of candidates[1].split(/\s+\|\s+/)) {
        if (command.trim()) commands.push(command.trim());
      }
    }
  }
  return commands;
}

function isCiVerificationEvent(event: BenchmarkTraceEvent, ciCommands: string[]): boolean {
  if (!event.verification || event.tool !== 'bash') return false;
  const command = normalizeCiVerifierCommand(verifierCommandForEvent(event));
  if (!command) return false;
  return ciCommands.some((ciCommand) => ciVerifierCommandsMatch(command, normalizeCiVerifierCommand(ciCommand)));
}

function ciVerifierCommandsMatch(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  return actual.endsWith(` ${expected}`)
    && /^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/.test(actual);
}

function normalizeCiVerifierCommand(command: string): string {
  let normalized = normalizeVerifierCommand(command.replace(/^\$\s*/, ''));
  normalized = normalized.replace(/^(?:env\s+)?(?:[a-z_][a-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/i, '');
  normalized = normalized.replace(/\b(npm|pnpm|yarn)\s+run\s+(test|build|lint|check|typecheck|verify)\b/gi, '$1 $2');
  return normalized.trim();
}

function isBroadVerificationEvent(event: BenchmarkTraceEvent): boolean {
  if (!event.verification || event.tool !== 'bash') return false;
  const input = parseEventInputPreview(event.inputPreview);
  const command = String(input.command ?? event.target ?? '').replace(/\s+/g, ' ').trim();
  return /(?:^|[;&|]\s*)(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|build|lint|check)\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)bun\s+(?:test|run\s+(?:test|build|lint|check))\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)(?:npx\s+)?(?:vitest\s+run|jest|pytest|python\s+-m\s+pytest)\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)(?:ruff\s+check|mypy|tsc)\s+\.?\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)cargo\s+(?:test|build|check)(?:\s+--workspace)?\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)go\s+test(?:\s+\.\/\.\.\.)?\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)dotnet\s+test\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)(?:gradle|gradlew|\.\/gradlew)\s+test\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)(?:mvn|mvnw|\.\/mvnw)\s+test\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)make\s+(?:test|check|verify)\s*(?:$|[;&|])/i.test(command)
    || /(?:^|[;&|]\s*)(?:tb|harbor)\s+run\b/i.test(command);
}

function classifyEnvironmentSetupCommand(command: string): string | null {
  const normalized = command.replace(/\s+/g, ' ').trim();
  const checks: Array<[RegExp, string]> = [
    [/(?:^|[;&|]\s*)npm\s+(?:ci|install|i)\b/i, 'node package install'],
    [/(?:^|[;&|]\s*)pnpm\s+(?:install|i)\b/i, 'node package install'],
    [/(?:^|[;&|]\s*)yarn\s+(?:install|--immutable|--frozen-lockfile)\b/i, 'node package install'],
    [/(?:^|[;&|]\s*)bun\s+install\b/i, 'node package install'],
    [/(?:^|[;&|]\s*)(?:python(?:3)?\s+-m\s+)?pip(?:3)?\s+install\b/i, 'python package install'],
    [/(?:^|[;&|]\s*)uv\s+(?:sync|pip\s+(?:install|sync)|venv)\b/i, 'python package install'],
    [/(?:^|[;&|]\s*)poetry\s+install\b/i, 'python package install'],
    [/(?:^|[;&|]\s*)pipenv\s+install\b/i, 'python package install'],
    [/(?:^|[;&|]\s*)conda\s+(?:env\s+)?(?:create|install)\b/i, 'python environment install'],
    [/(?:^|[;&|]\s*)cargo\s+fetch\b/i, 'rust dependency fetch'],
    [/(?:^|[;&|]\s*)go\s+mod\s+(?:download|tidy)\b/i, 'go module setup'],
    [/(?:^|[;&|]\s*)(?:mvn|mvnw|\.\/mvnw)\s+(?:dependency:resolve|dependency:go-offline)\b/i, 'maven dependency resolve'],
    [/(?:^|[;&|]\s*)(?:gradle|gradlew|\.\/gradlew)\s+(?:dependencies|buildEnvironment)\b/i, 'gradle dependency resolve'],
    [/(?:^|[;&|]\s*)dotnet\s+restore\b/i, 'dotnet restore'],
    [/(?:^|[;&|]\s*)composer\s+install\b/i, 'php dependency install'],
    [/(?:^|[;&|]\s*)bundle\s+install\b/i, 'ruby dependency install'],
    [/(?:^|[;&|]\s*)npx\s+playwright\s+install\b/i, 'browser dependency install'],
    [/(?:^|[;&|]\s*)corepack\s+enable\b/i, 'node package-manager setup'],
    [/(?:^|[;&|]\s*)make\s+(?:setup|bootstrap|deps|dependencies|install)\b/i, 'project setup target'],
    [/(?:^|[;&|]\s*)(?:\.\/)?setup\.(?:sh|bash|ps1|bat)\b/i, 'project setup script'],
    [/(?:^|[;&|]\s*)docker\s+compose\s+(?:build|up)\b/i, 'container setup'],
    [/(?:^|[;&|]\s*)docker\s+build\b/i, 'container setup'],
  ];
  return checks.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

function isDependencySetupEvent(event: BenchmarkTraceEvent): boolean {
  if (event.tool !== 'bash') return false;
  return isDependencySetupCommand(verifierCommandForEvent(event));
}

function isDependencySetupCommand(command: string): boolean {
  const normalized = command.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return [
    /(?:^|[;&|]\s*)npm\s+(?:ci|install|i|add|update|upgrade|dedupe|import|audit\s+fix)\b/i,
    /(?:^|[;&|]\s*)pnpm\s+(?:install|i|add|update|upgrade|dedupe|import|audit\s+fix)\b/i,
    /(?:^|[;&|]\s*)yarn\s+(?:install|add|upgrade|up|dedupe|import|--immutable|--frozen-lockfile)\b/i,
    /(?:^|[;&|]\s*)bun\s+(?:install|add|update)\b/i,
    /(?:^|[;&|]\s*)(?:python(?:3)?\s+-m\s+)?pip(?:3)?\s+(?:install|sync)\b/i,
    /(?:^|[;&|]\s*)uv\s+(?:sync|lock|add|pip\s+(?:install|sync))\b/i,
    /(?:^|[;&|]\s*)poetry\s+(?:install|update|lock|add)\b/i,
    /(?:^|[;&|]\s*)pipenv\s+(?:install|lock|update)\b/i,
    /(?:^|[;&|]\s*)conda\s+(?:env\s+)?(?:create|update|install)\b/i,
    /(?:^|[;&|]\s*)cargo\s+(?:fetch|update|generate-lockfile)\b/i,
    /(?:^|[;&|]\s*)go\s+(?:get|mod\s+(?:download|tidy|vendor|verify))\b/i,
    /(?:^|[;&|]\s*)(?:mvn|mvnw|\.\/mvnw)\s+(?:dependency:resolve|dependency:go-offline|versions:[A-Za-z0-9_.:-]+)\b/i,
    /(?:^|[;&|]\s*)(?:gradle|gradlew|\.\/gradlew)\s+(?:dependencies|buildEnvironment|--refresh-dependencies)\b/i,
    /(?:^|[;&|]\s*)dotnet\s+(?:restore|add\s+package|remove\s+package)\b/i,
    /(?:^|[;&|]\s*)composer\s+(?:install|update|require|remove)\b/i,
    /(?:^|[;&|]\s*)bundle\s+(?:install|update|add)\b/i,
    /(?:^|[;&|]\s*)swift\s+package\s+(?:resolve|update)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function classifyDependencyFileTarget(target: string): { ecosystem: string; kind: 'manifest' | 'lockfile' } | null {
  const normalized = normalizeTracePath(target);
  if (!normalized) return null;
  const base = normalized.split('/').at(-1) ?? normalized;

  const manifestChecks: Array<[RegExp, string]> = [
    [/^package\.json$/i, 'node'],
    [/^(?:pyproject\.toml|setup\.py|setup\.cfg|pipfile|environment\.ya?ml|requirements(?:[-_.a-z0-9]*)?\.txt)$/i, 'python'],
    [/^cargo\.toml$/i, 'rust'],
    [/^go\.mod$/i, 'go'],
    [/^(?:pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties)$/i, 'jvm'],
    [/^(?:[^/]+\.(?:csproj|fsproj|vbproj)|directory\.packages\.props|global\.json)$/i, 'dotnet'],
    [/^composer\.json$/i, 'php'],
    [/^(?:gemfile|.+\.gemspec)$/i, 'ruby'],
    [/^package\.swift$/i, 'swift'],
    [/^(?:description|flake\.nix)$/i, 'data-science'],
  ];
  const lockfileChecks: Array<[RegExp, string]> = [
    [/^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|bun\.lock)$/i, 'node'],
    [/^(?:poetry\.lock|uv\.lock|pipfile\.lock|conda-lock\.ya?ml|requirements\.lock)$/i, 'python'],
    [/^cargo\.lock$/i, 'rust'],
    [/^go\.sum$/i, 'go'],
    [/^(?:gradle\.lockfile|verification-metadata\.xml)$/i, 'jvm'],
    [/^packages\.lock\.json$/i, 'dotnet'],
    [/^composer\.lock$/i, 'php'],
    [/^gemfile\.lock$/i, 'ruby'],
    [/^package\.resolved$/i, 'swift'],
    [/^(?:renv\.lock|flake\.lock)$/i, 'data-science'],
  ];

  const manifest = manifestChecks.find(([pattern]) => pattern.test(base));
  if (manifest) return { ecosystem: manifest[1], kind: 'manifest' };
  const lockfile = lockfileChecks.find(([pattern]) => pattern.test(base));
  if (lockfile) return { ecosystem: lockfile[1], kind: 'lockfile' };
  return null;
}

function extractEnvironmentSetupFailure(event: BenchmarkTraceEvent): BenchmarkEnvironmentSetupFailureEvent | null {
  if (!event.verification || event.status !== 'error') return null;
  const command = verifierCommandForEvent(event);
  const text = `${command}\n${event.outputPreview}`.replace(/\r/g, '');
  const failure = classifyEnvironmentSetupFailure(text);
  if (!failure) return null;
  return {
    seq: event.seq,
    command: truncate(redactTraceText(command), 180),
    reason: failure.reason,
    evidence: truncate(redactTraceText(failure.evidence), 240),
  };
}

function classifyEnvironmentSetupFailure(text: string): { reason: string; evidence: string } | null {
  const commandUnavailable = matchingEvidenceLine(text, [
    /\b(?:npm|pnpm|yarn|bun|node|python|python3|pip|pip3|pytest|vitest|jest|tsc|cargo|go|dotnet|mvn|mvnw|gradle|gradlew|make|ruff|mypy|tb|harbor)\b(?:: command not found|: not found| is not recognized as an internal or external command| was not found)/i,
    /\b(?:spawn|exec):?\s+(?:npm|pnpm|yarn|bun|node|python|python3|pip|pip3|pytest|vitest|jest|tsc|cargo|go|dotnet|mvn|gradle|make)\s+ENOENT\b/i,
  ]);
  if (commandUnavailable) return { reason: 'toolchain command unavailable', evidence: commandUnavailable };

  const jsMissing = matchingEvidenceLine(text, [
    /\b(?:Cannot find module|Cannot find package|Error \[ERR_MODULE_NOT_FOUND\]|ERR_MODULE_NOT_FOUND|Module not found|Failed to resolve import|Could not resolve)\b/i,
    /\b(?:node_modules|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)\b.*\b(?:not found|missing|ENOENT)\b/i,
  ]);
  if (jsMissing && isLikelyDependencyOrBuildArtifactMissing(jsMissing, text)) {
    return { reason: 'javascript dependency or build artifact missing', evidence: jsMissing };
  }

  const pythonMissing = matchingEvidenceLine(text, [
    /\bModuleNotFoundError:\s+No module named\b/i,
    /\bImportError:\s+No module named\b/i,
    /\bNo module named pytest\b/i,
  ]);
  if (pythonMissing) return { reason: 'python dependency missing', evidence: pythonMissing };

  const goMissing = matchingEvidenceLine(text, [
    /\bno required module provides package\b/i,
    /\bmissing go\.sum entry\b/i,
    /\bupdates to go\.mod needed\b/i,
    /\bcannot find module providing package\b/i,
  ]);
  if (goMissing) return { reason: 'go module setup missing', evidence: goMissing };

  const dotnetMissing = matchingEvidenceLine(text, [
    /\bNETSDK1004\b.*project\.assets\.json.*\brestore\b/i,
    /\bAssets file .*project\.assets\.json.* not found\b/i,
    /\berror NU\d+\b/i,
  ]);
  if (dotnetMissing) return { reason: 'dotnet restore or NuGet dependency missing', evidence: dotnetMissing };

  const jvmMissing = matchingEvidenceLine(text, [
    /\bCould not resolve (?:all files|dependencies|artifact)\b/i,
    /\bCould not find artifact\b/i,
    /\bFailed to collect dependencies\b/i,
    /\bCould not determine java version\b/i,
  ]);
  if (jvmMissing) return { reason: 'jvm dependency or toolchain setup missing', evidence: jvmMissing };

  const rustMissing = matchingEvidenceLine(text, [
    /\bfailed to select a version\b/i,
    /\bno matching package named\b/i,
    /\bcould not find .* in registry\b/i,
    /\bfailed to download\b/i,
  ]);
  if (rustMissing) return { reason: 'rust dependency setup missing', evidence: rustMissing };

  const browserMissing = matchingEvidenceLine(text, [
    /\bExecutable doesn't exist at\b.*\bplaywright\b/i,
    /\bLooks like Playwright\b.*\binstall\b/i,
    /\bPlease run\b.*\bplaywright install\b/i,
  ]);
  if (browserMissing) return { reason: 'browser runtime dependency missing', evidence: browserMissing };

  return null;
}

function matchingEvidenceLine(text: string, patterns: RegExp[]): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (patterns.some((pattern) => pattern.test(line))) return line.replace(/\s+/g, ' ');
  }
  return null;
}

function isLikelyDependencyOrBuildArtifactMissing(line: string, fullText: string): boolean {
  const specifier = line.match(/(?:Cannot find module|Cannot find package|Failed to resolve import|Could not resolve)\s+['"]([^'"]+)['"]/i)?.[1];
  if (specifier && !specifier.startsWith('.') && !specifier.startsWith('/')) return true;
  return /\b(?:node_modules|ERR_MODULE_NOT_FOUND|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|dist\/|build\/)\b/i.test(`${line}\n${fullText}`);
}

function firstSeq(events: BenchmarkTraceEvent[], predicate: (event: BenchmarkTraceEvent) => boolean): number | null {
  const found = events.find(predicate);
  return found ? found.seq : null;
}

function lastSeq(events: BenchmarkTraceEvent[], predicate: (event: BenchmarkTraceEvent) => boolean): number | null {
  const found = [...events].reverse().find(predicate);
  return found ? found.seq : null;
}

function isInspectionEvent(event: BenchmarkTraceEvent): boolean {
  return ['read_file', 'grep', 'glob', 'list_dir', 'benchmark_context', 'memory_search', 'memory_recall'].includes(event.tool);
}

function isEditEvent(event: BenchmarkTraceEvent): boolean {
  return ['write_file', 'edit_file', 'apply_patch'].includes(event.tool);
}

function yn(value: boolean): string {
  return value ? 'yes' : 'no';
}

function tri(value: boolean | null): string {
  if (value === null) return 'n/a';
  return value ? 'yes' : 'no';
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(2)}%`;
}

function statusLabel(value: 'ok' | 'error' | null): string {
  return value ?? 'n/a';
}

function safeTokenCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}

function parseEventInputPreview(inputPreview: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(inputPreview);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function pushUnique(target: string[], value: string): void {
  const clean = value.trim().toLowerCase();
  if (clean && !target.includes(clean)) target.push(clean);
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (clean && !out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      out.push(clean);
    }
  }
  return out;
}

function pushUniqueNumber(values: number[], value: number): void {
  if (!Number.isFinite(value)) return;
  if (!values.includes(value)) values.push(value);
}

function formatSourceCoverage(coverage: SourceResearchCoverage): string {
  if (coverage.callCount === 0) return 'none';
  const github = coverage.github
    ? `github:${coverage.githubKinds.join('|') || 'default'}`
    : 'github:no';
  const huggingFace = coverage.huggingface
    ? `huggingface:${coverage.huggingFaceKinds.join('|') || 'default'}`
    : 'huggingface:no';
  const kaggle = coverage.kaggle
    ? `kaggle:${coverage.kaggleKinds.join('|') || 'default'}`
    : 'kaggle:no';
  return [
    `${coverage.callCount} call${coverage.callCount === 1 ? '' : 's'}`,
    `hits:${coverage.sourceHitCount}`,
    `errors:${coverage.sourceErrorCount}`,
    `arxiv:${coverage.arxiv ? 'yes' : 'no'}`,
    github,
    huggingFace,
    kaggle,
    coverage.recentDays.length ? `recent_days:${coverage.recentDays.join('|')}` : 'recent_days:none',
    coverage.resultSources.length ? `result_sources:${coverage.resultSources.slice(0, 8).join('|')}` : null,
    coverage.kaggleCompetitionsSkipped ? 'kaggle_competitions:skipped' : null,
    coverage.coverageNotes.length ? `notes:${coverage.coverageNotes.join('|')}` : null,
    `fresh_targeted:${coverage.freshTargetedCoverage ? 'yes' : 'no'}`,
    `targeted:${coverage.completeTargetedCoverage ? 'yes' : 'no'}`,
  ].filter(Boolean).join(', ');
}

function extractVerifierOutputSignal(event: BenchmarkTraceEvent): BenchmarkVerifierOutputSignal | null {
  if (!event.verification) return null;
  const raw = event.outputPreview;
  const counts = parseVerifierCounts(raw);
  if (!counts) return null;
  return {
    seq: event.seq,
    command: event.target.replace(/^\$ /, '').trim(),
    status: event.status,
    ...counts,
    raw: truncate(raw.replace(/\s+/g, ' ').trim(), 240),
  };
}

function extractVerifierFailureSignature(event: BenchmarkTraceEvent): BenchmarkVerifierFailureSignature | null {
  if (!event.verification || event.status !== 'error') return null;
  const text = event.outputPreview.replace(/\r/g, '');
  const counts = parseVerifierCounts(text);
  const command = event.target.replace(/^\$ /, '').trim();
  const tests = extractFailedTestNames(text);
  const files = extractFileReferences(text).slice(0, 8);
  const errors = extractVerifierErrorSummaries(text);
  const raw = compactVerifierFailureRaw(text);
  if (tests.length === 0 && files.length === 0 && errors.length === 0 && !raw) return null;
  return {
    seq: event.seq,
    command,
    framework: inferVerifierFrameworkFromCommand(command, counts?.framework),
    tests,
    files,
    errors,
    raw,
  };
}

function extractVerifierIncompleteRun(event: BenchmarkTraceEvent): BenchmarkVerifierIncompleteRun | null {
  if (!event.verification) return null;
  const text = event.outputPreview;
  const status = parseBashStatusMarker(text);
  const timedOut = status.timedOut ?? /\[command timed out after \d+ms/i.test(text);
  const truncated = status.truncated ?? /\[output truncated - omitted/i.test(text);
  if (!timedOut && !truncated) return null;
  const conclusiveFailureEvidence = event.status === 'error' && verifierHasParsedFailureEvidence(event);
  const reason = timedOut
    ? conclusiveFailureEvidence
      ? 'verifier timed out after parsed failure evidence was visible'
      : 'verifier timed out without parsed failure evidence'
    : conclusiveFailureEvidence
      ? 'verifier output was truncated but parsed failure evidence was visible'
      : 'verifier output was truncated without parsed failure evidence';
  return {
    seq: event.seq,
    command: event.target.replace(/^\$ /, '').trim(),
    timedOut,
    truncated,
    omittedLines: status.omittedLines,
    omittedChars: status.omittedChars,
    fullLog: status.fullLog,
    conclusiveFailureEvidence,
    reason,
  };
}

function parseBashStatusMarker(text: string): {
  timedOut?: boolean;
  truncated?: boolean;
  omittedLines?: number;
  omittedChars?: number;
  fullLog?: string;
} {
  const marker = text.match(/\[bash status:\s*([^\]]+)\]/i)?.[1];
  if (!marker) return {};
  return {
    timedOut: valueForMarkerBoolean(marker, 'timedOut'),
    truncated: valueForMarkerBoolean(marker, 'truncated'),
    omittedLines: valueForMarkerNumber(marker, 'omittedLines'),
    omittedChars: valueForMarkerNumber(marker, 'omittedChars'),
    fullLog: marker.match(/\bfullLog=([^\s\]]+)/i)?.[1],
  };
}

function valueForMarkerBoolean(marker: string, key: string): boolean | undefined {
  const value = marker.match(new RegExp(`\\b${key}=(true|false)\\b`, 'i'))?.[1];
  return value == null ? undefined : value.toLowerCase() === 'true';
}

function valueForMarkerNumber(marker: string, key: string): number | undefined {
  const value = marker.match(new RegExp(`\\b${key}=(\\d+)\\b`, 'i'))?.[1];
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function verifierHasParsedFailureEvidence(event: BenchmarkTraceEvent): boolean {
  const counts = extractVerifierOutputSignal(event);
  if (counts && ((counts.failed ?? 0) > 0 || (counts.errors ?? 0) > 0)) return true;
  const signature = extractVerifierFailureSignature(event);
  return !!signature && (signature.tests.length > 0 || signature.errors.length > 0);
}

function isConclusiveFailedVerification(event: BenchmarkTraceEvent): boolean {
  if (!event.verification || event.status !== 'error') return false;
  const incomplete = extractVerifierIncompleteRun(event);
  return !incomplete || incomplete.conclusiveFailureEvidence;
}

function parseVerifierCounts(output: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const text = output.replace(/\r/g, '');
  return parseVitestCounts(text)
    ?? parseJestCounts(text)
    ?? parseCargoCounts(text)
    ?? parseGoTestCounts(text)
    ?? parseDotnetCounts(text)
    ?? parseMavenCounts(text)
    ?? parseGradleCounts(text)
    ?? parseGenericTestCounts(text)
    ?? parsePytestCounts(text)
    ?? null;
}

function parseVitestCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const line = text.match(/^\s*Tests\s+(.+)$/im)?.[1];
  if (!line) return null;
  const counts = parseCountWords(line);
  const total = numberFromMatch(line.match(/\((\d+)\)/));
  if (counts.passed == null && counts.failed == null && counts.skipped == null) return null;
  return { framework: 'vitest', ...counts, total: total ?? sumCounts(counts) };
}

function parseJestCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const line = text.match(/^\s*Tests:\s+(.+)$/im)?.[1];
  if (!line) return null;
  const counts = parseCountWords(line);
  const total = countForWord(line, 'total');
  if (counts.passed == null && counts.failed == null && counts.skipped == null) return null;
  return { framework: 'jest', ...counts, total: total ?? sumCounts(counts) };
}

function parsePytestCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const summary = text.match(/=+\s*([^=\n]*(?:passed|failed|error|errors|skipped)[^=\n]*)\s*=+/i)?.[1]
    ?? text.match(/((?:\d+\s+(?:passed|failed|errors?|skipped|xfailed|xpassed|deselected)[,\s]*)+)/i)?.[1];
  if (!summary) return null;
  const counts = parseCountWords(summary);
  if (counts.passed == null && counts.failed == null && counts.skipped == null && counts.errors == null) return null;
  return { framework: 'pytest', ...counts, total: sumCounts(counts) };
}

function parseCargoCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const line = text.match(/test result:\s+([^\n]+)/i)?.[1];
  if (!line) return null;
  const counts = parseCountWords(line);
  if (counts.passed == null && counts.failed == null && counts.skipped == null) return null;
  return { framework: 'cargo', ...counts, total: sumCounts(counts) };
}

function parseGoTestCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const passedTests = countMatchingLines(text, /^\s*---\s+PASS:/gm);
  const failedTests = countMatchingLines(text, /^\s*---\s+FAIL:/gm);
  const skippedTests = countMatchingLines(text, /^\s*---\s+SKIP:/gm);
  if (passedTests > 0 || failedTests > 0 || skippedTests > 0) {
    const counts = normalizeCounts({
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
    });
    return { framework: 'go', ...counts, total: sumCounts(counts) };
  }

  const okPackages = countMatchingLines(text, /^ok\s+\S+/gm);
  const failedPackages = countMatchingLines(text, /^FAIL\s+\S+/gm);
  const skippedPackages = countMatchingLines(text, /^\?\s+\S+\s+\[no test files\]/gm);
  if (okPackages === 0 && failedPackages === 0 && skippedPackages === 0) return null;
  const counts = normalizeCounts({
    passed: okPackages,
    failed: failedPackages,
    skipped: skippedPackages,
  });
  return { framework: 'go', ...counts, total: sumCounts(counts) };
}

function parseDotnetCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const line = text.match(/^\s*(?:Passed|Failed)!\s+-\s+(.+)$/im)?.[1]
    ?? text.match(/^\s*Total tests:\s+(.+)$/im)?.[1];
  if (!line) return null;
  const failed = valueAfterLabel(line, 'Failed');
  const passed = valueAfterLabel(line, 'Passed');
  const skipped = valueAfterLabel(line, 'Skipped');
  const total = valueAfterLabel(line, 'Total');
  const counts = normalizeCounts({ passed, failed, skipped });
  if (sumCounts(counts) == null && total == null) return null;
  return { framework: 'dotnet', ...counts, total: total ?? sumCounts(counts) };
}

function parseMavenCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const matches = [...text.matchAll(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/gi)];
  if (matches.length === 0) return null;
  let total = 0;
  let failed = 0;
  let errors = 0;
  let skipped = 0;
  for (const match of matches) {
    total += Number(match[1]);
    failed += Number(match[2]);
    errors += Number(match[3]);
    skipped += Number(match[4]);
  }
  const passed = Math.max(0, total - failed - errors - skipped);
  return {
    framework: 'maven',
    ...normalizeCounts({ passed, failed, errors, skipped }),
    total,
  };
}

function parseGradleCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  const line = text.match(/(\d+)\s+tests?\s+completed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/i);
  if (!line) return null;
  const total = Number(line[1]);
  const failed = line[2] ? Number(line[2]) : 0;
  const skipped = line[3] ? Number(line[3]) : 0;
  const passed = Math.max(0, total - failed - skipped);
  return {
    framework: 'gradle',
    ...normalizeCounts({ passed, failed, skipped }),
    total,
  };
}

function parseGenericTestCounts(text: string): Omit<BenchmarkVerifierOutputSignal, 'seq' | 'command' | 'status' | 'raw'> | null {
  if (!/\b(tests?|specs?|examples?)\b/i.test(text)) return null;
  const counts = parseCountWords(text);
  const total = countForWord(text, 'total') ?? valueAfterLabel(text, 'Total');
  if (counts.passed == null && counts.failed == null && counts.skipped == null && counts.errors == null) return null;
  return { framework: 'generic', ...counts, total: total ?? sumCounts(counts) };
}

function parseCountWords(text: string): Pick<BenchmarkVerifierOutputSignal, 'passed' | 'failed' | 'skipped' | 'errors'> {
  return {
    passed: countForWord(text, 'passed') ?? countForWord(text, 'passing'),
    failed: countForWord(text, 'failed') ?? countForWord(text, 'failing'),
    skipped: countForWord(text, 'skipped') ?? countForWord(text, 'ignored'),
    errors: countForWord(text, 'error') ?? countForWord(text, 'errors'),
  };
}

function countForWord(text: string, word: string): number | undefined {
  const re = new RegExp(`(\\d+)\\s+${word}\\b`, 'i');
  return numberFromMatch(text.match(re));
}

function numberFromMatch(match: RegExpMatchArray | null): number | undefined {
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function valueAfterLabel(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return numberFromMatch(text.match(new RegExp(`${escaped}:\\s*(\\d+)`, 'i')));
}

function countMatchingLines(text: string, re: RegExp): number {
  return [...text.matchAll(re)].length;
}

function normalizeCounts(
  counts: Pick<BenchmarkVerifierOutputSignal, 'passed' | 'failed' | 'skipped' | 'errors'>,
): Pick<BenchmarkVerifierOutputSignal, 'passed' | 'failed' | 'skipped' | 'errors'> {
  return Object.fromEntries(
    Object.entries(counts).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)),
  ) as Pick<BenchmarkVerifierOutputSignal, 'passed' | 'failed' | 'skipped' | 'errors'>;
}

function sumCounts(counts: Pick<BenchmarkVerifierOutputSignal, 'passed' | 'failed' | 'skipped' | 'errors'>): number | undefined {
  const values = [counts.passed, counts.failed, counts.skipped, counts.errors].filter((n): n is number => typeof n === 'number');
  if (values.length === 0) return undefined;
  return values.reduce((sum, n) => sum + n, 0);
}

function extractFailedTestNames(text: string): string[] {
  const names: string[] = [];
  const add = (value: string | undefined): void => {
    const clean = cleanupFailureToken(value ?? '');
    if (clean && !names.includes(clean)) names.push(clean);
  };

  for (const match of text.matchAll(/^\s*(?:FAIL|FAILED)\s+([^\n]+?)(?:\s+-\s+.+)?$/gim)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/^\s*(?:test\s+)?([A-Za-z_][\w:./-]*(?:Test|test)[\w:./-]*)\s+(?:\.\.\.\s+)?(?:FAILED|FAIL)\b/gm)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/^\s*---\s+FAIL:\s+([A-Za-z_][\w./-]*)\b/gm)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/^\s*([A-Za-z0-9_.$/-]+(?:Test|Spec)[A-Za-z0-9_.$/-]*)\s+>\s+([^\n]+?)\s+FAILED\b/gm)) {
    add(`${match[1]} > ${match[2]}`);
  }
  for (const match of text.matchAll(/^\s*([A-Za-z0-9_./-]+\.(?:py|js|jsx|ts|tsx|mjs|cjs|go|rs|java|kt|cs|rb|php)::[^\s]+)\s+(?:FAILED|ERROR)\b/gm)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/^\s*(?:>|x|\u00d7|\u2717|-)\s+(.{4,160})$/gm)) {
    if (/\b(?:failed|expected|received|assert|should|throws?|errors?)\b/i.test(match[1])) add(match[1]);
  }
  for (const match of text.matchAll(/^\s{2,}([A-Za-z_][\w:./-]+)\s*$/gm)) {
    if (/\b(?:test|spec|should|fail|parse|render|build|compile)\b/i.test(match[1])) add(match[1]);
  }

  return names.slice(0, 8);
}

function extractVerifierErrorSummaries(text: string): string[] {
  const errors: string[] = [];
  const add = (value: string | undefined): void => {
    const clean = cleanupFailureToken(value ?? '');
    if (clean && !errors.includes(clean)) errors.push(clean);
  };

  const errorName = String.raw`(?:AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|RuntimeError|ValueError|KeyError|IndexError|ImportError|ModuleNotFoundError|FileNotFoundError|TimeoutError|Error|Exception|Failure|Panic|panic)`;
  for (const match of text.matchAll(new RegExp(`^\\s*(?:E\\s+)?(${errorName}(?::\\s*[^\\n]{0,180})?)`, 'gim'))) {
    add(match[1]);
  }
  for (const match of text.matchAll(/^\s*(?:Expected|Received|expected|received):\s+([^\n]{1,180})$/gm)) {
    add(match[0]);
  }
  return errors.slice(0, 6);
}

function compactVerifierFailureRaw(text: string): string {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[?info\]?/i.test(line));
  return truncate(lines.slice(0, 12).join(' | '), 360);
}

function cleanupFailureToken(value: string): string {
  return value
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[|>x\u00d7\u2717\-\s]+/, '')
    .replace(/\s+(?:FAILED|FAIL|ERROR)\s*$/i, '')
    .trim()
    .slice(0, 180);
}

function inferVerifierFrameworkFromCommand(command: string, fallback = 'unknown'): string {
  const normalized = command.toLowerCase();
  if (/\bvitest\b/.test(normalized)) return 'vitest';
  if (/\bjest\b/.test(normalized)) return 'jest';
  if (/\bpytest\b/.test(normalized)) return 'pytest';
  if (/\bcargo\s+test\b/.test(normalized)) return 'cargo';
  if (/\bgo\s+test\b/.test(normalized)) return 'go';
  if (/\bdotnet\s+test\b/.test(normalized)) return 'dotnet';
  if (/\b(?:mvn|mvnw|\.\/mvnw)\s+test\b/.test(normalized)) return 'maven';
  if (/\b(?:gradle|gradlew|\.\/gradlew)\s+test\b/.test(normalized)) return 'gradle';
  return fallback;
}

function formatVerificationEvidence(evidence: BenchmarkVerificationEvidence): string {
  if (!evidence.lastVerificationSeq) return 'none';
  const latest = evidence.extracted.at(-1);
  const latestFailure = evidence.failureSignatures.at(-1);
  const incomplete = evidence.incompleteRuns.length
    ? `incomplete=${evidence.incompleteRuns.length} inconclusive=${evidence.incompleteRuns.filter((run) => !run.conclusiveFailureEvidence).length}`
    : null;
  const status = `${evidence.lastVerificationStatus ?? 'unknown'}#${evidence.lastVerificationSeq}`;
  const failure = latestFailure ? formatFailureSignature(latestFailure) : null;
  if (!latest) return [`last=${status}`, 'counts=unparsed', incomplete, failure].filter(Boolean).join(', ');
  return [
    `last=${status}`,
    `framework=${latest.framework}`,
    latest.passed != null ? `passed=${latest.passed}` : null,
    latest.failed != null ? `failed=${latest.failed}` : null,
    latest.errors != null ? `errors=${latest.errors}` : null,
    latest.skipped != null ? `skipped=${latest.skipped}` : null,
    latest.total != null ? `total=${latest.total}` : null,
    incomplete,
    failure,
  ].filter(Boolean).join(', ');
}

function formatFailureSignature(signature: BenchmarkVerifierFailureSignature): string {
  return [
    `latest_failure=#${signature.seq}`,
    signature.tests.length ? `tests=${signature.tests.slice(0, 3).join('|')}` : null,
    signature.files.length ? `files=${signature.files.slice(0, 3).join('|')}` : null,
    signature.errors.length ? `errors=${signature.errors.slice(0, 2).join('|')}` : null,
  ].filter(Boolean).join(' ');
}

function benchmarkLeakageCandidateStrings(event: BenchmarkTraceEvent, input: Record<string, unknown>): string[] {
  switch (event.tool) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return stringsFromUnknown(input.file_path ?? input.path ?? event.target);
    case 'apply_patch':
      return stringsFromUnknown(input.patch ?? event.target);
    case 'grep':
    case 'glob':
    case 'list_dir':
      return stringsFromUnknown([input.path, input.pattern, input.include, event.target]);
    case 'bash':
      return stringsFromUnknown(input.command ?? event.target);
    case 'web_search':
    case 'web_fetch':
    case 'research_sources':
      return stringsFromUnknown(input.query ?? input.q ?? input.url ?? event.target);
    default:
      return stringsFromUnknown([event.target, event.inputPreview]);
  }
}

function stringsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
}

function detectBenchmarkLeakageRisk(text: string, tool: string): string | null {
  const normalized = text.replace(/\\/g, '/').toLowerCase();
  if (!normalized) return null;
  const pathLikeTool = [
    'read_file',
    'write_file',
    'edit_file',
    'apply_patch',
    'grep',
    'glob',
    'list_dir',
    'bash',
  ].includes(tool);

  const pathSegments = normalized
    .split(/[/\s"'`]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (pathLikeTool && pathSegments.some(isHighRiskBenchmarkPathSegment)) {
    return 'path segment resembles oracle/gold/hidden/answer benchmark material';
  }

  const basenameLike = pathSegments[pathSegments.length - 1] ?? normalized;
  if (pathLikeTool
    && /(^|[._-])(oracle|gold|answer|answers|hidden|expected|reference|submission|solution|solutions)([._-]|$)/.test(basenameLike)
    && /\.(patch|diff|jsonl?|ya?ml|txt|md|csv|tsv|pkl|pickle|parquet|sqlite|db|tar|zip|gz)$/.test(basenameLike)) {
    return 'file name resembles a benchmark answer, oracle, hidden result, or solution artifact';
  }

  if (tool === 'bash' && /\b(?:cat|type|less|more|sed|awk|grep|rg|find|ls|dir)\b[\s\S]{0,120}\b(?:oracle|gold|hidden|answers?|solutions?|expected[-_ ]?results?|submission[-_ ]?results?)\b/.test(normalized)) {
    return 'shell command appears to inspect read-with-care benchmark artifacts';
  }

  if (!pathLikeTool && /\b(?:official|oracle|gold|hidden)\s+(?:patch|solution|answer|tests?)\b/.test(normalized)) {
    return 'query text appears to seek official benchmark answers or hidden tests';
  }

  return null;
}

function isHighRiskBenchmarkPathSegment(segment: string): boolean {
  const clean = segment.replace(/^[._-]+|[._-]+$/g, '');
  return [
    'oracle',
    'oracles',
    'gold',
    'golden',
    'hidden',
    'answer',
    'answers',
    'answer_key',
    'answer-key',
    'expected',
    'expected-results',
    'expected_results',
    'reference',
    'references',
    'reference-solution',
    'reference_solution',
    'submission',
    'submissions',
    'solution',
    'solutions',
  ].includes(clean);
}

function extractChangedFiles(message: Message): string[] {
  if (message.role !== 'assistant' || !message.tool_calls) return [];
  const files: string[] = [];
  for (const call of message.tool_calls) {
    const name = call.function.name;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      continue;
    }
    if ((name === 'write_file' || name === 'edit_file') && typeof parsed.file_path === 'string') {
      files.push(parsed.file_path);
    }
    if (name === 'apply_patch' && typeof parsed.patch === 'string') {
      files.push(...extractPatchTargets(parsed.patch));
    }
  }
  return files.map((file) => redactTraceText(file)).filter(Boolean);
}

function extractPatchTargets(patch: string): string[] {
  return extractPatchTargetsByOperation(patch).map((target) => target.file);
}

function extractPatchTargetsByOperation(patch: string): Array<{ operation: 'Add' | 'Update' | 'Delete'; file: string }> {
  const detailed: Array<{ operation: 'Add' | 'Update' | 'Delete'; file: string }> = [];
  const re = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(patch)) !== null) {
    const operation = match[1] as 'Add' | 'Update' | 'Delete';
    const file = match[2].trim();
    detailed.push({ operation, file });
  }
  const moveRe = /^\*\*\* Move to: (.+)$/gm;
  while ((match = moveRe.exec(patch)) !== null) {
    const file = match[1].trim();
    detailed.push({ operation: 'Update', file });
  }
  const seen = new Set<string>();
  return detailed.filter((target) => {
    const key = `${target.operation}:${target.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.max(0, max - 80);
  return `${text.slice(0, head)}\n...[truncated ${text.length - head} chars]`;
}

function traceOutputPreview(text: string, tool: string, verification: boolean): string {
  if (tool === 'benchmark_context') return truncate(text, 3000);
  if (tool === 'research_sources') return traceResearchSourcesOutputPreview(text);
  if (verification) return truncateHeadTail(text, 4000);
  return truncate(text, 1200);
}

function traceResearchSourcesOutputPreview(text: string): string {
  const lines = extractResearchSourcesPreviewLines(text);
  if (lines.length === 0) return truncateHeadTail(text, 5000);
  return truncateHeadTail(lines.join('\n'), 5000);
}

function extractResearchSourcesPreviewLines(text: string): string[] {
  const lines: string[] = [];
  let captureList = false;

  const push = (line: string): void => {
    if (!line) return;
    lines.push(line);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Research source results\b/i.test(line)) {
      push(line);
      captureList = false;
      continue;
    }
    if (/^##\s+(?:Coverage notes|Source digest|Source errors)\b/i.test(line)) {
      push(line);
      captureList = true;
      continue;
    }
    if (/^##\s+[^:]+:\s+.+/.test(line)) {
      push(line);
      captureList = false;
      continue;
    }
    if (/^https?:\/\/\S+/i.test(line)) {
      push(line);
      continue;
    }
    if (captureList && /^-\s+\S+/.test(line)) {
      push(line);
    }
  }

  return lines;
}

function truncateHeadTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.45);
  const marker = `\n...[truncated ${text.length - max} chars; tail follows]...\n`;
  const tail = Math.max(0, max - head - marker.length);
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
