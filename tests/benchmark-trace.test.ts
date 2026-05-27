import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBenchmarkCompletionReminder,
  buildBenchmarkBlindRepairEvents,
  buildBenchmarkComponentEditEvents,
  buildBenchmarkContextBloatEvents,
  buildBenchmarkDependencyEditEvents,
  buildBenchmarkEnvironmentSetupEvents,
  buildBenchmarkEnvironmentSetupFailureEvents,
  buildBenchmarkEvidenceGroundingEvents,
  buildBenchmarkFailureUnalignedRepairEvents,
  buildBenchmarkIncompleteVerifierEvents,
  buildBenchmarkInvalidToolActionEvents,
  buildBenchmarkLeakageRiskEvents,
  buildBenchmarkLongHorizonSignals,
  buildBenchmarkPostSuccessMutationEvents,
  buildBenchmarkRewardHackSignals,
  buildBenchmarkRedundantVerifierEvents,
  buildBenchmarkRedundantToolCallEvents,
  buildBenchmarkScratchArtifactEvents,
  buildBenchmarkSkillViewEvents,
  buildBenchmarkSpecComplianceSignals,
  buildBenchmarkTaskAlignmentSignals,
  buildBenchmarkTestHarnessEditEvents,
  buildBenchmarkUnlocalizedEditEvents,
  buildBenchmarkTraceSummary,
  buildBenchmarkTrajectoryQuality,
  buildBenchmarkTrajectorySystemBlock,
  buildBenchmarkUsageSummary,
  buildBenchmarkFinalAnswerEvidence,
  buildBenchmarkVerificationEvidence,
  buildSourceResearchCoverage,
  countTaskContractSignals,
  makeBenchmarkInvalidToolActionEvent,
  makeBenchmarkTraceEvent,
  redactTraceText,
  writeBenchmarkTrace,
} from '../src/benchmark-trace.js';
import type { VentipusConfig, Message } from '../src/types.js';

const dirs: string[] = [];

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ventipus-trace-'));
  dirs.push(dir);
  return dir;
}

const config: VentipusConfig = {
  apiKey: 'sk-test-should-not-appear',
  baseURL: 'https://example.invalid/v1',
  model: 'test-model',
  provider: 'TestProvider',
  maxTokens: 8192,
  temperature: 0,
  permissionMode: 'yolo',
};

afterEach(() => {
  delete process.env.VENTIPUS_BENCHMARK_TRACE;
  delete process.env.VENTIPUS_BENCHMARK_TRACE_DIR;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('benchmark trace artifacts', () => {
  it('redacts common provider tokens from text', () => {
    const redacted = redactTraceText('OPENROUTER_API_KEY=sk-or-v1-secretvalue and hf_abcdefghijklmnop');
    expect(redacted).toContain('OPENROUTER_API_KEY=[REDACTED]');
    expect(redacted).toContain('hf_[REDACTED]');
    expect(redacted).not.toContain('sk-or-v1-secretvalue');
    expect(redacted).not.toContain('hf_abcdefghijklmnop');
  });

  it('summarizes tool events, verification commands, and changed files', () => {
    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'bash',
      input: { command: 'npm test' },
      output: 'PASS with OPENAI_API_KEY=sk-secret-secret-secret',
      isError: false,
      elapsedMs: 1234,
    });
    const messages: Message[] = [
      {
        role: 'user',
        content: '/benchmark swe-bench fix the app',
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'tc1',
          type: 'function',
          function: {
            name: 'edit_file',
            arguments: JSON.stringify({ file_path: 'src/app.ts', old_string: 'a', new_string: 'b' }),
          },
        }],
      },
    ];

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-1',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages,
      events: [event],
    });

    expect(summary.toolCallCount).toBe(1);
    expect(summary.usage).toEqual({
      callCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      byModel: [],
    });
    expect(summary.openAgentLeaderboardDraft).toMatchObject({
      submissionReady: false,
      agent: 'ventipus_agent',
      agent_name: 'Ventipus',
      benchmark: 'swebench',
      benchmark_name: 'SWE-bench',
      model: 'test-model',
      model_name: 'test-model',
      total_sessions: 1,
      planned_sessions: 1,
      completed_sessions: 1,
      incomplete_sessions: 0,
      missing_sessions: 0,
      successful_sessions: null,
      benchmark_score: null,
      average_action_count: 1,
      average_invalid_action_count: 0,
      average_agent_cost: 0,
      total_agent_cost: 0,
      subset_name: null,
      compact_latest_verification_status: 'ok',
      compact_verification_count: 1,
      missingOfficialFields: ['benchmark_score', 'successful_sessions', 'session_results'],
    });
    expect(summary.openAgentLeaderboardDraft.reason).toContain('official benchmark_score');
    expect(summary.verificationCount).toBe(1);
    expect(summary.verificationCommands).toEqual(['npm test']);
    expect(summary.verificationEvidence.lastVerificationStatus).toBe('ok');
    expect(summary.verificationEvidence.extracted).toEqual([]);
    expect(summary.verificationEvidence.failureSignatures).toEqual([]);
    expect(summary.verificationEvidence.incompleteRuns).toEqual([]);
    expect(summary.finalAnswerEvidence).toMatchObject({
      mentionsVerification: false,
      claimsPassingVerification: false,
      claimsNoVerificationRun: false,
      claimsIncomplete: false,
      claimsBlocked: false,
      finalAnswerCompletion: 'unknown',
      unsupportedPassingClaim: false,
      contradictedPassingClaim: false,
      staleNoVerificationClaim: false,
      latestVerificationStatus: 'ok',
      lastSuccessfulVerificationSeq: 1,
      verificationCount: 1,
      warnings: [],
    });
    expect(summary.agentContextCompilation).toMatchObject({
      version: 1,
      format: 'ventipus-agent-context-compilation-v1',
      task: '/benchmark swe-bench fix the app',
      metadata: {
        sessionId: 'session-1',
        mode: 'benchmark',
        provider: 'TestProvider',
        model: 'test-model',
        eventCount: 1,
        contextEventCount: 1,
        verificationStatus: 'ok',
        successfulVerificationCount: 1,
        processScore: expect.any(Number),
        usageTotalTokens: 0,
        estimatedCostUsd: 0,
        changedFiles: ['src/app.ts'],
        verificationCommands: ['npm test'],
      },
    });
    expect(summary.agentContextCompilation.context).toContain('#1 bash ok verifier');
    expect(summary.agentContextCompilation.context).toContain('Source coverage: none');
    expect(summary.agentContextCompilation.answer).toContain('Latest verifier status: ok.');
    expect(JSON.stringify(summary.agentContextCompilation)).not.toContain(config.apiKey);
    expect(summary.changeEvaluation).toMatchObject({
      version: 1,
      format: 'ventipus-change-evaluation-v1',
      source: 'ventipus benchmark trace',
      status: 'no_edits',
      accepted: null,
      editCount: 0,
      predictedEditCount: 0,
      decisionCoveragePercent: null,
      regressionCycleCount: 0,
      predictions: [],
      unpredictedEdits: [],
      regressionCycles: [],
    });
    expect(summary.changedFiles).toContain('src/app.ts');
    expect(summary.trajectoryQuality.usageCallCount).toBe(0);
    expect(summary.trajectoryQuality.usageTotalTokens).toBe(0);
    expect(summary.trajectoryQuality.usageEstimatedCostUsd).toBe(0);
    expect(summary.trajectoryQuality.costEfficiencyRisk).toBe(false);
    expect(summary.trajectoryQuality.totalToolElapsedMs).toBe(1234);
    expect(summary.trajectoryQuality.maxToolElapsedMs).toBe(1234);
    expect(summary.trajectoryQuality.slowToolCallCount).toBe(0);
    expect(summary.trajectoryQuality.slowToolEvents).toEqual([]);
    expect(summary.trajectoryQuality.timeEfficiencyRisk).toBe(false);
    expect(summary.trajectoryQuality.invalidToolActionCount).toBe(0);
    expect(summary.trajectoryQuality.invalidToolActionPercent).toBe(0);
    expect(summary.trajectoryQuality.invalidToolActionEvents).toEqual([]);
    expect(summary.trajectoryQuality.validationAfterFirstEdit).toBeNull();
    expect(summary.trajectoryQuality.validationAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.successfulVerificationCount).toBe(1);
    expect(summary.trajectoryQuality.failedVerificationCount).toBe(0);
    expect(summary.trajectoryQuality.incompleteVerifierCount).toBe(0);
    expect(summary.trajectoryQuality.incompleteVerifierEvents).toEqual([]);
    expect(summary.trajectoryQuality.inconclusiveVerifierEvents).toEqual([]);
    expect(summary.trajectoryQuality.environmentSetupFailureCount).toBe(0);
    expect(summary.trajectoryQuality.environmentSetupFailureEvents).toEqual([]);
    expect(summary.trajectoryQuality.unresolvedEnvironmentSetupFailureCount).toBe(0);
    expect(summary.trajectoryQuality.unresolvedEnvironmentSetupFailureEvents).toEqual([]);
    expect(summary.trajectoryQuality.environmentSetupCount).toBe(0);
    expect(summary.trajectoryQuality.successfulEnvironmentSetupCount).toBe(0);
    expect(summary.trajectoryQuality.environmentSetupEvents).toEqual([]);
    expect(summary.trajectoryQuality.skillViewCount).toBe(0);
    expect(summary.trajectoryQuality.skillViewEvents).toEqual([]);
    expect(summary.trajectoryQuality.skillNames).toEqual([]);
    expect(summary.trajectoryQuality.skillLoadedBeforeLocalContext).toBe(false);
    expect(summary.trajectoryQuality.excessiveSkillViewCount).toBe(false);
    expect(summary.trajectoryQuality.passingValidationAfterFirstEdit).toBeNull();
    expect(summary.trajectoryQuality.passingValidationAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.failingReproductionBeforeFirstEdit).toBeNull();
    expect(summary.trajectoryQuality.sourceResearchCoverage.callCount).toBe(0);
    expect(summary.trajectoryQuality.taskContractSignalCount).toBe(0);
    expect(summary.trajectoryQuality.taskContractChecklistAfterContext).toBeNull();
    expect(summary.trajectoryQuality.noEditContractDetected).toBe(false);
    expect(summary.trajectoryQuality.editAfterNoEditContract).toBe(false);
    expect(summary.trajectoryQuality.taskAlignmentRisk).toBe(false);
    expect(summary.trajectoryQuality.taskAlignmentSignalCount).toBe(0);
    expect(summary.trajectoryQuality.taskAlignmentSignals).toEqual([]);
    expect(summary.trajectoryQuality.specComplianceRisk).toBe(false);
    expect(summary.trajectoryQuality.specComplianceSignalCount).toBe(0);
    expect(summary.trajectoryQuality.specComplianceSignals).toEqual([]);
    expect(summary.trajectoryQuality.rewardHackRisk).toBe(false);
    expect(summary.trajectoryQuality.rewardHackSignalCount).toBe(0);
    expect(summary.trajectoryQuality.rewardHackSignals).toEqual([]);
    expect(summary.trajectoryQuality.longHorizonRisk).toBe(false);
    expect(summary.trajectoryQuality.longHorizonSignalCount).toBe(0);
    expect(summary.trajectoryQuality.longHorizonSignals).toEqual([]);
    expect(summary.trajectoryQuality.editTargetCount).toBe(0);
    expect(summary.trajectoryQuality.localizedEditTargetCount).toBe(0);
    expect(summary.trajectoryQuality.unlocalizedEditTargetEvents).toEqual([]);
    expect(summary.trajectoryQuality.contextUtilizationInspectCount).toBe(0);
    expect(summary.trajectoryQuality.contextUtilizationHitCount).toBe(0);
    expect(summary.trajectoryQuality.contextUtilizationMissCount).toBe(0);
    expect(summary.trajectoryQuality.contextUtilizationPercent).toBeNull();
    expect(summary.trajectoryQuality.contextUtilizationRisk).toBe(false);
    expect(summary.trajectoryQuality.contextUtilizationMissEvents).toEqual([]);
    expect(summary.trajectoryQuality.preEditContextInspectCount).toBe(0);
    expect(summary.trajectoryQuality.preEditContextHitCount).toBe(0);
    expect(summary.trajectoryQuality.preEditContextMissCount).toBe(0);
    expect(summary.trajectoryQuality.preEditContextUtilizationPercent).toBeNull();
    expect(summary.trajectoryQuality.contextBloatRisk).toBe(false);
    expect(summary.trajectoryQuality.contextBloatEventCount).toBe(0);
    expect(summary.trajectoryQuality.contextBloatEvents).toEqual([]);
    expect(summary.trajectoryQuality.evidenceGroundingRisk).toBe(false);
    expect(summary.trajectoryQuality.evidenceGroundingEventCount).toBe(0);
    expect(summary.trajectoryQuality.evidenceGroundingEvents).toEqual([]);
    expect(summary.trajectoryQuality.redundantToolCallCount).toBe(0);
    expect(summary.trajectoryQuality.redundantToolCallEvents).toEqual([]);
    expect(summary.trajectoryQuality.redundantVerifierCount).toBe(0);
    expect(summary.trajectoryQuality.redundantVerifierEvents).toEqual([]);
    expect(summary.trajectoryQuality.blindRepairCount).toBe(0);
    expect(summary.trajectoryQuality.blindRepairEvents).toEqual([]);
    expect(summary.trajectoryQuality.failureAlignedRepairCount).toBe(0);
    expect(summary.trajectoryQuality.failureUnalignedRepairCount).toBe(0);
    expect(summary.trajectoryQuality.failureUnalignedRepairEvents).toEqual([]);
    expect(summary.trajectoryQuality.postEditRegressionCycleCount).toBe(0);
    expect(summary.trajectoryQuality.postEditRegressionCycleEvents).toEqual([]);
    expect(summary.trajectoryQuality.scratchArtifactPermissionDetected).toBe(false);
    expect(summary.trajectoryQuality.scratchArtifactEvents).toEqual([]);
    expect(summary.trajectoryQuality.postEditDiffReview).toBeNull();
    expect(summary.trajectoryQuality.diffReviewAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.firstPostEditDiffReviewSeq).toBeNull();
    expect(summary.trajectoryQuality.firstDiffReviewAfterLastEditSeq).toBeNull();
    expect(summary.trajectoryQuality.broadValidationAfterFirstEdit).toBeNull();
    expect(summary.trajectoryQuality.passingBroadValidationAfterFirstEdit).toBeNull();
    expect(summary.trajectoryQuality.broadValidationAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.passingBroadValidationAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.firstBroadValidationAfterFirstEditSeq).toBeNull();
    expect(summary.trajectoryQuality.lastPostEditVerificationSeq).toBeNull();
    expect(summary.trajectoryQuality.lastPostEditVerificationStatus).toBeNull();
    expect(summary.trajectoryQuality.lastPostEditVerificationConclusiveFailure).toBeNull();
    expect(summary.trajectoryQuality.finalEditVerificationCount).toBe(0);
    expect(summary.trajectoryQuality.finalEditPassingVerificationCount).toBe(0);
    expect(summary.trajectoryQuality.stableValidationAfterLastEdit).toBeNull();
    expect(summary.trajectoryQuality.firstConclusiveFailedVerificationSeq).toBeNull();
    expect(summary.trajectoryQuality.testEditPermissionDetected).toBe(false);
    expect(summary.trajectoryQuality.testHarnessEditEvents).toEqual([]);
    expect(summary.trajectoryQuality.leakageRiskEvents).toEqual([]);
    expect(summary.trajectoryQuality.processScore).toBe(90);
    expect(summary.trajectoryQuality.processDefects.map((d) => d.code)).toContain('missing_benchmark_context');
    expect(summary.trajectoryQuality.warnings).toContain('benchmark_context was not used; early environment/task discovery may be weaker.');
    expect(summary.experienceCard).toMatchObject({
      version: 1,
      replayCheckpoints: [],
      failureSignatures: [],
      taskContract: {
        signalCount: 0,
        signals: [],
        checklistAfterContext: null,
        checklistComplete: null,
        incompleteCount: 0,
        incompleteItems: [],
      },
      taskAlignment: {
        risk: false,
        signalCount: 0,
        signals: [],
      },
      specCompliance: {
        risk: false,
        signalCount: 0,
        signals: [],
      },
      rewardHack: {
        risk: false,
        signalCount: 0,
        signals: [],
      },
      longHorizon: {
        risk: false,
        signalCount: 0,
        signals: [],
      },
      verificationCommands: ['npm test'],
      changedFiles: ['src/app.ts'],
    });
    expect(JSON.stringify(summary)).not.toContain('sk-secret-secret-secret');
  });

  it('labels emerging benchmark profiles in Open Agent drafts', () => {
    const cases = [
      {
        prompt: '/benchmark swe-chain upgrade chained package versions',
        benchmark: 'swechain',
        benchmarkName: 'SWE-Chain',
      },
      {
        prompt: '/benchmark swe-cycle solve FullCycle bare repository issue',
        benchmark: 'swecycle',
        benchmarkName: 'SWE-Cycle',
      },
      {
        prompt: '/benchmark ci-repair fix failing workflow',
        benchmark: 'cirepairbench',
        benchmarkName: 'CI-Repair-Bench',
      },
      {
        prompt: '/benchmark swe-ci maintain target commit CI loop',
        benchmark: 'sweci',
        benchmarkName: 'SWE-CI',
      },
      {
        prompt: '/benchmark swe-prbench review pull request feedback',
        benchmark: 'sweprbench',
        benchmarkName: 'SWE-PRBench',
      },
      {
        prompt: '/benchmark tml-bench train tabular ML baseline and create sample_submission.csv',
        benchmark: 'tmlbench',
        benchmarkName: 'TML-Bench',
      },
      {
        prompt: '/benchmark pi-bench handle proactive personal assistant hidden intent',
        benchmark: 'pibench',
        benchmarkName: 'Pi-Bench',
      },
      {
        prompt: '/benchmark wildclaw solve BrowseComp task',
        benchmark: 'wildclawbench',
        benchmarkName: 'WildClawBench',
      },
      {
        prompt: '/benchmark arc-agi solve Kaggle ARC task',
        benchmark: 'arcagi3',
        benchmarkName: 'ARC-AGI-3',
      },
      {
        prompt: '/benchmark specbench satisfy held-out specification behavior',
        benchmark: 'specbench',
        benchmarkName: 'SpecBench',
      },
      {
        prompt: '/benchmark reward-hacking solve without evaluator shortcuts',
        benchmark: 'rewardhackingbenchmark',
        benchmarkName: 'Reward Hacking Benchmark',
      },
      {
        prompt: '/benchmark roadmapbench implement target version roadmap',
        benchmark: 'roadmapbench',
        benchmarkName: 'RoadmapBench',
      },
      {
        prompt: '/benchmark saasbench implement enterprise billing workflow',
        benchmark: 'saasbench',
        benchmarkName: 'SaaSBench',
      },
      {
        prompt: '/benchmark swe-bench-mobile implement iOS PRD feature',
        benchmark: 'swebenchmobile',
        benchmarkName: 'SWE-Bench Mobile',
      },
      {
        prompt: '/benchmark webdevbench build full-stack canary workflow',
        benchmark: 'swewebdevbench',
        benchmarkName: 'SWE-WebDevBench',
      },
      {
        prompt: '/benchmark appworld complete user app workflow',
        benchmark: 'appworld',
        benchmarkName: 'AppWorld',
      },
      {
        prompt: '/benchmark browsecomp answer difficult research question',
        benchmark: 'browsecompplus',
        benchmarkName: 'BrowseComp+',
      },
      {
        prompt: '/benchmark tau2 resolve customer policy workflow',
        benchmark: 'tau2',
        benchmarkName: 'Tau Bench 2',
      },
    ];

    for (const testCase of cases) {
      const summary = buildBenchmarkTraceSummary({
        sessionId: `session-${testCase.benchmark}`,
        mode: 'benchmark',
        cwd: 'C:/repo',
        config,
        startedAtMs: 1000,
        endedAtMs: 2500,
        messages: [{ role: 'user', content: testCase.prompt }],
        events: [],
      });

      expect(summary.openAgentLeaderboardDraft).toMatchObject({
        benchmark: testCase.benchmark,
        benchmark_name: testCase.benchmarkName,
      });
    }
  });

  it('classifies AHE component-observability edit surfaces', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: workspace/tool_descriptions/run_shell_command.tool.yaml',
      '@@',
      '-old',
      '+new',
      '*** Add File: workspace/middleware/publish_state.py',
      '+print("guard")',
      '*** Update File: resources/terminal_bench/ventipus_agent.py',
      '@@',
      '-old',
      '+new',
      '*** End Patch',
    ].join('\n');
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'edit_file',
        input: { file_path: 'workspace/systemprompt.md', old_string: 'a', new_string: 'b' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'apply_patch',
        input: { patch },
        output: 'ok',
        isError: false,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'write_file',
        input: { file_path: 'workspace/LongTermMEMORY.md', content: 'lesson' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: '1', new_string: '2' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    expect(buildBenchmarkComponentEditEvents(events)).toEqual(expect.arrayContaining([
      expect.objectContaining({ seq: 1, target: 'workspace/systemprompt.md', component: 'system_prompt' }),
      expect.objectContaining({ seq: 2, target: 'workspace/tool_descriptions/run_shell_command.tool.yaml', component: 'tool_description' }),
      expect.objectContaining({ seq: 2, target: 'workspace/middleware/publish_state.py', component: 'middleware' }),
      expect.objectContaining({ seq: 2, target: 'resources/terminal_bench/ventipus_agent.py', component: 'adapter' }),
      expect.objectContaining({ seq: 3, target: 'workspace/LongTermMEMORY.md', component: 'long_term_memory' }),
      expect.objectContaining({ seq: 4, target: 'src/app.ts', component: 'source_code' }),
    ]));

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-component-observability',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages: [],
      events,
    });

    expect(summary.trajectoryQuality).toMatchObject({
      componentEditCount: 6,
      componentUnclassifiedEditCount: 0,
    });
    expect(summary.experienceCard.componentObservability).toMatchObject({
      editCount: 6,
      classifiedEditCount: 6,
      unclassifiedEditCount: 0,
      components: expect.arrayContaining([
        expect.objectContaining({ component: 'adapter', editCount: 1, targets: ['resources/terminal_bench/ventipus_agent.py'] }),
        expect.objectContaining({ component: 'long_term_memory', editCount: 1, targets: ['workspace/LongTermMEMORY.md'] }),
        expect.objectContaining({ component: 'middleware', editCount: 1, targets: ['workspace/middleware/publish_state.py'] }),
        expect.objectContaining({ component: 'source_code', editCount: 1, targets: ['src/app.ts'] }),
        expect.objectContaining({ component: 'system_prompt', editCount: 1, targets: ['workspace/systemprompt.md'] }),
        expect.objectContaining({ component: 'tool_description', editCount: 1, targets: ['workspace/tool_descriptions/run_shell_command.tool.yaml'] }),
      ]),
    });
    const block = buildBenchmarkTrajectorySystemBlock(events);
    expect(block).toContain('component_edits=6');
    expect(block).toContain('component_unclassified=0');
    expect(block).toContain('adapter:1');
    expect(block).toContain('system_prompt:1');
  });

  it('builds compact experience cards for future benchmark replay', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 0,
        tool: 'benchmark_context',
        input: { path: 'C:/repo' },
        output: [
          '## Task Contract Signals',
          '- TASK.md: Must show billing totals with two decimal places.',
          '- TASK.md: Do not change public route names.',
        ].join('\n'),
        isError: false,
        elapsedMs: 5,
      }),
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function total() { return 12.3; }',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'billing', path: 'src' },
        output: 'src/app.ts:1: billing total',
        isError: false,
        elapsedMs: 12,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: [
          'FAIL src/app.test.ts > billing totals render with fixed decimals',
          'AssertionError: expected 12.3 to equal 12.30',
          'at src/app.ts:10:1',
        ].join('\n'),
        isError: true,
        elapsedMs: 120,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: '12.3', new_string: '12.30' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 120,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'research_sources',
        input: {
          query: 'coding agent experience replay',
          source: 'all',
          github_kind: 'all',
          kind: 'all',
          kaggle_kind: 'both',
          recent_days: 90,
        },
        output: [
          'Research source results for "coding agent experience replay"',
          '## Source digest',
          '- hits: 4',
          '- errors: 0',
          '- sources: arXiv=1 | GitHub=1 | HF paper=1 | Kaggle competition=1',
          '- top_urls: https://arxiv.org/abs/2601.22129',
          '## arXiv: SWE-Replay',
          'https://arxiv.org/abs/2601.22129',
          '## GitHub: owner/replay-agent',
          'https://github.com/owner/replay-agent',
          '## HF paper: SWE Context Bench',
          'https://huggingface.co/papers/2602.08316',
          '## Kaggle competition: Agent Leaderboard',
          'https://www.kaggle.com/competitions/agent-leaderboard',
        ].join('\n'),
        isError: false,
        elapsedMs: 20,
      }),
    ];
    const messages: Message[] = [{
      role: 'assistant',
      content: 'Prediction: changing src/app.ts should make npm test pass.\nAt-risk regression: public route names could change while formatting billing totals.',
      tool_calls: [{
        id: 'tc-edit',
        type: 'function',
        function: {
          name: 'edit_file',
          arguments: JSON.stringify({ file_path: 'src/app.ts', old_string: '12.3', new_string: '12.30' }),
        },
      }],
    }];

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-experience',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages,
      events,
    });

    expect(summary.experienceCard.replayCheckpoints).toEqual([
      { seq: 1, tool: 'read_file', target: 'src/app.ts', reason: 'file_context', score: 11 },
      { seq: 2, tool: 'grep', target: '/billing/ in src', reason: 'search_context', score: 10 },
      { seq: 3, tool: 'bash', target: 'npm test', reason: 'failing_verifier', score: 12 },
    ]);
    expect(summary.experienceCard.failureSignatures[0]).toMatchObject({
      command: 'npm test',
      files: expect.arrayContaining(['src/app.test.ts', 'src/app.ts']),
    });
    expect(summary.experienceCard.sourceResearchCoverage).toMatchObject({
      callCount: 1,
      sourceHitCount: 4,
      arxiv: true,
      github: true,
      huggingface: true,
      kaggle: true,
      freshTargetedCoverage: true,
    });
    expect(summary.experienceCard.changedFiles).toEqual(['src/app.ts']);
    expect(summary.experienceCard.verificationCommands).toEqual(['npm test']);
    expect(summary.experienceCard.taskContract).toMatchObject({
      signalCount: 2,
      signals: [
        'TASK.md: Must show billing totals with two decimal places.',
        'TASK.md: Do not change public route names.',
      ],
      incompleteItems: [],
    });
    expect(summary.experienceCard.decisionObservability).toMatchObject({
      editCount: 1,
      predictedEditCount: 1,
      verifiedPredictionCount: 1,
      regressionForecastCount: 1,
      missingRegressionForecastCount: 0,
      editPredictions: [{
        editSeq: 4,
        tool: 'edit_file',
        target: 'src/app.ts',
        prediction: 'changing src/app.ts should make npm test pass.',
        predictedRegression: 'public route names could change while formatting billing totals.',
        nextVerifierSeq: 5,
        nextVerifierStatus: 'ok',
        nextVerifierCommand: 'npm test',
      }],
    });
    expect(summary.changeEvaluation).toMatchObject({
      status: 'confirmed',
      accepted: true,
      editCount: 1,
      predictedEditCount: 1,
      regressionForecastCount: 1,
      missingRegressionForecastCount: 0,
      unpredictedEditCount: 0,
      confirmedPredictionCount: 1,
      contradictedPredictionCount: 0,
      unverifiedPredictionCount: 0,
      decisionCoveragePercent: 100,
      regressionCycleCount: 0,
      predictions: [{
        editSeq: 4,
        target: 'src/app.ts',
        predictedRegression: 'public route names could change while formatting billing totals.',
        verdict: 'confirmed',
        evidence: 'next verifier #5 passed: npm test',
      }],
    });
    expect(summary.experienceCard.validationReliability).toMatchObject({
      lastEditSeq: 4,
      finalEditVerificationCount: 1,
      finalEditPassingVerificationCount: 1,
      stableValidationAfterLastEdit: true,
      broadValidationAfterLastEdit: true,
      passingBroadValidationAfterLastEdit: true,
      ciValidationAfterLastEdit: null,
      passingCiValidationAfterLastEdit: null,
      postEditRegressionCycleCount: 0,
      lastPostEditVerificationSeq: 5,
      lastPostEditVerificationStatus: 'ok',
      finalVerifierCommands: ['npm test'],
    });
    expect(summary.experienceCard.contextUtilization).toMatchObject({
      inspectCount: 2,
      hitCount: 2,
      missCount: 0,
      utilizationPercent: 100,
      risk: false,
      missEvents: [],
    });
    expect(summary.experienceCard.runEfficiency).toMatchObject({
      toolCallCount: 7,
      totalToolElapsedMs: 297,
      maxToolElapsedMs: 120,
      slowToolCallCount: 0,
      usageCallCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      successfulVerificationCount: 1,
      invalidToolActionCount: 0,
      invalidToolActionPercent: 0,
      costEfficiencyRisk: false,
      timeEfficiencyRisk: false,
      slowToolEvents: [],
    });
    expect(summary.experienceCard.runEfficiency.processScore).toBe(summary.trajectoryQuality.processScore);
    expect(summary.experienceCard.runEfficiency.processDefectCount).toBe(summary.trajectoryQuality.processDefects.length);
    expect(summary.experienceCard.runEfficiency.warningCount).toBe(summary.trajectoryQuality.warnings.length);
    expect(JSON.stringify(summary.experienceCard)).not.toContain('sk-test-should-not-appear');
  });

  it('flags AHE regression-foresight gaps in otherwise predicted edits', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const value = 1;',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 1 total',
        isError: true,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: '1', new_string: '2' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 20,
      }),
    ];
    const messages: Message[] = [{
      role: 'assistant',
      content: 'Prediction: changing src/app.ts should make npm test pass.',
      tool_calls: [{
        id: 'tc-edit',
        type: 'function',
        function: {
          name: 'edit_file',
          arguments: JSON.stringify({ file_path: 'src/app.ts', old_string: '1', new_string: '2' }),
        },
      }],
    }];

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-regression-forecast',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages,
      events,
    });

    expect(summary.changeEvaluation).toMatchObject({
      status: 'missing_regression_forecasts',
      accepted: false,
      editCount: 1,
      predictedEditCount: 1,
      regressionForecastCount: 0,
      missingRegressionForecastCount: 1,
      confirmedPredictionCount: 1,
      predictions: [{
        editSeq: 4,
        prediction: 'changing src/app.ts should make npm test pass.',
        predictedRegression: null,
        verdict: 'confirmed',
      }],
    });
    expect(summary.trajectoryQuality).toMatchObject({
      predictedEditCount: 1,
      regressionForecastCount: 0,
      missingRegressionForecastCount: 1,
      regressionForesightRisk: true,
    });
    expect(summary.trajectoryQuality.processDefects.map((defect) => defect.code)).toContain('missing_regression_forecast');
    expect(summary.trajectoryQuality.warnings.join('\n')).toContain('regression-foresight risk');
    expect(buildBenchmarkTrajectorySystemBlock(events, [], messages)).toContain('missing_regression_forecasts=1');
    expect(buildBenchmarkCompletionReminder(events, [], messages)).toContain('At-risk regression');
  });

  it('writes AHE-style change evaluation for unpredicted benchmark edits', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 20,
      }),
    ];
    const messages: Message[] = [{
      role: 'assistant',
      content: 'Editing src/app.ts.',
      tool_calls: [{
        id: 'tc-edit',
        type: 'function',
        function: {
          name: 'edit_file',
          arguments: JSON.stringify({ file_path: 'src/app.ts', old_string: 'a', new_string: 'b' }),
        },
      }],
    }];

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-change-eval',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages,
      events,
    });

    expect(summary.changeEvaluation).toMatchObject({
      status: 'missing_predictions',
      accepted: false,
      editCount: 1,
      predictedEditCount: 0,
      unpredictedEditCount: 1,
      decisionCoveragePercent: 0,
      unpredictedEdits: [{
        editSeq: 1,
        tool: 'edit_file',
        target: 'src/app.ts',
      }],
    });
    expect(summary.trajectoryQuality.decisionObservabilityRisk).toBe(true);
    expect(summary.trajectoryQuality.processDefects.map((defect) => defect.code)).toContain('weak_change_manifest');
    expect(summary.trajectoryQuality.warnings.join('\n')).toContain('decision-observability risk');
    expect(buildBenchmarkTrajectorySystemBlock(events, [], messages)).toContain('decision_risk=yes');
    expect(buildBenchmarkCompletionReminder(events, [], messages)).toContain('Prediction line');
    expect(JSON.stringify(summary.changeEvaluation)).not.toContain(config.apiKey);
  });

  it('flags AHE publish-state mutations after passing validation without revalidation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: '# Benchmark Context\n## Likely Verification Commands\n- npm test\n',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 1 total\nsrc/app.test.ts',
        isError: true,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const value = 1;',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: '1', new_string: '2' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: '2', new_string: '3' },
        output: 'ok',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);

    expect(buildBenchmarkPostSuccessMutationEvents(events)).toMatchObject([{
      seq: 6,
      tool: 'edit_file',
      target: 'src/app.ts',
      passingVerifierSeq: 5,
      passingVerifierCommand: 'npm test',
    }]);
    expect(quality.postSuccessMutationCount).toBe(1);
    expect(quality.postSuccessMutationEvents[0].reason).toContain('file edit after passing verifier');
    expect(quality.warnings.join('\n')).toContain('AHE publish-state risk');
    expect(quality.processDefects.map((defect) => defect.code)).toContain('post_success_mutation_without_revalidation');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('post_success_mutations=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('post-success edit');
  });

  it('clears AHE publish-state mutation risk when a later verifier passes', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'git reset --hard HEAD' },
        output: 'HEAD is now at abc123',
        isError: false,
        elapsedMs: 20,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 20,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);

    expect(buildBenchmarkPostSuccessMutationEvents(events)).toEqual([]);
    expect(quality.postSuccessMutationCount).toBe(0);
    expect(quality.processDefects.map((defect) => defect.code)).not.toContain('post_success_mutation_without_revalidation');
  });

  it('summarizes benchmark token and cost usage by model', () => {
    const usage = buildBenchmarkUsageSummary([
      {
        model: 'openrouter/free',
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        estimatedCostUsd: 0,
      },
      {
        model: 'openai/gpt-4o',
        promptTokens: 2000,
        completionTokens: 500,
        totalTokens: 2500,
        estimatedCostUsd: 0.01,
      },
      {
        model: 'openrouter/free',
        promptTokens: 300,
        completionTokens: 100,
        totalTokens: 400,
        estimatedCostUsd: 0,
      },
    ]);

    expect(usage).toEqual({
      callCount: 3,
      promptTokens: 3300,
      completionTokens: 800,
      totalTokens: 4100,
      estimatedCostUsd: 0.01,
      byModel: [
        {
          model: 'openai/gpt-4o',
          calls: 1,
          promptTokens: 2000,
          completionTokens: 500,
          totalTokens: 2500,
          estimatedCostUsd: 0.01,
        },
        {
          model: 'openrouter/free',
          calls: 2,
          promptTokens: 1300,
          completionTokens: 300,
          totalTokens: 1600,
          estimatedCostUsd: 0,
        },
      ],
    });

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-usage',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2000,
      messages: [],
      events: [],
      usageEvents: [
        {
          model: 'openrouter/free',
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          estimatedCostUsd: 0,
        },
      ],
    });
    expect(summary.usage).toMatchObject({
      callCount: 1,
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      estimatedCostUsd: 0,
    });
    expect(summary.trajectoryQuality).toMatchObject({
      usageCallCount: 1,
      usageTotalTokens: 120,
      usageEstimatedCostUsd: 0,
      costEfficiencyRisk: false,
    });
  });

  it('flags unsupported final answer verification claims', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
    ];
    const verificationEvidence = buildBenchmarkVerificationEvidence(events);

    expect(buildBenchmarkFinalAnswerEvidence('All tests passed after the fix.', verificationEvidence, events)).toMatchObject({
      mentionsVerification: true,
      claimsPassingVerification: true,
      claimsNoVerificationRun: false,
      claimsIncomplete: false,
      claimsBlocked: false,
      finalAnswerCompletion: 'unknown',
      unsupportedPassingClaim: true,
      contradictedPassingClaim: true,
      staleNoVerificationClaim: false,
      latestVerificationStatus: 'error',
      lastSuccessfulVerificationSeq: null,
      verificationCount: 1,
      warnings: [
        'final answer claims passing verification, but the latest recorded verifier failed.',
        'final answer claims passing verification, but no passing verifier event was recorded.',
      ],
    });

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-final-claims',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 1500,
      messages: [{ role: 'assistant', content: 'All tests passed after the fix.' }],
      events,
    });

    expect(summary.finalAnswerEvidence.unsupportedPassingClaim).toBe(true);
    expect(summary.finalAnswerEvidence.contradictedPassingClaim).toBe(true);
    expect(summary.finalAnswerEvidence.warnings.join('\n')).toContain('latest recorded verifier failed');
  });

  it('flags incomplete or blocked final answers', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
    ];
    const verificationEvidence = buildBenchmarkVerificationEvidence(events);

    expect(
      buildBenchmarkFinalAnswerEvidence(
        'I could not finish this; tests still fail. Remaining work: fix the parser edge case.',
        verificationEvidence,
        events,
      ),
    ).toMatchObject({
      mentionsVerification: true,
      claimsPassingVerification: false,
      claimsIncomplete: true,
      claimsBlocked: false,
      finalAnswerCompletion: 'incomplete',
      latestVerificationStatus: 'error',
      warnings: ['final answer indicates the task is incomplete or blocked.'],
    });

    expect(
      buildBenchmarkFinalAnswerEvidence(
        'I am blocked by missing service credentials and need access to continue.',
        verificationEvidence,
        events,
      ),
    ).toMatchObject({
      claimsIncomplete: true,
      claimsBlocked: true,
      finalAnswerCompletion: 'blocked',
      warnings: ['final answer indicates the task is incomplete or blocked.'],
    });

    expect(buildBenchmarkFinalAnswerEvidence('Done with no remaining work.', verificationEvidence, events)).toMatchObject({
      claimsIncomplete: false,
      claimsBlocked: false,
      finalAnswerCompletion: 'unknown',
      warnings: [],
    });
  });

  it('flags high-cost benchmark trajectories that still lack core evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];
    const usageEvents = [
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
      { model: 'openrouter/free', promptTokens: 9000, completionTokens: 1000, totalTokens: 10000, estimatedCostUsd: 0 },
    ];

    const quality = buildBenchmarkTrajectoryQuality(events, buildBenchmarkUsageSummary(usageEvents));
    expect(quality.usageCallCount).toBe(6);
    expect(quality.usageTotalTokens).toBe(60000);
    expect(quality.usageEstimatedCostUsd).toBe(0);
    expect(quality.costEfficiencyRisk).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['costly_under_evidenced_trajectory']);
    expect(quality.warnings.join('\n')).toContain('cost-efficiency risk');
    expect(buildBenchmarkTrajectorySystemBlock(events, usageEvents)).toContain('usage_calls=6 usage_tokens=60000 usage_cost=$0.0000 cost_risk=yes');
    expect(buildBenchmarkCompletionReminder(events, usageEvents)).toContain('cost-efficiency risk');
  });

  it('flags high wall-clock tool time when benchmark evidence stays weak', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1_000,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'command timed out after 300s',
        isError: true,
        elapsedMs: 300_000,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'grep',
        input: { pattern: 'failure', path: 'logs' },
        output: '',
        isError: false,
        elapsedMs: 181_000,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'command timed out after 300s',
        isError: true,
        elapsedMs: 300_000,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.totalToolElapsedMs).toBe(782_000);
    expect(quality.maxToolElapsedMs).toBe(300_000);
    expect(quality.slowToolCallCount).toBe(3);
    expect(quality.slowToolEvents.map((event) => event.seq)).toEqual([2, 3, 4]);
    expect(quality.timeEfficiencyRisk).toBe(true);
    expect(quality.processDefects.map((defect) => defect.code)).toContain('slow_under_evidenced_trajectory');
    expect(quality.warnings.join('\n')).toContain('time-efficiency risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('tool_elapsed=782000ms slow_tools=3 time_risk=yes');
    expect(buildBenchmarkCompletionReminder(events)).toContain('time-efficiency risk');
  });

  it('tracks invalid tool actions as first-class trajectory evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkInvalidToolActionEvent({
        seq: 2,
        tool: 'web_search_exa',
        reason: 'unknown_tool',
        input: { argumentsPreview: '{"query":"agent leaderboard"}' },
        evidence: 'tool "web_search_exa" is not registered',
      }),
      makeBenchmarkInvalidToolActionEvent({
        seq: 3,
        tool: 'write_file',
        reason: 'malformed_json',
        input: { argumentsPreview: '{"file_path":"index.html", bad' },
        evidence: 'could not parse tool arguments as JSON: Unexpected token',
      }),
    ];

    const invalid = buildBenchmarkInvalidToolActionEvents(events);
    expect(invalid).toEqual([
      expect.objectContaining({ seq: 2, tool: 'web_search_exa', reason: 'unknown_tool' }),
      expect.objectContaining({ seq: 3, tool: 'write_file', reason: 'malformed_json' }),
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.invalidToolActionCount).toBe(2);
    expect(quality.invalidToolActionPercent).toBe(66.67);
    expect(quality.invalidToolActionEvents).toEqual(invalid);
    expect(quality.warnings.join('\n')).toContain('invalid tool action(s) occurred');
    expect(quality.processDefects.map((d) => d.code)).toContain('invalid_tool_actions');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('invalid_actions=2 invalid_action_pct=66.67');
    expect(buildBenchmarkCompletionReminder(events)).toContain('invalid tool action(s) occurred');
  });

  it('preserves verifier output tails for count and failure evidence', () => {
    const noisyHead = Array.from({ length: 260 }, (_, i) => `install log line ${i} compiling dependency`).join('\n');
    const output = [
      noisyHead,
      'FAIL  tests/long-output.test.ts > long output > keeps final summary',
      'AssertionError: expected final summary to be visible',
      'Tests  1 failed | 99 passed (100)',
    ].join('\n');
    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'bash',
      input: { command: 'npx vitest run tests/long-output.test.ts' },
      output,
      isError: true,
      elapsedMs: 1234,
    });

    expect(output.length).toBeGreaterThan(4000);
    expect(event.outputPreview).toContain('tail follows');
    expect(event.outputPreview).toContain('Tests  1 failed | 99 passed (100)');
    expect(event.outputPreview).toContain('tests/long-output.test.ts > long output > keeps final summary');

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-long-verifier',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages: [],
      events: [event],
    });

    expect(summary.events[0].outputPreview).toContain('Tests  1 failed | 99 passed (100)');
    expect(summary.verificationEvidence.extracted[0]).toMatchObject({
      framework: 'vitest',
      failed: 1,
      passed: 99,
      total: 100,
    });
    expect(summary.verificationEvidence.failureSignatures[0]).toMatchObject({
      seq: 1,
      tests: ['tests/long-output.test.ts > long output > keeps final summary'],
      files: ['tests/long-output.test.ts'],
      errors: ['AssertionError: expected final summary to be visible'],
    });
  });

  it('treats timeout-only verifier failures as inconclusive reproduction evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: [
          '(no output)',
          '[command timed out after 1000ms. Try a different strategy.]',
          '[bash status: timedOut=true truncated=false omittedLines=0 omittedChars=0 fullLog=C:\\repo\\.ventipus\\bash-output\\timeout.log]',
        ].join('\n'),
        isError: true,
        elapsedMs: 1000,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const incomplete = buildBenchmarkIncompleteVerifierEvents(events);
    expect(incomplete).toEqual([
      {
        seq: 3,
        command: 'npm test -- app',
        timedOut: true,
        truncated: false,
        omittedLines: 0,
        omittedChars: 0,
        fullLog: 'C:\\repo\\.ventipus\\bash-output\\timeout.log',
        conclusiveFailureEvidence: false,
        reason: 'verifier timed out without parsed failure evidence',
      },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.firstFailedVerificationSeq).toBe(3);
    expect(quality.firstConclusiveFailedVerificationSeq).toBeNull();
    expect(quality.failingReproductionBeforeFirstEdit).toBe(false);
    expect(quality.incompleteVerifierCount).toBe(1);
    expect(quality.incompleteVerifierEvents).toEqual(incomplete);
    expect(quality.inconclusiveVerifierEvents).toEqual(incomplete);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'no_failing_reproduction',
      'inconclusive_verifier_failure',
    ]);
    expect(quality.warnings.join('\n')).toContain('inconclusive verifier failure(s)');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('incomplete=1 inconclusive=1');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Verifier evidence: last=ok#7');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('incomplete=1 inconclusive=1, latest_failure=#3');
    expect(buildBenchmarkCompletionReminder(events)).toContain('timeout/truncation makes evidence inconclusive');
  });

  it('keeps timed-out verifier failures conclusive when failure evidence is visible', () => {
    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'bash',
      input: { command: 'npx vitest run tests/app.test.ts' },
      output: [
        'FAIL  tests/app.test.ts > app > handles edge case',
        'AssertionError: expected true to be false',
        'Tests  1 failed | 9 passed (10)',
        '[command timed out after 1000ms. Try a different strategy.]',
        '[bash status: timedOut=true truncated=false omittedLines=0 omittedChars=0 fullLog=C:\\repo\\.ventipus\\bash-output\\timeout-with-failure.log]',
      ].join('\n'),
      isError: true,
      elapsedMs: 1000,
    });

    const incomplete = buildBenchmarkIncompleteVerifierEvents([event]);
    expect(incomplete[0]).toMatchObject({
      seq: 1,
      timedOut: true,
      truncated: false,
      conclusiveFailureEvidence: true,
      reason: 'verifier timed out after parsed failure evidence was visible',
    });
    const evidence = buildBenchmarkVerificationEvidence([event]);
    expect(evidence.incompleteRuns[0]).toMatchObject({ conclusiveFailureEvidence: true });
    expect(evidence.extracted[0]).toMatchObject({ framework: 'vitest', failed: 1, passed: 9, total: 10 });
    expect(buildBenchmarkTrajectoryQuality([event]).firstConclusiveFailedVerificationSeq).toBe(1);
  });

  it('scores benchmark trajectories and builds completion reminders', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'failing',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'passing narrow',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'passing broad',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.benchmarkContextUsed).toBe(true);
    expect(quality.localizationBeforeFirstEdit).toBe(true);
    expect(quality.reproductionBeforeFirstEdit).toBe(true);
    expect(quality.failingReproductionBeforeFirstEdit).toBe(true);
    expect(quality.validationAfterFirstEdit).toBe(true);
    expect(quality.passingValidationAfterFirstEdit).toBe(true);
    expect(quality.validationAfterLastEdit).toBe(true);
    expect(quality.passingValidationAfterLastEdit).toBe(true);
    expect(quality.broadValidationAfterFirstEdit).toBe(true);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(true);
    expect(quality.broadValidationAfterLastEdit).toBe(true);
    expect(quality.passingBroadValidationAfterLastEdit).toBe(true);
    expect(quality.firstBroadValidationAfterFirstEditSeq).toBe(7);
    expect(quality.lastEditSeq).toBe(4);
    expect(quality.successfulVerificationCount).toBe(2);
    expect(quality.failedVerificationCount).toBe(1);
    expect(quality.incompleteVerifierCount).toBe(0);
    expect(quality.incompleteVerifierEvents).toEqual([]);
    expect(quality.inconclusiveVerifierEvents).toEqual([]);
    expect(quality.ciWorkflowCommandCount).toBe(0);
    expect(quality.ciVerifierCommands).toEqual([]);
    expect(quality.ciValidationAfterFirstEdit).toBeNull();
    expect(quality.passingCiValidationAfterFirstEdit).toBeNull();
    expect(quality.ciValidationAfterLastEdit).toBeNull();
    expect(quality.passingCiValidationAfterLastEdit).toBeNull();
    expect(quality.firstCiValidationAfterFirstEditSeq).toBeNull();
    expect(quality.firstSuccessfulVerificationSeq).toBe(5);
    expect(quality.firstFailedVerificationSeq).toBe(3);
    expect(quality.firstConclusiveFailedVerificationSeq).toBe(3);
    expect(quality.postEditDiffReview).toBe(true);
    expect(quality.diffReviewAfterLastEdit).toBe(true);
    expect(quality.firstPostEditDiffReviewSeq).toBe(6);
    expect(quality.firstDiffReviewAfterLastEditSeq).toBe(6);
    expect(quality.lastPostEditVerificationSeq).toBe(7);
    expect(quality.lastPostEditVerificationStatus).toBe('ok');
    expect(quality.lastPostEditVerificationConclusiveFailure).toBe(false);
    expect(quality.finalEditVerificationCount).toBe(2);
    expect(quality.finalEditPassingVerificationCount).toBe(2);
    expect(quality.stableValidationAfterLastEdit).toBe(true);
    expect(quality.processScore).toBe(100);
    expect(quality.processDefects).toEqual([]);
    expect(quality.taskContractSignalCount).toBe(0);
    expect(quality.taskContractChecklistAfterContext).toBeNull();
    expect(quality.noEditContractDetected).toBe(false);
    expect(quality.editAfterNoEditContract).toBe(false);
    expect(quality.editTargetCount).toBe(1);
    expect(quality.localizedEditTargetCount).toBe(1);
    expect(quality.unlocalizedEditTargetEvents).toEqual([]);
    expect(quality.redundantToolCallCount).toBe(0);
    expect(quality.redundantToolCallEvents).toEqual([]);
    expect(quality.redundantVerifierCount).toBe(0);
    expect(quality.redundantVerifierEvents).toEqual([]);
    expect(quality.scratchArtifactPermissionDetected).toBe(false);
    expect(quality.scratchArtifactEvents).toEqual([]);
    expect(quality.testEditPermissionDetected).toBe(false);
    expect(quality.testHarnessEditEvents).toEqual([]);
    expect(quality.warnings).toEqual([]);
    expect(buildBenchmarkCompletionReminder(events)).toBeNull();
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('localize_before_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ok=2 fail=1');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('incomplete=0 inconclusive=0');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('failing_reproduce_before_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('broad_validate_after_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('latest_post_edit_verifier=ok');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_validate_after_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_verifiers=2 final_ok=2 stable_final=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('stable_final_validate=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_broad_validate_after_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ci_verifiers=0');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ci_validate_after_edit=n/a');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('diff_review_after_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_diff_review_after_edit=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('redundant_calls=0');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('regression_cycles=0');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Process score: 100/100, defects=0');
  });

  it('flags single narrow passing validation as lucky-pass risk', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const value = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.passingValidationAfterLastEdit).toBe(true);
    expect(quality.finalEditVerificationCount).toBe(1);
    expect(quality.finalEditPassingVerificationCount).toBe(1);
    expect(quality.stableValidationAfterLastEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toContain('single_pass_post_edit_validation');
    expect(quality.warnings.join('\n')).toContain('lucky-pass risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('lucky-pass risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_verifiers=1 final_ok=1 stable_final=no');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('stable_final_validate=no');
  });

  it('flags post-edit pass-fail-pass verifier regression cycles', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 99 passed, 100 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.postEditRegressionCycleCount).toBe(1);
    expect(quality.postEditRegressionCycleEvents).toEqual([{
      firstPassingSeq: 5,
      failingSeq: 6,
      recoveryPassingSeq: 7,
      failingCommand: 'npm test',
      recoveryCommand: 'npm test',
      broadFailure: true,
    }]);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(true);
    expect(quality.stableValidationAfterLastEdit).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['post_edit_regression_cycle']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'low',
      seq: 6,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('post-edit regression cycle detected');
    expect(buildBenchmarkCompletionReminder(events)).toContain('post-edit regression cycle');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('regression_cycles=1');
  });

  it('recognizes CI-derived verifier commands from benchmark_context output', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '## CI Workflow Hints',
          '- ci verifier: .github/workflows/ci.yml:9: pnpm run test',
          '- ci verifier candidates: pnpm run test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'pnpm run test' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'pnpm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.ciWorkflowCommandCount).toBe(1);
    expect(quality.ciVerifierCommands).toEqual(['pnpm run test']);
    expect(quality.ciValidationAfterFirstEdit).toBe(true);
    expect(quality.passingCiValidationAfterFirstEdit).toBe(true);
    expect(quality.ciValidationAfterLastEdit).toBe(true);
    expect(quality.passingCiValidationAfterLastEdit).toBe(true);
    expect(quality.firstCiValidationAfterFirstEditSeq).toBe(5);
    expect(quality.processDefects).toEqual([]);
    expect(quality.processScore).toBe(100);
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ci_verifiers=1');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ci_validate_after_edit=yes');
    expect(buildBenchmarkCompletionReminder(events)).toBeNull();
  });

  it('flags missing CI-derived validation after narrow and broad validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: '## CI Workflow Hints\n- ci verifier: .github/workflows/ci.yml:12: pnpm run lint',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'pnpm run test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'pnpm run test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(true);
    expect(quality.ciWorkflowCommandCount).toBe(1);
    expect(quality.ciValidationAfterFirstEdit).toBe(false);
    expect(quality.passingCiValidationAfterFirstEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['missing_ci_post_edit_validation']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'medium',
      seq: 4,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('CI verifier command(s) were discovered');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('ci_validate_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('CI-derived test/build/lint commands');
  });

  it('flags CI-derived validation that runs but does not pass', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: '## CI Workflow Hints\n- ci verifier: .github/workflows/ci.yml:12: pnpm run lint',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'pnpm run test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'pnpm run lint' },
        output: 'lint failed',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'pnpm run test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.ciValidationAfterFirstEdit).toBe(true);
    expect(quality.passingCiValidationAfterFirstEdit).toBe(false);
    expect(quality.firstCiValidationAfterFirstEditSeq).toBe(5);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['no_passing_ci_post_edit_validation']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'high',
      seq: 5,
    });
    expect(quality.processScore).toBe(80);
    expect(quality.warnings.join('\n')).toContain('CI-derived post-edit verifier ran but did not pass');
  });

  it('flags later edits that are not followed by final CI-derived validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: '## CI Workflow Hints\n- ci verifier: .github/workflows/ci.yml:12: pnpm run lint',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'pnpm run test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'pnpm run lint' },
        output: 'lint passed',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'pnpm run test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'new', new_string: 'newer' },
        output: 'edited again',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'bash',
        input: { command: 'pnpm run test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 10,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.passingCiValidationAfterFirstEdit).toBe(true);
    expect(quality.ciValidationAfterLastEdit).toBe(false);
    expect(quality.passingCiValidationAfterLastEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['missing_final_ci_post_edit_validation']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'medium',
      seq: 8,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('no matching CI verifier ran after the final edit');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_ci_validate_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('CI-derived test/build/lint commands');
  });

  it('flags later edits that are not followed by final validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'new', new_string: 'newer' },
        output: 'edited again',
        isError: false,
        elapsedMs: 2,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.validationAfterFirstEdit).toBe(true);
    expect(quality.passingValidationAfterFirstEdit).toBe(true);
    expect(quality.validationAfterLastEdit).toBe(false);
    expect(quality.passingValidationAfterLastEdit).toBe(false);
    expect(quality.lastEditSeq).toBe(8);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'missing_final_post_edit_validation',
      'post_success_mutation_without_revalidation',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'high',
      seq: 8,
    });
    expect(quality.postSuccessMutationCount).toBe(1);
    expect(quality.processScore).toBe(75);
    expect(quality.warnings.join('\n')).toContain('final edit was not followed by a verifier');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_validate_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('run a verifier after the final edit');
  });

  it('flags later validated edits without final diff review', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'new', new_string: 'newer' },
        output: 'edited again',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 10,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.postEditDiffReview).toBe(true);
    expect(quality.diffReviewAfterLastEdit).toBe(false);
    expect(quality.firstPostEditDiffReviewSeq).toBe(6);
    expect(quality.firstDiffReviewAfterLastEditSeq).toBeNull();
    expect(quality.passingValidationAfterLastEdit).toBe(true);
    expect(quality.passingBroadValidationAfterLastEdit).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['missing_final_post_edit_diff_review']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'execution_control',
      severity: 'low',
      seq: 8,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('no diff/status review ran after the final edit');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_diff_review_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('git diff or git status');
  });

  it('flags later edits after broad validation without final broad validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'new', new_string: 'newer' },
        output: 'edited again',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 10,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(true);
    expect(quality.passingValidationAfterLastEdit).toBe(true);
    expect(quality.passingBroadValidationAfterLastEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'missing_final_broad_post_edit_validation',
      'single_pass_post_edit_validation',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'medium',
      seq: 8,
    });
    expect(quality.processScore).toBe(85);
    expect(quality.warnings.join('\n')).toContain('no passing broad verifier ran after the final edit');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('final_broad_validate_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('broad harness/build/test command');
  });

  it('flags repeated read/search calls before edit or verification progress', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts:1:bug',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'grep',
        input: { path: 'src', pattern: 'bug' },
        output: 'src/app.ts:1:bug',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts:1:bug',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 10,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const redundant = buildBenchmarkRedundantToolCallEvents(events);
    expect(redundant).toEqual([
      {
        seq: 4,
        tool: 'grep',
        target: '/bug/ in src',
        repeatOfSeq: 2,
        repeatCount: 1,
        reason: 'same read/search tool input repeated without intervening edit or verification progress',
      },
      {
        seq: 5,
        tool: 'grep',
        target: '/bug/ in src',
        repeatOfSeq: 2,
        repeatCount: 2,
        reason: 'same read/search tool input repeated without intervening edit or verification progress',
      },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.redundantToolCallCount).toBe(2);
    expect(quality.redundantToolCallEvents).toEqual(redundant);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['redundant_tool_calls']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'execution_control',
      severity: 'low',
      seq: 4,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('redundant tool calls repeated the same read/search inputs');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('redundant_calls=2');
    expect(buildBenchmarkCompletionReminder(events)).toContain('repeating identical read/search calls');
  });

  it('flags repeated failing verifier commands without intervening progress', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm   test   -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const redundant = buildBenchmarkRedundantVerifierEvents(events);
    expect(redundant).toEqual([
      {
        seq: 4,
        command: 'npm   test   -- app',
        repeatOfSeq: 3,
        repeatCount: 1,
        reason: 'same failing verifier command repeated without intervening edit or inspection progress',
      },
      {
        seq: 5,
        command: 'npm test -- app',
        repeatOfSeq: 3,
        repeatCount: 2,
        reason: 'same failing verifier command repeated without intervening edit or inspection progress',
      },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.redundantVerifierCount).toBe(2);
    expect(quality.redundantVerifierEvents).toEqual(redundant);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'repeated_tool_errors',
      'redundant_verifier_reruns',
    ]);
    expect(quality.processDefects.find((d) => d.code === 'redundant_verifier_reruns')).toMatchObject({
      category: 'execution_control',
      severity: 'low',
      seq: 4,
    });
    expect(quality.processScore).toBe(85);
    expect(quality.warnings.join('\n')).toContain('redundant verifier reruns repeated the same failing command');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('redundant_verifiers=2');
    expect(buildBenchmarkCompletionReminder(events)).toContain('repeating identical failing verifier commands');
  });

  it('flags blind repair edits after post-edit failed verifiers without inspection', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'almost' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'almost', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const blindRepairs = buildBenchmarkBlindRepairEvents(events);
    expect(blindRepairs).toEqual([
      {
        failedVerificationSeq: 5,
        editSeq: 6,
        command: 'npm test -- app',
        editTarget: 'src/app.ts',
        reason: 'failed verifier was followed by an edit before read/search inspection and without parsed failure-file evidence',
      },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.blindRepairCount).toBe(1);
    expect(quality.blindRepairEvents).toEqual(blindRepairs);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['blind_repair_after_failed_verifier']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'localization',
      severity: 'low',
      seq: 6,
    });
    expect(quality.warnings.join('\n')).toContain('blind repair after failed verifier');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('blind_repairs=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('inspect failed verifier output');
  });

  it('does not flag the first repair after a pre-edit failing reproduction', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];

    expect(buildBenchmarkBlindRepairEvents(events)).toEqual([]);
    expect(buildBenchmarkTrajectoryQuality(events).blindRepairCount).toBe(0);
  });

  it('does not flag failed-verifier repairs after inspection or matching failure-file evidence', () => {
    const inspectedEvents = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'almost' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'grep',
        input: { pattern: 'almost', path: 'src/app.ts' },
        output: 'src/app.ts:1:almost',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'almost', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];

    expect(buildBenchmarkBlindRepairEvents(inspectedEvents)).toEqual([]);

    const failureFileEvents = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'almost' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'FAIL src/app.ts\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'almost', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];

    expect(buildBenchmarkBlindRepairEvents(failureFileEvents)).toEqual([]);
  });

  it('flags repair edits that ignore parsed source failure-file evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/config.ts' },
        output: 'export const mode = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'FAIL src/app.ts\nsrc/app.ts:42: AssertionError: expected old to equal new\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'grep',
        input: { pattern: 'mode', path: 'src/config.ts' },
        output: 'src/config.ts:1:export const mode = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'edit_file',
        input: { file_path: 'src/config.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/config.ts' },
        output: 'diff --git a/src/config.ts b/src/config.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const unaligned = buildBenchmarkFailureUnalignedRepairEvents(events);
    expect(unaligned).toEqual([{
      failedVerificationSeq: 3,
      editSeq: 5,
      command: 'npm test -- app',
      failureFiles: ['src/app.ts'],
      inspectedTargets: ['/mode/ in src/config.ts'],
      editTarget: 'src/config.ts',
      reason: 'repair inspected only targets that did not match parsed source failure files before editing elsewhere',
    }]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.failureAlignedRepairCount).toBe(0);
    expect(quality.failureUnalignedRepairCount).toBe(1);
    expect(quality.failureUnalignedRepairEvents).toEqual(unaligned);
    expect(quality.blindRepairEvents).toEqual([]);
    expect(quality.unlocalizedEditTargetEvents).toEqual([]);
    expect(quality.processDefects.map((defect) => defect.code)).toEqual(['failure_unaligned_repair']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'localization',
      severity: 'medium',
      seq: 5,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('failed-verifier repair target was not aligned with parsed source failure files');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('failure_aligned_repairs=0 failure_unaligned_repairs=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('parsed source failure files');
  });

  it('allows repairs that edit or inspect parsed source failure files', () => {
    const directEditEvents = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'FAIL src/app.ts\nsrc/app.ts:42: AssertionError\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];
    expect(buildBenchmarkFailureUnalignedRepairEvents(directEditEvents)).toEqual([]);
    expect(buildBenchmarkTrajectoryQuality(directEditEvents).failureAlignedRepairCount).toBe(1);

    const inspectedFailureEvents = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/config.ts' },
        output: 'export const mode = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'FAIL src/app.ts\nsrc/app.ts:42: AssertionError\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'import { mode } from "./config";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'edit_file',
        input: { file_path: 'src/config.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];
    expect(buildBenchmarkFailureUnalignedRepairEvents(inspectedFailureEvents)).toEqual([]);
    expect(buildBenchmarkTrajectoryQuality(inspectedFailureEvents).failureAlignedRepairCount).toBe(1);
  });

  it('flags verifier failures that look like unresolved environment setup failures', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: [
          '> test',
          'Error: Cannot find module \'vitest\'',
          'Require stack:',
          '- /repo/node_modules/.bin/vitest',
        ].join('\n'),
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const failures = buildBenchmarkEnvironmentSetupFailureEvents(events);
    expect(failures).toEqual([{
      seq: 3,
      command: 'npm test',
      reason: 'javascript dependency or build artifact missing',
      evidence: "Error: Cannot find module 'vitest'",
    }]);
    expect(buildBenchmarkEnvironmentSetupEvents(events)).toEqual([]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.environmentSetupFailureCount).toBe(1);
    expect(quality.unresolvedEnvironmentSetupFailureCount).toBe(1);
    expect(quality.environmentSetupCount).toBe(0);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['unresolved_environment_setup_failure']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'execution_control',
      severity: 'medium',
      seq: 3,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('unprepared environment or missing dependency/build artifact');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('env_setup_failures=1 unresolved_env=1 env_setup=0');
    expect(buildBenchmarkCompletionReminder(events)).toContain('project-native setup/restore/install');
  });

  it('treats successful setup after a dependency verifier failure as environment reconstruction evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Error: Cannot find module \'vitest\'',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm ci' },
        output: 'added 120 packages',
        isError: false,
        elapsedMs: 1000,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests  3 passed (3)',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const setupEvents = buildBenchmarkEnvironmentSetupEvents(events);
    expect(setupEvents).toEqual([{
      seq: 4,
      command: 'npm ci',
      status: 'ok',
      kind: 'node package install',
    }]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.environmentSetupFailureCount).toBe(1);
    expect(quality.unresolvedEnvironmentSetupFailureCount).toBe(0);
    expect(quality.environmentSetupCount).toBe(1);
    expect(quality.successfulEnvironmentSetupCount).toBe(1);
    expect(quality.environmentSetupEvents).toEqual(setupEvents);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings.join('\n')).not.toContain('unprepared environment');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('env_setup_failures=1 unresolved_env=0 env_setup=1 env_setup_ok=1');

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-environment-reconstruction',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 2500,
      messages: [],
      events,
    });
    expect(summary.experienceCard.environmentReconstruction).toMatchObject({
      setupFailureCount: 1,
      unresolvedSetupFailureCount: 0,
      setupCount: 1,
      successfulSetupCount: 1,
      setupEvents: [{
        seq: 4,
        command: 'npm ci',
        status: 'ok',
        kind: 'node package install',
      }],
      setupFailures: [{
        seq: 3,
        command: 'npm test',
        reason: 'javascript dependency or build artifact missing',
        evidence: "Error: Cannot find module 'vitest'",
      }],
      unresolvedSetupFailures: [],
    });
  });

  it('tracks dependency manifest edits that lack install or lockfile setup evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "dependencies": { "left-pad": "1.0.0" }, "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'FAIL src/app.test.ts > uses dependency\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "dependencies": { "left-pad": "1.0.0" }, "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'edit_file',
        input: { file_path: 'package.json', old_string: '"left-pad": "1.0.0"', new_string: '"left-pad": "1.1.0"' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- package.json' },
        output: 'diff --git a/package.json b/package.json',
        isError: false,
        elapsedMs: 5,
      }),
    ];

    expect(buildBenchmarkDependencyEditEvents(events)).toEqual([{
      seq: 5,
      tool: 'edit_file',
      target: 'package.json',
      ecosystem: 'node',
      kind: 'manifest',
    }]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.dependencyManifestEditCount).toBe(1);
    expect(quality.dependencyLockfileEditCount).toBe(0);
    expect(quality.dependencySetupAfterManifestEdit).toBe(false);
    expect(quality.passingDependencySetupAfterManifestEdit).toBe(false);
    expect(quality.dependencyValidationAfterManifestEdit).toBe(true);
    expect(quality.passingDependencyValidationAfterManifestEdit).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toContain('dependency_manifest_without_setup');
    expect(quality.processDefects.find((d) => d.code === 'dependency_manifest_without_setup')).toMatchObject({
      category: 'execution_control',
      severity: 'low',
      seq: 5,
    });
    expect(quality.warnings.join('\n')).toContain('dependency manifest edit(s) lacked a later package setup/install/lockfile command');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('dependency_manifests=1 dependency_lockfiles=0 dependency_setup_after_manifest=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('package-manager install/update/lockfile step');
  });

  it('treats dependency setup after manifest and lockfile edits as validated upgrade evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "dependencies": { "left-pad": "1.0.0" }, "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'FAIL src/app.test.ts > uses dependency\nTests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'read_file',
        input: { file_path: 'package.json' },
        output: '{ "dependencies": { "left-pad": "1.0.0" }, "scripts": { "test": "vitest run" } }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'apply_patch',
        input: {
          patch: [
            '*** Begin Patch',
            '*** Update File: package.json',
            '@@',
            '-    "left-pad": "1.0.0"',
            '+    "left-pad": "1.1.0"',
            '*** Update File: package-lock.json',
            '@@',
            '-      "version": "1.0.0"',
            '+      "version": "1.1.0"',
            '*** End Patch',
          ].join('\n'),
        },
        output: 'Done',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm install' },
        output: 'up to date',
        isError: false,
        elapsedMs: 1000,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'git status --short' },
        output: ' M package.json\n M package-lock.json',
        isError: false,
        elapsedMs: 5,
      }),
    ];

    const edits = buildBenchmarkDependencyEditEvents(events);
    expect(edits.map((event) => `${event.kind}:${event.target}`)).toEqual([
      'manifest:package.json',
      'lockfile:package-lock.json',
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.dependencyManifestEditCount).toBe(1);
    expect(quality.dependencyLockfileEditCount).toBe(1);
    expect(quality.dependencySetupAfterManifestEdit).toBe(true);
    expect(quality.passingDependencySetupAfterManifestEdit).toBe(true);
    expect(quality.dependencyValidationAfterManifestEdit).toBe(true);
    expect(quality.passingDependencyValidationAfterManifestEdit).toBe(true);
    expect(quality.firstDependencySetupAfterManifestEditSeq).toBe(6);
    expect(quality.firstDependencyValidationAfterManifestEditSeq).toBe(7);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).toEqual([]);

    const summary = buildBenchmarkTraceSummary({
      sessionId: 'session-dependency-upgrade',
      mode: 'benchmark',
      cwd: 'C:/repo',
      config,
      startedAtMs: 1000,
      endedAtMs: 3000,
      messages: [],
      events,
    });
    expect(summary.experienceCard.dependencyUpgrade).toMatchObject({
      manifestEditCount: 1,
      lockfileEditCount: 1,
      setupAfterManifestEdit: true,
      passingSetupAfterManifestEdit: true,
      validationAfterManifestEdit: true,
      passingValidationAfterManifestEdit: true,
      firstSetupAfterManifestEditSeq: 6,
      firstValidationAfterManifestEditSeq: 7,
      manifestEdits: [{
        seq: 5,
        tool: 'apply_patch',
        target: 'package.json',
        ecosystem: 'node',
        kind: 'manifest',
      }],
      lockfileEdits: [{
        seq: 5,
        tool: 'apply_patch',
        target: 'package-lock.json',
        ecosystem: 'node',
        kind: 'lockfile',
      }],
    });
  });

  it('warns when full skills are loaded before local context or in bulk', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'skill_view',
        input: { name: 'python-patterns' },
        output: '# Python Patterns\nUse modern Python packaging guidance.',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'skill_view',
        input: { name: 'python-testing' },
        output: '# Python Testing\nPrefer pytest unless repo evidence differs.',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'skill_view',
        input: { name: 'pytest' },
        output: '# Pytest\nTest guidance.',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'benchmark_context',
        input: {},
        output: '# Benchmark Context\nmanifests: package.json\n',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    expect(buildBenchmarkSkillViewEvents(events)).toEqual([
      { seq: 1, name: 'Python Patterns' },
      { seq: 2, name: 'Python Testing' },
      { seq: 3, name: 'Pytest' },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.skillViewCount).toBe(3);
    expect(quality.skillNames).toEqual(['Python Patterns', 'Python Testing', 'Pytest']);
    expect(quality.skillLoadedBeforeLocalContext).toBe(true);
    expect(quality.excessiveSkillViewCount).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toContain('skill_loaded_before_local_context');
    expect(quality.processDefects.map((d) => d.code)).toContain('excessive_skill_loading');
    expect(quality.warnings.join('\n')).toContain('skill prompt loaded before local task/repo context');
    expect(quality.warnings.join('\n')).toContain('multiple full skill prompts');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('skill_views=3');
    expect(buildBenchmarkCompletionReminder(events)).toContain('verify skill domain/version fit');
  });

  it('flags scratch/probe artifacts left in a benchmark patch', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'write_file',
        input: { file_path: 'debug_repro.py', content: 'print("probe")\n' },
        output: 'created debug_repro.py',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts debug_repro.py' },
        output: 'diff --git a/src/app.ts b/src/app.ts\ndiff --git a/debug_repro.py b/debug_repro.py',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const scratchEvents = buildBenchmarkScratchArtifactEvents(events);
    expect(scratchEvents).toEqual([
      {
        seq: 5,
        tool: 'write_file',
        target: 'debug_repro.py',
        reason: 'file name resembles a temporary scratch/probe/debug/repro artifact',
      },
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.scratchArtifactPermissionDetected).toBe(false);
    expect(quality.scratchArtifactEvents).toEqual(scratchEvents);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['scratch_artifact_left_in_patch']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'requirement_fidelity',
      severity: 'low',
      seq: 5,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('scratch/probe artifact(s) were edited without task-contract permission');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('scratch_artifacts=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('remove or justify scratch/probe artifacts');
  });

  it('allows scratch artifacts when the task contract asks for a reproduction script', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          'context',
          '## Task Contract Signals',
          '- TASK.md: Create a minimal reproduction script for the parser crash.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: { items: [{ text: 'Create a minimal reproduction script for the parser crash.', status: 'pending' }] },
        output: 'Todo list updated (1 item)',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'write_file',
        input: { file_path: 'repro_parser.py', content: 'print("repro")\n' },
        output: 'created repro_parser.py',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- repro_parser.py' },
        output: 'diff --git a/repro_parser.py b/repro_parser.py',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Create a minimal reproduction script for the parser crash.', status: 'completed' },
          ],
        },
        output: 'Todo list updated (1 item):\n- [x] Create a minimal reproduction script for the parser crash.',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.taskContractChecklistAfterContext).toBe(true);
    expect(quality.scratchArtifactPermissionDetected).toBe(true);
    expect(quality.scratchArtifactEvents).toEqual([
      {
        seq: 4,
        tool: 'write_file',
        target: 'repro_parser.py',
        reason: 'file name resembles a temporary scratch/probe/debug/repro artifact',
      },
    ]);
    expect(quality.processDefects).toEqual([]);
    expect(quality.processScore).toBe(100);
    expect(quality.warnings).toEqual([]);
    expect(buildBenchmarkCompletionReminder(events)).toBeNull();
  });

  it('flags validated source edits without a post-edit diff review', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.postEditDiffReview).toBe(false);
    expect(quality.firstPostEditDiffReviewSeq).toBeNull();
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'missing_post_edit_diff_review',
      'single_pass_post_edit_validation',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'execution_control',
      severity: 'low',
      seq: 4,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('no post-edit diff/status review was recorded');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('diff_review_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('git diff or git status');
  });

  it('flags diff-reviewed repairs without broad post-edit validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git status --short' },
        output: ' M src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.postEditDiffReview).toBe(true);
    expect(quality.broadValidationAfterFirstEdit).toBe(false);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(false);
    expect(quality.firstBroadValidationAfterFirstEditSeq).toBeNull();
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'missing_broad_post_edit_validation',
      'single_pass_post_edit_validation',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'medium',
      seq: 4,
    });
    expect(quality.processScore).toBe(85);
    expect(quality.warnings.join('\n')).toContain('no broad post-edit verifier was recorded');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('broad_validate_after_edit=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('broad harness/build/test command');
  });

  it('flags broad post-edit validation that still fails', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 1 failed, 99 passed, 100 total',
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.broadValidationAfterFirstEdit).toBe(true);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(false);
    expect(quality.firstBroadValidationAfterFirstEditSeq).toBe(7);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['no_passing_broad_post_edit_validation']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'high',
      seq: 7,
    });
    expect(quality.processScore).toBe(80);
    expect(quality.warnings.join('\n')).toContain('broad post-edit verifier ran but did not pass');
    expect(buildBenchmarkCompletionReminder(events)).toContain('broad post-edit verifier');
  });

  it('flags latest post-edit verifier failure after earlier passing validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.passingValidationAfterFirstEdit).toBe(true);
    expect(quality.passingBroadValidationAfterFirstEdit).toBe(true);
    expect(quality.lastPostEditVerificationSeq).toBe(8);
    expect(quality.lastPostEditVerificationStatus).toBe('error');
    expect(quality.lastPostEditVerificationConclusiveFailure).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['latest_post_edit_verifier_failed']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'validation',
      severity: 'high',
      seq: 8,
    });
    expect(quality.processScore).toBe(80);
    expect(quality.warnings.join('\n')).toContain('latest verifier after editing failed');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('latest_post_edit_verifier=error');
    expect(buildBenchmarkCompletionReminder(events)).toContain('latest verifier failure');
  });

  it('scores task-contract checklist handling from benchmark_context output', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Preserve the CSV export format exactly.',
          '- TASK.md: Must show billing totals with two decimal places.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Preserve the CSV export format exactly.', status: 'pending' },
            { content: 'Show billing totals with two decimal places.', status: 'pending' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Preserve the CSV export format exactly.\n- [ ] Show billing totals with two decimal places.',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    expect(countTaskContractSignals(events)).toBe(2);
    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.taskContractSignalCount).toBe(2);
    expect(quality.taskContractChecklistUsed).toBe(true);
    expect(quality.taskContractChecklistAfterContext).toBe(true);
    expect(quality.firstTaskContractSeq).toBe(1);
    expect(quality.firstTodoSeq).toBe(2);
    expect(quality.processScore).toBe(100);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).toEqual([]);
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Task contract: signals=2, checklist=yes, complete=no, incomplete=2, no_edit=no, edited=no');
    expect(buildBenchmarkCompletionReminder(events)).toBeNull();
  });

  it('treats task instruction excerpts as task-contract signal evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Instruction Excerpts',
          '- task.yaml:4: description: Create /app/filled_form.pdf exactly.',
          '- task.yaml:5: description: Include sha256 without a hyphen in the verification output.',
          'Use these exact lines as the initial task contract, then verify them against the full instruction file before editing.',
          '',
          '## Task Contract Signals',
          '(no explicit acceptance criteria, requirements, success criteria, or expected-output lines found in visible task files)',
          '',
          '## Likely Verification Commands',
          '- bash run-tests.sh',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(countTaskContractSignals(events)).toBe(2);
    expect(quality.taskContractSignalCount).toBe(2);
    expect(quality.taskContractChecklistAfterContext).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toContain('missing_task_contract_checklist');
    expect(buildBenchmarkCompletionReminder(events)).toContain('task contract signals were detected');
  });

  it('warns when task-contract signals are not converted into a todo checklist', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Must preserve the public API route names.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'route', path: 'src' },
        output: 'src/routes.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.taskContractSignalCount).toBe(1);
    expect(quality.taskContractChecklistUsed).toBe(false);
    expect(quality.taskContractChecklistAfterContext).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['missing_task_contract_checklist']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'requirement_fidelity',
      severity: 'medium',
      seq: 1,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('task contract signals were detected');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Task contract: signals=1, checklist=no, complete=no, incomplete=0, no_edit=no, edited=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('todo_write checklist');
  });

  it('flags validated task-contract checklists left incomplete', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Preserve the public API route names.',
          '- TASK.md: Show billing totals with two decimal places.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Preserve the public API route names.', status: 'pending' },
            { content: 'Show billing totals with two decimal places.', status: 'in_progress' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Preserve the public API route names.\n- [-] Show billing totals with two decimal places.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.taskContractChecklistAfterContext).toBe(true);
    expect(quality.taskContractChecklistComplete).toBe(false);
    expect(quality.latestTodoSeq).toBe(2);
    expect(quality.todoIncompleteCount).toBe(2);
    expect(quality.todoIncompleteItems.map((item) => item.status)).toEqual(['pending', 'in_progress']);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['incomplete_task_contract_checklist']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'requirement_fidelity',
      severity: 'medium',
      seq: 2,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('task contract checklist still has incomplete');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Task contract: signals=2, checklist=yes, complete=no, incomplete=2');
    expect(buildBenchmarkCompletionReminder(events)).toContain('todo_write');
  });

  it('treats no-edit contracts as a valid success path when no edits occur', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: No code changes are required if the verifier already passes.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Verify the issue is already resolved.', status: 'pending' },
            { content: 'Do not edit code if the verifier already passes.', status: 'pending' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Verify the issue is already resolved.\n- [ ] Do not edit code if the verifier already passes.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Verify the issue is already resolved.', status: 'completed' },
            { content: 'Do not edit code if the verifier already passes.', status: 'completed' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [x] Verify the issue is already resolved.\n- [x] Do not edit code if the verifier already passes.',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.noEditContractDetected).toBe(true);
    expect(quality.editAfterNoEditContract).toBe(false);
    expect(quality.firstNoEditContractSeq).toBe(1);
    expect(quality.successfulVerificationCount).toBe(1);
    expect(quality.processScore).toBe(100);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).toEqual([]);
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Task contract: signals=1, checklist=yes, complete=yes, incomplete=0, no_edit=yes, edited=no');
    expect(buildBenchmarkCompletionReminder(events)).toBeNull();
  });

  it('flags edits after a no-edit task contract', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: The issue is already fixed; no patch is needed.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Confirm the issue is already fixed.', status: 'pending' },
            { content: 'Avoid code edits unless a failing reproduction appears.', status: 'pending' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Confirm the issue is already fixed.\n- [ ] Avoid code edits unless a failing reproduction appears.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.noEditContractDetected).toBe(true);
    expect(quality.editAfterNoEditContract).toBe(true);
    expect(buildBenchmarkTaskAlignmentSignals(events)).toMatchObject([{
      seq: 4,
      tool: 'edit_file',
      target: 'src/app.ts',
      reason: 'ignored_task_contract',
    }]);
    expect(quality.taskAlignmentRisk).toBe(true);
    expect(quality.taskAlignmentSignalCount).toBe(1);
    expect(quality.taskAlignmentSignals[0]).toMatchObject({
      reason: 'ignored_task_contract',
      seq: 4,
    });
    expect(quality.failingReproductionBeforeFirstEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'edit_despite_no_edit_contract',
      'task_alignment_risk',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'requirement_fidelity',
      severity: 'high',
      seq: 4,
    });
    expect(quality.processScore).toBe(60);
    expect(quality.warnings.join('\n')).not.toContain('no failing reproduction was observed');
    expect(quality.warnings.join('\n')).toContain('no-edit/no-op task contract was detected');
    expect(quality.warnings.join('\n')).toContain('task-alignment risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('Task contract: signals=1, checklist=yes, complete=no, incomplete=2, no_edit=yes, edited=yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('task_alignment_risk=yes task_alignment_signals=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('avoid edit tools when a no-edit/no-op contract is verified');
    expect(buildBenchmarkCompletionReminder(events)).toContain('task-alignment risk');
  });

  it('flags edits to tests or benchmark harness files unless the task contract permits them', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Fix the production parser bug.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [{ content: 'Fix the production parser bug.', status: 'pending' }],
        },
        output: 'Todo list updated (1 item):\n- [ ] Fix the production parser bug.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'tests/parser.test.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'apply_patch',
        input: { patch: '*** Begin Patch\n*** Update File: run-tests.sh\n@@\n- pytest\n+ pytest -q\n*** End Patch\n' },
        output: 'patched',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const risks = buildBenchmarkTestHarnessEditEvents(events);
    expect(risks.map((risk) => risk.target)).toEqual(['tests/parser.test.ts', 'run-tests.sh']);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.testEditPermissionDetected).toBe(false);
    expect(quality.testHarnessEditEvents).toHaveLength(2);
    expect(buildBenchmarkRewardHackSignals(events).map((signal) => signal.reason)).toEqual([
      'verifier_tamper',
      'verifier_tamper',
    ]);
    expect(quality.rewardHackRisk).toBe(true);
    expect(quality.rewardHackSignalCount).toBe(2);
    expect(quality.rewardHackSignals.map((signal) => signal.reason)).toEqual([
      'verifier_tamper',
      'verifier_tamper',
    ]);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'test_harness_edit_without_contract',
      'reward_hack_risk',
    ]);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'benchmark_validity',
      severity: 'high',
      seq: 4,
    });
    expect(quality.processScore).toBe(60);
    expect(quality.warnings.join('\n')).toContain('test/harness/verifier file(s) were edited');
    expect(quality.warnings.join('\n')).toContain('reward-hack risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('test_harness_edits=2');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('reward_hack_risk=yes reward_hack_signals=2');
    expect(buildBenchmarkCompletionReminder(events)).toContain('revert or justify test/harness edits');
    expect(buildBenchmarkCompletionReminder(events)).toContain('reward-hack risk');
  });

  it('allows test edits when the task contract explicitly asks for tests', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Add regression tests for the parser failure.',
          '- TASK.md: Fix the production parser bug.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Add regression tests for the parser failure.', status: 'pending' },
            { content: 'Fix the production parser bug.', status: 'pending' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Add regression tests for the parser failure.\n- [ ] Fix the production parser bug.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'tests/parser.test.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.testEditPermissionDetected).toBe(true);
    expect(quality.testHarnessEditEvents).toHaveLength(1);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).toEqual([]);
  });

  it('flags source edits whose target was not localized before patching', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'parser', path: 'src' },
        output: 'src/other.ts:10:parser helper',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/parser.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const unlocalized = buildBenchmarkUnlocalizedEditEvents(events);
    expect(unlocalized).toEqual([{
      seq: 4,
      tool: 'edit_file',
      target: 'src/parser.ts',
      reason: 'edited source target was not read or found in prior search/verifier output',
    }]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.editTargetCount).toBe(1);
    expect(quality.localizedEditTargetCount).toBe(0);
    expect(quality.unlocalizedEditTargetEvents).toHaveLength(1);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['unlocalized_edit_target']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'localization',
      severity: 'medium',
      seq: 4,
    });
    expect(quality.processScore).toBe(90);
    expect(quality.warnings.join('\n')).toContain('edited target(s) lacked prior file-level localization evidence');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('edit_targets=1 localized=0 unlocalized=1');
    expect(buildBenchmarkCompletionReminder(events)).toContain('Read or search the target file');
  });

  it('flags low local context utilization when broad exploration barely matches edited targets', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/unrelated-a.ts' },
        output: 'export const unused = true;',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'grep',
        input: { pattern: 'billing', path: 'src' },
        output: 'src/unrelated-b.ts:10:billing helper',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'glob',
        input: { pattern: '**/*.md' },
        output: 'README.md',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'list_dir',
        input: { path: 'scripts' },
        output: 'build.js\nrelease.js',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'read_file',
        input: { file_path: 'src/parser.ts' },
        output: 'export function parse(input: string) { return input; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'grep',
        input: { pattern: 'parse', path: 'src' },
        output: 'src/parser.ts:1:export function parse(input: string) { return input; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'edit_file',
        input: { file_path: 'src/parser.ts', old_string: 'return input;', new_string: 'return input.trim();' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 10,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 11,
        tool: 'bash',
        input: { command: 'git diff -- src/parser.ts' },
        output: 'diff --git a/src/parser.ts b/src/parser.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 12,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.editTargetCount).toBe(1);
    expect(quality.localizedEditTargetCount).toBe(1);
    expect(quality.unlocalizedEditTargetEvents).toEqual([]);
    expect(quality.contextUtilizationInspectCount).toBe(6);
    expect(quality.contextUtilizationHitCount).toBe(2);
    expect(quality.contextUtilizationMissCount).toBe(4);
    expect(quality.contextUtilizationPercent).toBe(33.33);
    expect(quality.contextUtilizationRisk).toBe(true);
    expect(quality.contextUtilizationMissEvents.map((event) => event.seq)).toEqual([2, 3, 4, 5]);
    expect(quality.processDefects.map((defect) => defect.code)).toEqual(['low_context_utilization']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'localization',
      severity: 'low',
      seq: 2,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('low context utilization');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('context_utilization=33.33% context_hits=2/6 context_misses=4 context_risk=yes');
    expect(buildBenchmarkCompletionReminder(events)).toContain('narrow broad context gathering');
  });

  it('flags stale edit evidence reused without refreshing current file state', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'Task: fix src/app.ts behavior',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const value = 1;',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'missing', new_string: 'present' },
        output: 'Error: old_string not found in src/app.ts',
        isError: true,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'value = 1', new_string: 'value = 2' },
        output: 'Updated src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const grounding = buildBenchmarkEvidenceGroundingEvents(events);
    expect(grounding).toEqual([
      expect.objectContaining({
        seq: 5,
        tool: 'edit_file',
        target: 'src/app.ts',
        staleSeq: 4,
        staleTool: 'edit_file',
        reason: expect.stringContaining('stale/no-effect'),
      }),
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.evidenceGroundingRisk).toBe(true);
    expect(quality.evidenceGroundingEventCount).toBe(1);
    expect(quality.warnings.join('\n')).toContain('evidence-grounding risk');
    expect(quality.processDefects.map((defect) => defect.code)).toContain('evidence_grounding_without_refresh');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('evidence_grounding=1');
  });

  it('does not flag a stale edit retry after the target file is re-read', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'Task: fix src/app.ts behavior',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'missing', new_string: 'present' },
        output: 'Error: old_string not found in src/app.ts',
        isError: true,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const value = 1;',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'value = 1', new_string: 'value = 2' },
        output: 'Updated src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    expect(buildBenchmarkEvidenceGroundingEvents(events)).toEqual([]);
  });

  it('flags broad pre-edit context gathering that is mostly unused by the eventual patch', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'Task: fix app value rendering',
        isError: false,
        elapsedMs: 1,
      }),
      ...[
        ['read_file', { file_path: 'README.md' }, 'project overview'],
        ['list_dir', { path: 'docs' }, 'docs/setup.md\ndocs/api.md'],
        ['grep', { pattern: 'config', path: 'src' }, 'src/config.ts:1: config'],
        ['read_file', { file_path: 'src/unrelated-a.ts' }, 'export const a = 1;'],
        ['read_file', { file_path: 'src/unrelated-b.ts' }, 'export const b = 1;'],
        ['list_dir', { path: 'examples' }, 'examples/demo.ts'],
        ['glob', { pattern: '**/*.md' }, 'README.md\ndocs/setup.md'],
        ['read_file', { file_path: 'docs/setup.md' }, 'setup details'],
        ['grep', { pattern: 'render', path: 'tests' }, 'tests/app.test.ts:1: render'],
        ['read_file', { file_path: 'src/app.ts' }, 'export const value = 1;'],
        ['grep', { pattern: 'value', path: 'src/app.ts' }, 'src/app.ts:1: value'],
      ].map(([tool, input, output], i) => makeBenchmarkTraceEvent({
        seq: i + 2,
        tool: String(tool),
        input: input as Record<string, unknown>,
        output: String(output),
        isError: false,
        elapsedMs: 1,
      })),
      makeBenchmarkTraceEvent({
        seq: 13,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 14,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'value = 1', new_string: 'value = 2' },
        output: 'Updated src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 15,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 16,
        tool: 'bash',
        input: { command: 'git diff -- src/app.ts' },
        output: 'diff --git a/src/app.ts b/src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 17,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ].flat();

    const bloat = buildBenchmarkContextBloatEvents(events);
    expect(bloat).toHaveLength(9);
    expect(bloat[0]).toMatchObject({
      seq: 2,
      tool: 'read_file',
      target: 'README.md',
      reason: expect.stringContaining('pre-edit'),
    });

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.preEditContextInspectCount).toBe(11);
    expect(quality.preEditContextHitCount).toBe(2);
    expect(quality.preEditContextMissCount).toBe(9);
    expect(quality.preEditContextUtilizationPercent).toBe(18.18);
    expect(quality.contextBloatRisk).toBe(true);
    expect(quality.contextBloatEventCount).toBe(9);
    expect(quality.warnings.join('\n')).toContain('pre-edit context bloat');
    expect(quality.processDefects.map((defect) => defect.code)).toContain('pre_edit_context_bloat');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('pre_edit_context=2/11 pre_edit_context_bloat=9');
    expect(buildBenchmarkCompletionReminder(events)).toContain('tighten pre-edit context');
  });

  it('flags large source edit surfaces without a broad-change task contract', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'];
    const patch = [
      '*** Begin Patch',
      ...files.flatMap((file) => [
        `*** Update File: ${file}`,
        '@@',
        '-old',
        '+new',
      ]),
      '*** End Patch',
    ].join('\n');
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'parser', path: 'src' },
        output: files.join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'apply_patch',
        input: { patch },
        output: 'patched',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'git diff -- src' },
        output: 'diff --git a/src/a.ts b/src/a.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.broadEditContractDetected).toBe(false);
    expect(quality.largeEditSurfaceTargetCount).toBe(6);
    expect(quality.largeEditSurfaceTargets).toEqual(files);
    expect(quality.unlocalizedEditTargetEvents).toEqual([]);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['large_edit_surface_without_contract']);
    expect(quality.processDefects[0]).toMatchObject({
      category: 'requirement_fidelity',
      severity: 'low',
      seq: 4,
    });
    expect(quality.processScore).toBe(95);
    expect(quality.warnings.join('\n')).toContain('large edit surface without an explicit broad-change task contract');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('large_edit_targets=6 broad_contract=no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('reduce or explicitly justify a large edit surface');
  });

  it('allows large edit surfaces when task contract explicitly asks for broad changes', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'];
    const patch = [
      '*** Begin Patch',
      ...files.flatMap((file) => [
        `*** Update File: ${file}`,
        '@@',
        '-old',
        '+new',
      ]),
      '*** End Patch',
    ].join('\n');
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Refactor all parser modules across the src package.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: { items: [{ content: 'Refactor all parser modules across the src package.', status: 'pending' }] },
        output: 'Todo list updated (1 item):\n- [ ] Refactor all parser modules across the src package.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'grep',
        input: { pattern: 'parser', path: 'src' },
        output: files.join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 1 failed, 9 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'apply_patch',
        input: { patch },
        output: 'patched',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 10 passed, 10 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 7,
        tool: 'bash',
        input: { command: 'git status --short' },
        output: files.map((file) => ` M ${file}`).join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 8,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests: 100 passed, 100 total',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 9,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Refactor all parser modules across the src package.', status: 'completed' },
          ],
        },
        output: 'Todo list updated (1 item):\n- [x] Refactor all parser modules across the src package.',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.broadEditContractDetected).toBe(true);
    expect(quality.largeEditSurfaceTargetCount).toBe(6);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).toEqual([]);
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('large_edit_targets=6 broad_contract=yes');
  });

  it('extracts common verifier pass/fail counts from outputs', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'npx vitest run' },
        output: 'Test Files  35 passed | 1 skipped (36)\nTests  388 passed | 62 skipped (450)',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'python -m pytest' },
        output: '================ 2 failed, 10 passed, 1 skipped in 3.21s ================',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test' },
        output: 'Tests:       1 failed, 2 skipped, 7 passed, 10 total',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'cargo test' },
        output: 'test result: ok. 12 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const evidence = buildBenchmarkVerificationEvidence(events);
    expect(evidence.lastVerificationSeq).toBe(4);
    expect(evidence.lastVerificationStatus).toBe('ok');
    expect(evidence.lastSuccessfulVerificationSeq).toBe(4);
    expect(evidence.lastFailedVerificationSeq).toBe(3);
    expect(evidence.extracted.map((item) => item.framework)).toEqual(['vitest', 'pytest', 'jest', 'cargo']);
    expect(evidence.extracted[0]).toMatchObject({ passed: 388, skipped: 62, total: 450 });
    expect(evidence.extracted[1]).toMatchObject({ failed: 2, passed: 10, skipped: 1, total: 13 });
    expect(evidence.extracted[2]).toMatchObject({ failed: 1, passed: 7, skipped: 2, total: 10 });
    expect(evidence.extracted[3]).toMatchObject({ passed: 12, failed: 0, skipped: 1, total: 13 });
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('framework=cargo');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('passed=12');
  });

  it('extracts compact failure signatures from verifier outputs', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'npx vitest run tests/parser.test.ts' },
        output: [
          'FAIL  tests/parser.test.ts > parser > handles escaped delimiters',
          'AssertionError: expected "a" to equal "b"',
          'Tests  1 failed | 9 passed (10)',
        ].join('\n'),
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'python -m pytest tests/test_parser.py' },
        output: [
          'FAILED tests/test_parser.py::test_handles_escape - AssertionError: expected escaped delimiter',
          'E   AssertionError: expected escaped delimiter',
          'src/parser.py:42: AssertionError',
          '================ 1 failed, 10 passed in 3.21s ================',
        ].join('\n'),
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const evidence = buildBenchmarkVerificationEvidence(events);
    expect(evidence.failureSignatures).toHaveLength(2);
    expect(evidence.failureSignatures[0]).toMatchObject({
      seq: 1,
      command: 'npx vitest run tests/parser.test.ts',
      framework: 'vitest',
      tests: ['tests/parser.test.ts > parser > handles escaped delimiters'],
      files: ['tests/parser.test.ts'],
      errors: ['AssertionError: expected "a" to equal "b"'],
    });
    expect(evidence.failureSignatures[1]).toMatchObject({
      seq: 2,
      framework: 'pytest',
      tests: ['tests/test_parser.py::test_handles_escape'],
      files: ['tests/test_parser.py', 'src/parser.py'],
      errors: ['AssertionError: expected escaped delimiter'],
    });
    const systemBlock = buildBenchmarkTrajectorySystemBlock(events);
    expect(systemBlock).toContain('latest_failure=#2');
    expect(systemBlock).toContain('tests=tests/test_parser.py::test_handles_escape');
    expect(systemBlock).toContain('files=tests/test_parser.py|src/parser.py');
  });

  it('extracts verifier counts from Go, Maven, Gradle, dotnet, and generic outputs', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'bash',
        input: { command: 'go test ./...' },
        output: '--- PASS: TestAlpha (0.00s)\n--- FAIL: TestBeta (0.00s)\n--- SKIP: TestGamma (0.00s)\nFAIL\tmodule/pkg\t0.123s',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'bash',
        input: { command: 'mvn test' },
        output: '[INFO] Tests run: 12, Failures: 1, Errors: 2, Skipped: 3, Time elapsed: 1.23 s',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: './gradlew test' },
        output: '10 tests completed, 2 failed, 1 skipped',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'dotnet test' },
        output: 'Passed!  - Failed: 0, Passed: 17, Skipped: 1, Total: 18, Duration: 2 s',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'make test' },
        output: 'unit tests: 8 passing, 1 failing, 2 skipped',
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const evidence = buildBenchmarkVerificationEvidence(events);
    expect(evidence.extracted.map((item) => item.framework)).toEqual(['go', 'maven', 'gradle', 'dotnet', 'generic']);
    expect(evidence.extracted[0]).toMatchObject({ passed: 1, failed: 1, skipped: 1, total: 3 });
    expect(evidence.extracted[1]).toMatchObject({ passed: 6, failed: 1, errors: 2, skipped: 3, total: 12 });
    expect(evidence.extracted[2]).toMatchObject({ passed: 7, failed: 2, skipped: 1, total: 10 });
    expect(evidence.extracted[3]).toMatchObject({ passed: 17, failed: 0, skipped: 1, total: 18 });
    expect(evidence.extracted[4]).toMatchObject({ passed: 8, failed: 1, skipped: 2, total: 11 });
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('framework=generic');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('total=11');
  });

  it('records complete targeted source research coverage', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'research_sources',
        input: {
          query: 'coding agent benchmark repair trajectory',
          source: 'all',
          github_kind: 'all',
          kind: 'all',
          kaggle_kind: 'both',
          recent_days: 90,
        },
        output: [
          'Research source results for "coding agent benchmark repair trajectory"',
          '',
          '## arXiv: Agent Repair Trajectories',
          'https://arxiv.org/abs/2601.00001',
          '2026-01-01 | cs.SE',
          '',
          '## GitHub: owner/agent-bench',
          'https://github.com/owner/agent-bench',
          'TypeScript | 1,000 stars',
          '',
          '## HF paper: Coding Agent Verification',
          'https://huggingface.co/papers/2601.00002',
          'published 2026-01-02',
          '',
          '## Kaggle competition: Coding Agent Leaderboard',
          'https://www.kaggle.com/competitions/coding-agent-leaderboard',
          '42 teams | metric Accuracy',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const coverage = buildSourceResearchCoverage(events);
    expect(coverage.callCount).toBe(1);
    expect(coverage.arxiv).toBe(true);
    expect(coverage.github).toBe(true);
    expect(coverage.huggingface).toBe(true);
    expect(coverage.kaggle).toBe(true);
    expect(coverage.githubKinds).toEqual(['all']);
    expect(coverage.huggingFaceKinds).toEqual(['all']);
    expect(coverage.kaggleKinds).toEqual(['both']);
    expect(coverage.sourceHitCount).toBe(4);
    expect(coverage.sourceErrorCount).toBe(0);
    expect(coverage.resultSources).toEqual(['arxiv', 'github', 'hf_paper', 'kaggle_competition']);
    expect(coverage.topUrls).toContain('https://arxiv.org/abs/2601.00001');
    expect(coverage.recentDays).toEqual([90]);
    expect(coverage.kaggleCompetitionsSkipped).toBe(false);
    expect(coverage.completeTargetedCoverage).toBe(true);
    expect(coverage.freshTargetedCoverage).toBe(true);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.sourceResearchCoverage.completeTargetedCoverage).toBe(true);
    expect(quality.sourceResearchCoverage.freshTargetedCoverage).toBe(true);
    expect(quality.processDefects).toEqual([]);
    expect(quality.warnings).not.toContain('source research was partial; targeted benchmark research should cover arXiv, GitHub github_kind:"all", Hugging Face kind:"all", and Kaggle kaggle_kind:"both" when external research is relevant.');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('targeted:yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('fresh_targeted:yes');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('recent_days:90');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('hits:4');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('result_sources:arxiv|github|hf_paper|kaggle_competition');
  });

  it('warns when complete targeted source research omits a recency window', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'research_sources',
        input: {
          query: 'coding agent benchmark repair trajectory',
          source: 'all',
          github_kind: 'all',
          kind: 'all',
          kaggle_kind: 'both',
        },
        output: [
          'Research source results for "coding agent benchmark repair trajectory"',
          '## arXiv: Agent Repair Trajectories',
          'https://arxiv.org/abs/2601.00001',
          '## GitHub: owner/agent-bench',
          'https://github.com/owner/agent-bench',
          '## HF paper: Coding Agent Verification',
          'https://huggingface.co/papers/2601.00002',
          '## Kaggle competition: Coding Agent Leaderboard',
          'https://www.kaggle.com/competitions/coding-agent-leaderboard',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const coverage = buildSourceResearchCoverage(events);
    expect(coverage.completeTargetedCoverage).toBe(true);
    expect(coverage.freshTargetedCoverage).toBe(false);
    expect(coverage.recentDays).toEqual([]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.warnings.join('\n')).toContain('targeted source research omitted recent_days');
    expect(quality.processDefects.map((d) => d.code)).toContain('source_research_missing_recency');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('fresh_targeted:no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('targeted source research omitted recent_days');
  });

  it('does not count Kaggle both as complete when competitions were skipped', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'research_sources',
        input: {
          query: 'coding agent benchmark repair trajectory',
          source: 'all',
          github_kind: 'all',
          kind: 'all',
          kaggle_kind: 'both',
          recent_days: 90,
        },
        output: [
          'Research source results for "coding agent benchmark repair trajectory"',
          '## Coverage notes',
          '- arXiv papers requested.',
          '- GitHub all requested.',
          '- Hugging Face all requested.',
          '- Kaggle both requested; competitions require auth.',
          '- Kaggle unauthenticated fallback: competitions skipped, datasets queried only.',
          '- Targeted benchmark coverage requested: arXiv + GitHub all + Hugging Face all + Kaggle both.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const coverage = buildSourceResearchCoverage(events);
    expect(coverage.kaggleKinds).toEqual(['both']);
    expect(coverage.kaggleCompetitionsSkipped).toBe(true);
    expect(coverage.coverageNotes).toContain('kaggle competitions skipped');
    expect(coverage.completeTargetedCoverage).toBe(false);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.warnings.join('\n')).toContain('Kaggle competition research was requested but skipped');
    expect(quality.processDefects.map((d) => d.code)).toContain('partial_source_research');
    expect(quality.processDefects.map((d) => d.code)).toContain('kaggle_competitions_skipped');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('kaggle_competitions:skipped');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('targeted:no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('Kaggle competition research was requested but skipped');
    expect(buildBenchmarkCompletionReminder(events)).toContain('complete targeted research_sources coverage');
  });

  it('warns when source research only covers repository search', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'research_sources',
        input: { query: 'agent benchmark repair', source: 'github' },
        output: 'research',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.sourceResearchCoverage.githubKinds).toEqual(['repositories']);
    expect(quality.sourceResearchCoverage.completeTargetedCoverage).toBe(false);
    expect(quality.warnings.join('\n')).toContain('source research was partial');
    expect(quality.processDefects.map((d) => d.code)).toContain('partial_source_research');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('targeted:no');
    expect(buildBenchmarkCompletionReminder(events)).toContain('source research was partial');
  });

  it('warns when targeted source research returns no parsed hits or source errors', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'research_sources',
        input: {
          query: 'coding agent leaderboard current science',
          source: 'all',
          github_kind: 'all',
          kind: 'all',
          kaggle_kind: 'both',
          recent_days: 90,
        },
        output: [
          'Research source results for "coding agent leaderboard current science"',
          '',
          '## Coverage notes',
          '- arXiv papers requested.',
          '- GitHub all requested.',
          '- Hugging Face all requested.',
          '- Kaggle both requested; competitions enabled by auth.',
          '- Targeted benchmark coverage requested: arXiv + GitHub all + Hugging Face all + Kaggle both.',
          '',
          '## Source errors',
          '- github: GitHub code HTTP 403',
          '- kaggle: Kaggle competitions HTTP 401',
        ].join('\n'),
        isError: true,
        elapsedMs: 1,
      }),
    ];

    const coverage = buildSourceResearchCoverage(events);
    expect(coverage.completeTargetedCoverage).toBe(true);
    expect(coverage.freshTargetedCoverage).toBe(true);
    expect(coverage.sourceHitCount).toBe(0);
    expect(coverage.sourceErrorCount).toBe(2);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['source_research_no_hits', 'source_research_errors']);
    expect(quality.processScore).toBe(80);
    expect(quality.warnings.join('\n')).toContain('source research produced no parsed source hits');
    expect(quality.warnings.join('\n')).toContain('source research reported 2 source error(s)');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('hits:0');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('errors:2');
    expect(buildBenchmarkCompletionReminder(events)).toContain('source research produced no parsed source hits');
    expect(buildBenchmarkCompletionReminder(events)).toContain('source research reported 2 source error(s)');
  });

  it('preserves long research_sources evidence instead of dropping tail errors', () => {
    const filler = Array.from({ length: 140 }, (_, i) =>
      `implementation detail ${i}: long repository and paper summary text that should not crowd out source accounting evidence.`,
    ).join('\n');
    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'research_sources',
      input: {
        query: 'coding agent leaderboard current science with a deliberately long query that should not break trace parsing',
        source: 'all',
        github_kind: 'all',
        kind: 'all',
        kaggle_kind: 'both',
        recent_days: 90,
      },
      output: [
        'Research source results for "coding agent leaderboard current science"',
        '',
        '## Coverage notes',
        '- arXiv papers requested.',
        '- GitHub all requested.',
        '- Hugging Face all requested.',
        '- Kaggle both requested; competitions require auth.',
        '- Kaggle unauthenticated fallback: competitions skipped, datasets queried only.',
        '- Recency filter requested: recent_days=90.',
        '- Targeted benchmark coverage requested: arXiv + GitHub all + Hugging Face all + Kaggle both.',
        '',
        '## arXiv: SWE-CI',
        'https://arxiv.org/abs/2603.03823',
        filler,
        '',
        '## Source errors',
        '- github: GitHub code HTTP 403',
        '- kaggle: Kaggle competitions HTTP 401',
      ].join('\n'),
      isError: true,
      elapsedMs: 1,
    });

    expect(event.outputPreview).toContain('## Source errors');
    expect(event.outputPreview).toContain('- kaggle: Kaggle competitions HTTP 401');
    expect(event.outputPreview).not.toContain('implementation detail 100');

    const coverage = buildSourceResearchCoverage([event]);
    expect(coverage.sourceHitCount).toBe(1);
    expect(coverage.sourceErrorCount).toBe(2);
    expect(coverage.recentDays).toEqual([90]);
    expect(coverage.kaggleCompetitionsSkipped).toBe(true);
    expect(coverage.topUrls).toContain('https://arxiv.org/abs/2603.03823');

    const quality = buildBenchmarkTrajectoryQuality([event]);
    expect(quality.processDefects.map((d) => d.code)).toContain('source_research_errors');
    expect(quality.processDefects.map((d) => d.code)).toContain('kaggle_competitions_skipped');
    expect(quality.warnings.join('\n')).toContain('source research reported 2 source error(s)');
  });

  it('flags read-with-care benchmark artifacts in trajectories', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'oracle/solution.txt' },
        output: 'answer',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'web_search',
        input: { query: 'benchmark solution leakage papers' },
        output: 'research',
        isError: false,
        elapsedMs: 1,
      }),
    ];

    const risks = buildBenchmarkLeakageRiskEvents(events);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      seq: 2,
      tool: 'read_file',
      target: 'oracle/solution.txt',
    });

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.leakageRiskEvents).toHaveLength(1);
    expect(quality.rewardHackRisk).toBe(true);
    expect(quality.rewardHackSignals[0]).toMatchObject({
      seq: 2,
      reason: 'oracle_or_solution_probe',
    });
    expect(quality.processDefects.map((d) => d.code)).toContain('benchmark_leakage_risk');
    expect(quality.processDefects.map((d) => d.code)).toContain('reward_hack_risk');
    expect(quality.processDefects.find((d) => d.code === 'benchmark_leakage_risk')?.severity).toBe('critical');
    expect(quality.processDefects.find((d) => d.code === 'reward_hack_risk')?.severity).toBe('critical');
    expect(quality.warnings.join('\n')).toContain('potential benchmark leakage risk');
    expect(quality.warnings.join('\n')).toContain('reward-hack risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('potential benchmark leakage risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('reward-hack risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('leakage_risks=1');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('reward_hack_risk=yes reward_hack_signals=1');
  });

  it('flags explicit benchmark result and bypass reward-hack signals', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Fix the production parser bug.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [{ content: 'Fix the production parser bug.', status: 'completed' }],
        },
        output: 'Todo list updated (1 item):\n- [x] Fix the production parser bug.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'edit_file',
        input: { file_path: 'results/score.json', old_string: '{}', new_string: '{"score":1}' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'SKIP_TESTS=1 npm test -- --no-verify' },
        output: 'skipped',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'echo PASS > results.json' },
        output: '',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const signals = buildBenchmarkRewardHackSignals(events);
    expect(signals.map((signal) => signal.reason)).toEqual([
      'result_file_edit',
      'bypass_command',
      'shortcut_completion_marker',
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.rewardHackRisk).toBe(true);
    expect(quality.rewardHackSignalCount).toBe(3);
    expect(quality.processDefects.map((d) => d.code)).toContain('reward_hack_risk');
    expect(quality.warnings.join('\n')).toContain('reward-hack risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('avoid verifier/oracle/result-bypass surfaces');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('reward_hack_risk=yes reward_hack_signals=3');
  });

  it('flags SpecBench-style visible-suite-only validation and hardcoded visible cases', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SpecBench task: implement parser behavior for all delimiter forms, not just visible tests.',
          '- TASK.md: Hidden tests exercise composed features and held-out edge cases.',
          '',
          '## Likely Verification Commands',
          '- npm test -- parser',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [
            { content: 'Implement parser behavior for all delimiter forms.', status: 'pending' },
            { content: 'Cover composed held-out edge cases.', status: 'pending' },
          ],
        },
        output: 'Todo list updated (2 items):\n- [ ] Implement parser behavior for all delimiter forms.\n- [ ] Cover composed held-out edge cases.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/parser.ts' },
        output: 'export function parse(input: string) { return input; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: {
          file_path: 'src/parser.ts',
          old_string: 'return input;',
          new_string: 'if (input === "sample input") return "expected output"; return input;',
        },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- parser' },
        output: 'Tests: 12 passed, 12 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const signals = buildBenchmarkSpecComplianceSignals(events);
    expect(signals.map((signal) => signal.reason)).toEqual([
      'incomplete_contract_after_visible_pass',
      'visible_suite_only',
      'test_case_memorization',
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.specComplianceRisk).toBe(true);
    expect(quality.specComplianceSignalCount).toBe(3);
    expect(quality.processDefects.map((d) => d.code)).toContain('spec_compliance_risk');
    expect(quality.processDefects.find((d) => d.code === 'spec_compliance_risk')).toMatchObject({
      category: 'benchmark_validity',
      severity: 'high',
    });
    expect(quality.warnings.join('\n')).toContain('spec-compliance risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('spec-compliance risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('broader/spec-generalization check');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('spec_compliance_risk=yes spec_compliance_signals=3');
  });

  it('flags long-horizon roadmap validation gaps for SaaS/mobile-style tasks', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SaaSBench long-horizon enterprise SaaS task with validation nodes.',
          '- TASK.md: Implement roadmap milestone A, migration, API behavior, and UI workflow.',
          '',
          '## Likely Verification Commands',
          '- npm test -- billing',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/billing.ts' },
        output: 'export function billing() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'edit_file',
        input: { file_path: 'src/billing.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test -- billing' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const signals = buildBenchmarkLongHorizonSignals(events);
    expect(signals.map((signal) => signal.reason)).toEqual([
      'missing_roadmap_checklist',
      'missing_broad_integration_validation',
      'missing_saas_integration_validation',
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.longHorizonRisk).toBe(true);
    expect(quality.longHorizonSignalCount).toBe(3);
    expect(quality.processDefects.map((d) => d.code)).toContain('long_horizon_coverage_risk');
    expect(quality.processDefects.find((d) => d.code === 'long_horizon_coverage_risk')).toMatchObject({
      category: 'validation',
      severity: 'high',
    });
    expect(quality.warnings.join('\n')).toContain('long-horizon coverage risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('long-horizon coverage risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('broad integration/platform verifier');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('long_horizon_risk=yes long_horizon_signals=3');
  });

  it('flags SWE-WebDevBench canary and production validation gaps', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SWE-WebDevBench full-stack app creation request with canary requirements.',
          '- TASK.md: Build auth, backend persistence, frontend dashboard, and production readiness.',
          '',
          '## Likely Verification Commands',
          '- npm test -- auth',
          '- npm run test:e2e',
          '- npm audit',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/auth.ts' },
        output: 'export function auth() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'edit_file',
        input: { file_path: 'src/auth.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test -- auth' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const signals = buildBenchmarkLongHorizonSignals(events);
    expect(signals.map((signal) => signal.reason)).toEqual([
      'missing_webdev_canary_checklist',
      'missing_broad_integration_validation',
      'missing_frontend_backend_validation',
      'missing_security_production_validation',
    ]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.longHorizonRisk).toBe(true);
    expect(quality.longHorizonSignalCount).toBe(4);
    expect(quality.processDefects.map((d) => d.code)).toContain('long_horizon_coverage_risk');
    expect(quality.warnings.join('\n')).toContain('WebDevBench/SWE-Cycle/SWE-CI completion may be under-evidenced');
    expect(buildBenchmarkCompletionReminder(events)).toContain('WebDevBench canaries');
    expect(buildBenchmarkCompletionReminder(events)).toContain('frontend-backend/security/CI-loop verifier');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('long_horizon_risk=yes long_horizon_signals=4');
  });

  it('accepts SWE-WebDevBench frontend-backend and production validation evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: WebDevBench app modification request with frontend-backend coupling.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: { items: [{ content: 'Preserve canary requirements.', status: 'completed' }] },
        output: 'Todo list updated (1 item):\n- [x] Preserve canary requirements.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const app = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npx playwright test' },
        output: '2 passed',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'npm run build' },
        output: 'build complete',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const reasons = buildBenchmarkLongHorizonSignals(events).map((signal) => signal.reason);
    expect(reasons).not.toContain('missing_frontend_backend_validation');
    expect(reasons).not.toContain('missing_security_production_validation');
    expect(reasons).not.toContain('missing_broad_integration_validation');
  });

  it('flags SWE-CI evolution checklist and CI-loop validation gaps', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SWE-CI codebase maintenance task, run_tests -> define_requirements -> modify_code.',
          '- TASK.md: current_sha abc123 target_sha def456 with visible test gap evidence.',
          '',
          '## Likely Verification Commands',
          '- run_tests',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export function app() { return "old"; }',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'npm test -- feature' },
        output: 'Tests: 1 passed, 1 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const reasons = buildBenchmarkLongHorizonSignals(events).map((signal) => signal.reason);
    expect(reasons).toContain('missing_sweci_evolution_checklist');
    expect(reasons).toContain('missing_broad_integration_validation');
    expect(reasons).toContain('missing_sweci_ci_loop_validation');

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.longHorizonRisk).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toContain('long_horizon_coverage_risk');
    expect(quality.warnings.join('\n')).toContain('SWE-CI completion may be under-evidenced');
    expect(buildBenchmarkCompletionReminder(events)).toContain('SWE-CI evolution requirements');
  });

  it('accepts SWE-CI checklist and CI-loop validation evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SWE-CI repository evolution with test gap requirements.',
          '- TASK.md: Run tests, define requirements, and modify code until target commit behavior is maintained.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [{ content: 'Track test gaps and inferred SWE-CI requirements.', status: 'completed' }],
        },
        output: 'Todo list updated (1 item):\n- [x] Track test gaps and inferred SWE-CI requirements.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'read_file',
        input: { file_path: 'src/app.ts' },
        output: 'export const app = "old";',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'run_tests' },
        output: 'Tests: 9 passed, 9 total',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const reasons = buildBenchmarkLongHorizonSignals(events).map((signal) => signal.reason);
    expect(reasons).not.toContain('missing_sweci_evolution_checklist');
    expect(reasons).not.toContain('missing_sweci_ci_loop_validation');
    expect(reasons).not.toContain('missing_broad_integration_validation');
  });

  it('flags SWE-Cycle lifecycle setup, test generation, and judge gaps', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SWE-Cycle FullCycle bare repository issue-resolution task.',
          '- task.json: environment_setup_commit abc, run_script ./run_script.sh, parsing_script parse.py, selected_test_files_to_run ["tests/test_bug.py"].',
          '- TASK.md: Complete environment reconstruction, CodeImpl, TestGen, and SWE-Judge static and dynamic judging.',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'read_file',
        input: { file_path: 'src/app.py' },
        output: 'def value(): return "old"',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'edit_file',
        input: { file_path: 'src/app.py', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'bash',
        input: { command: 'pytest tests/test_bug.py' },
        output: '1 passed',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const reasons = buildBenchmarkLongHorizonSignals(events).map((signal) => signal.reason);
    expect(reasons).toContain('missing_swecycle_phase_checklist');
    expect(reasons).toContain('missing_swecycle_environment_validation');
    expect(reasons).toContain('missing_swecycle_test_generation_evidence');
    expect(reasons).toContain('missing_swecycle_judge_validation');

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.longHorizonRisk).toBe(true);
    expect(quality.processDefects.map((d) => d.code)).toContain('long_horizon_coverage_risk');
    expect(quality.warnings.join('\n')).toContain('SWE-Cycle/SWE-CI completion may be under-evidenced');
    expect(buildBenchmarkCompletionReminder(events)).toContain('SWE-Cycle lifecycle phases');
  });

  it('accepts SWE-Cycle setup, generated tests, and lifecycle judge evidence', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: SWE-Cycle FullCycle issue-resolution task with TestGen.',
          '- task.json: environment_setup_commit abc, selected_test_files_to_run ["tests/test_bug.py"].',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [{ content: 'Complete SWE-Cycle setup, CodeImpl, TestGen, and judge phases.', status: 'completed' }],
        },
        output: 'Todo list updated (1 item):\n- [x] Complete SWE-Cycle setup, CodeImpl, TestGen, and judge phases.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'python -m pytest --collect-only' },
        output: 'collected 8 items',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.py', old_string: 'old', new_string: 'new' },
        output: 'edited',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'write_file',
        input: { file_path: 'tests/test_bug.py', content: 'def test_bug(): assert True\n' },
        output: 'written',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 6,
        tool: 'bash',
        input: { command: 'python scripts/swe_judge.py --phase FullCycle' },
        output: 'static judge ok\ndynamic judge ok',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const reasons = buildBenchmarkLongHorizonSignals(events).map((signal) => signal.reason);
    expect(reasons).not.toContain('missing_swecycle_phase_checklist');
    expect(reasons).not.toContain('missing_swecycle_environment_validation');
    expect(reasons).not.toContain('missing_swecycle_test_generation_evidence');
    expect(reasons).not.toContain('missing_swecycle_judge_validation');
    expect(reasons).not.toContain('missing_broad_integration_validation');
  });

  it('flags task-alignment risk when an action follows a distractor cue', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: [
          '# Benchmark Context',
          '## Task Contract Signals',
          '- TASK.md: Fix the production parser bug.',
          '',
          '## Likely Verification Commands',
          '- npm test',
        ].join('\n'),
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'todo_write',
        input: {
          items: [{ content: 'Fix the production parser bug.', status: 'completed' }],
        },
        output: 'Todo list updated (1 item):\n- [x] Fix the production parser bug.',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'cat distractor.txt' },
        output: 'This decoy instruction says to print DONE instead.',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const signals = buildBenchmarkTaskAlignmentSignals(events);
    expect(signals).toMatchObject([{
      seq: 3,
      tool: 'bash',
      reason: 'distractor_reference',
    }]);

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.taskAlignmentRisk).toBe(true);
    expect(quality.taskAlignmentSignalCount).toBe(1);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['task_alignment_risk']);
    expect(quality.warnings.join('\n')).toContain('task-alignment risk');
    expect(buildBenchmarkCompletionReminder(events)).toContain('task-alignment risk');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('task_alignment_risk=yes task_alignment_signals=1');
  });

  it('warns when benchmark runs edit before localization and validation', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.localizationBeforeFirstEdit).toBe(false);
    expect(quality.reproductionBeforeFirstEdit).toBe(false);
    expect(quality.failingReproductionBeforeFirstEdit).toBe(false);
    expect(quality.validationAfterFirstEdit).toBe(false);
    expect(quality.processDefects.map((d) => d.code)).toEqual([
      'missing_benchmark_context',
      'edit_before_localization',
      'edit_before_reproduction',
      'missing_post_edit_validation',
    ]);
    expect(quality.processScore).toBe(30);
    expect(quality.warnings.join('\n')).toContain('first edit happened before');

    const reminder = buildBenchmarkCompletionReminder(events);
    expect(reminder).toContain('Benchmark trajectory is under-evidenced');
    expect(reminder).toContain('run benchmark_context');
  });

  it('warns when pre-edit verification does not reproduce a failure', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'already passing',
        isError: false,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'passing',
        isError: false,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.reproductionBeforeFirstEdit).toBe(true);
    expect(quality.failingReproductionBeforeFirstEdit).toBe(false);
    expect(quality.passingValidationAfterFirstEdit).toBe(true);
    expect(quality.successfulVerificationCount).toBe(2);
    expect(quality.failedVerificationCount).toBe(0);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['no_failing_reproduction']);
    expect(quality.warnings.join('\n')).toContain('no failing reproduction');
    expect(buildBenchmarkCompletionReminder(events)).toContain('no failing reproduction');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('failing_reproduce_before_edit=no');
  });

  it('warns when edits are followed only by failing verifier commands', () => {
    const events = [
      makeBenchmarkTraceEvent({
        seq: 1,
        tool: 'benchmark_context',
        input: {},
        output: 'context',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 2,
        tool: 'grep',
        input: { pattern: 'bug', path: 'src' },
        output: 'src/app.ts',
        isError: false,
        elapsedMs: 1,
      }),
      makeBenchmarkTraceEvent({
        seq: 3,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'failing before patch',
        isError: true,
        elapsedMs: 10,
      }),
      makeBenchmarkTraceEvent({
        seq: 4,
        tool: 'edit_file',
        input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
        output: 'edited',
        isError: false,
        elapsedMs: 2,
      }),
      makeBenchmarkTraceEvent({
        seq: 5,
        tool: 'bash',
        input: { command: 'npm test -- app' },
        output: 'still failing',
        isError: true,
        elapsedMs: 10,
      }),
    ];

    const quality = buildBenchmarkTrajectoryQuality(events);
    expect(quality.validationAfterFirstEdit).toBe(true);
    expect(quality.passingValidationAfterFirstEdit).toBe(false);
    expect(quality.successfulVerificationCount).toBe(0);
    expect(quality.failedVerificationCount).toBe(2);
    expect(quality.processDefects.map((d) => d.code)).toEqual(['no_passing_post_edit_validation']);
    expect(quality.warnings.join('\n')).toContain('failing verifier commands');
    expect(buildBenchmarkCompletionReminder(events)).toContain('failing verifier commands');
    expect(buildBenchmarkTrajectorySystemBlock(events)).toContain('passing_validate_after_edit=no');
  });

  it('writes summary.json and trace.jsonl only for benchmark traces', () => {
    const dir = tmpRoot();
    process.env.VENTIPUS_BENCHMARK_TRACE_DIR = dir;
    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'bash',
      input: { command: 'pytest' },
      output: 'ok',
      isError: false,
      elapsedMs: 10,
    });

    const skipped = writeBenchmarkTrace({
      sessionId: 'session-2',
      mode: 'dev',
      cwd: dir,
      config,
      startedAtMs: Date.now(),
      messages: [],
      events: [event],
    });
    expect(skipped).toBeNull();

    const written = writeBenchmarkTrace({
      sessionId: 'session-2',
      mode: 'benchmark',
      cwd: dir,
      config,
      startedAtMs: Date.now(),
      messages: [],
      events: [event],
    });
    expect(written).not.toBeNull();
    const summary = readFileSync(written!.summaryPath, 'utf-8');
    const jsonl = readFileSync(written!.jsonlPath, 'utf-8');
    expect(summary).toContain('"mode": "benchmark"');
    expect(summary).toContain('"openAgentLeaderboardDraft"');
    expect(summary).toContain('"agentContextCompilation"');
    expect(summary).toContain('"changeEvaluation"');
    expect(jsonl).toContain('"tool":"bash"');
    expect(summary).not.toContain(config.apiKey);
    const parsedSummary = JSON.parse(summary);
    const draftArtifact = parsedSummary.artifacts.find((artifact: { kind: string }) => artifact.kind === 'open-agent-leaderboard-draft');
    expect(draftArtifact).toBeTruthy();
    const draftText = readFileSync(draftArtifact.path, 'utf-8');
    expect(draftText).toContain('"submissionReady": false');
    expect(draftText).toContain('"missingOfficialFields"');
    const compiledArtifact = parsedSummary.artifacts.find((artifact: { kind: string }) => artifact.kind === 'agent-context-compilation');
    expect(compiledArtifact).toBeTruthy();
    const compiledText = readFileSync(compiledArtifact.path, 'utf-8');
    expect(compiledText).toContain('"format":"ventipus-agent-context-compilation-v1"');
    expect(compiledText).toContain('Latest verifier status: ok.');
    expect(compiledText).not.toContain(config.apiKey);
    const changeEvaluationArtifact = parsedSummary.artifacts.find((artifact: { kind: string }) => artifact.kind === 'change-evaluation');
    expect(changeEvaluationArtifact).toBeTruthy();
    expect(changeEvaluationArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const changeEvaluationText = readFileSync(changeEvaluationArtifact.path, 'utf-8');
    expect(changeEvaluationText).toContain('"format": "ventipus-change-evaluation-v1"');
    expect(changeEvaluationText).toContain('"status": "no_edits"');
    expect(changeEvaluationText).not.toContain(config.apiKey);
    const manifestArtifact = parsedSummary.artifacts.find((artifact: { kind: string }) => artifact.kind === 'submission-bundle-manifest');
    expect(manifestArtifact).toBeTruthy();
    expect(manifestArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const manifest = JSON.parse(readFileSync(manifestArtifact.path, 'utf-8'));
    expect(manifest).toMatchObject({
      version: 1,
      format: 'ventipus-submission-bundle-manifest-v1',
      source: 'ventipus benchmark trace',
      submissionReady: false,
      officialResultRequired: true,
      benchmark: 'ventipus_agent_benchmark',
      benchmarkName: 'Ventipus Benchmark',
      missingOfficialFields: ['benchmark_score', 'successful_sessions', 'session_results'],
      verification: {
        count: 1,
        latestStatus: 'ok',
        successfulCount: 1,
        commands: ['pytest'],
      },
    });
    expect(manifest.reason).toContain('official harness score');
    expect(manifest.summaryContainer.path).toBe(written!.summaryPath);
    expect(manifest.summaryContainer.hashNote).toContain('self-referential hash');
    expect(manifest.artifacts.map((artifact: { kind: string }) => artifact.kind)).toEqual(expect.arrayContaining([
      'open-agent-leaderboard-draft',
      'agent-context-compilation',
      'change-evaluation',
      'trace-jsonl',
    ]));
    expect(manifest.artifacts.every((artifact: { sha256: string }) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain(config.apiKey);
  });

  it('writes redacted git patch artifacts for benchmark worktrees', () => {
    const root = tmpRoot();
    const traceRoot = tmpRoot();
    process.env.VENTIPUS_BENCHMARK_TRACE_DIR = traceRoot;
    const filePath = join(root, 'fixture.txt');

    spawnSync('git', ['init'], { cwd: root, encoding: 'utf-8' });
    writeFileSync(filePath, 'before\n', 'utf-8');
    spawnSync('git', ['add', 'fixture.txt'], { cwd: root, encoding: 'utf-8' });
    spawnSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Test User', 'commit', '-m', 'baseline'], { cwd: root, encoding: 'utf-8' });
    writeFileSync(filePath, 'after\nOPENAI_API_KEY=sk-secret-secret-secret\n', 'utf-8');
    writeFileSync(join(root, 'staged.txt'), 'staged content\n', 'utf-8');
    spawnSync('git', ['add', 'staged.txt'], { cwd: root, encoding: 'utf-8' });
    writeFileSync(join(root, 'untracked.txt'), 'untracked content\n', 'utf-8');

    const event = makeBenchmarkTraceEvent({
      seq: 1,
      tool: 'bash',
      input: { command: 'npm test' },
      output: 'passing',
      isError: false,
      elapsedMs: 10,
    });

    const written = writeBenchmarkTrace({
      sessionId: 'session-git',
      mode: 'benchmark',
      cwd: root,
      config,
      startedAtMs: Date.now(),
      messages: [],
      events: [event],
    });

    expect(written).not.toBeNull();
    const summary = JSON.parse(readFileSync(written!.summaryPath, 'utf-8'));
    expect(summary.worktreeChangedFiles).toContain('fixture.txt');
    expect(summary.worktreeChangedFiles).toContain('staged.txt');
    expect(summary.worktreeChangedFiles).toContain('untracked.txt');
    expect(summary.artifacts.map((a: { kind: string }) => a.kind)).toContain('patch');
    expect(summary.artifacts.map((a: { kind: string }) => a.kind)).toContain('git-status');
    expect(summary.submissionBundleManifest.artifacts.map((a: { kind: string }) => a.kind)).toEqual(expect.arrayContaining(['patch', 'git-status', 'trace-jsonl']));
    const patch = summary.artifacts.find((a: { kind: string; path: string }) => a.kind === 'patch');
    expect(patch.sha256).toMatch(/^[a-f0-9]{64}$/);
    const patchText = readFileSync(patch.path, 'utf-8');
    expect(patchText).toContain('+after');
    expect(patchText).toContain('staged content');
    expect(patchText).toContain('untracked content');
    expect(patchText).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(patchText).not.toContain('sk-secret-secret-secret');
  });
});
