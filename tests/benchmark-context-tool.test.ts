import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { BenchmarkContextTool } from '../src/tools/benchmark-context.js';
import { getToolByName } from '../src/tools/index.js';
import { addDrawer } from '../src/mempalace/index.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ventipus-bench-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  delete process.env.VENTIPUS_BENCHMARK_TRACE_DIR;
  delete process.env.VENTIPUS_BENCHMARK_EXPERIENCE;
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('benchmark_context tool', () => {
  it('is registered as a read-only tool', () => {
    const tool = getToolByName('benchmark_context');
    expect(tool).toBe(BenchmarkContextTool);
    expect(tool?.isReadOnly).toBe(true);
    expect(tool?.isDestructive).toBe(false);
  });

  it('summarizes manifests, likely verifiers, task files, and oracle candidates', async () => {
    const root = makeRoot();
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    mkdirSync(join(root, 'oracle'));
    mkdirSync(join(root, 'solution'));
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    const traceDir = join(root, '.ventipus', 'benchmark-runs');
    const priorRunDir = join(traceDir, '2026-05-26-prior');
    const failedPriorRunDir = join(traceDir, '2026-05-26-failed-prior');
    mkdirSync(priorRunDir, { recursive: true });
    mkdirSync(failedPriorRunDir, { recursive: true });
    process.env.VENTIPUS_BENCHMARK_TRACE_DIR = traceDir;
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: {
        test: 'vitest run',
        build: 'tsc',
        start: 'node src/server.js',
      },
    }, null, 2));
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    writeFileSync(join(root, 'pyproject.toml'), '[tool.pytest.ini_options]\n');
    writeFileSync(join(root, 'uv.lock'), '');
    writeFileSync(join(root, 'go.mod'), 'module example.com/fixture\n');
    writeFileSync(join(root, 'pom.xml'), '<project></project>\n');
    writeFileSync(join(root, 'mvnw'), '#!/bin/sh\n');
    writeFileSync(join(root, 'build.gradle.kts'), 'plugins { java }\n');
    writeFileSync(join(root, 'gradlew'), '#!/bin/sh\n');
    writeFileSync(join(root, 'fixture.sln'), '\n');
    writeFileSync(join(root, 'Makefile'), 'verify:\n\tpytest\n');
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), [
      'name: CI',
      'on: [push, pull_request]',
      'env:',
      '  NODE_ENV: test',
      '  DATABASE_URL: postgres://postgres:postgres@localhost:5432/app',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    container: node:20',
      '    services:',
      '      postgres:',
      '        image: postgres:16',
      '        env:',
      '          POSTGRES_PASSWORD: postgres',
      '        ports:',
      '          - 5432:5432',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '      - uses: actions/cache@v4',
      '      - run: pnpm install --frozen-lockfile',
      '      - run: pnpm run test',
      '      - run: |',
      '          python -m pytest tests/test_app.py',
      '          pnpm run build',
      '',
    ].join('\n'));
    writeFileSync(join(root, '.gitlab-ci.yml'), [
      'image: python:3.12',
      'variables:',
      '  PIP_CACHE_DIR: .cache/pip',
      'services:',
      '  - redis:7',
      '  - name: mysql:8',
      'test:',
      '  script:',
      '    - pytest',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'TASK.md'), [
      '# Task',
      'Fix the task.',
      '',
      '## Acceptance Criteria',
      '- Preserve the CSV export format exactly.',
      '- Must show billing totals with two decimal places.',
      '- Do not change the public API route names.',
      '- No code changes are required if the verifier already passes.',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'task.yaml'), [
      'descriptions:',
      '  - key: base',
      '    description: |',
      '      Create /app/filled_form.pdf exactly.',
      '      Include sha256 without a hyphen in the verification output.',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'task.toml'), 'schema_version = "1.1"\n');
    writeFileSync(join(root, 'instruction.md'), 'Fix the Harbor task.\n');
    writeFileSync(join(root, 'Dockerfile'), 'FROM ubuntu:24.04\n');
    writeFileSync(join(root, 'docker-compose.yaml'), 'services:\n  client:\n    build: .\n');
    writeFileSync(join(root, 'run-tests.sh'), '#!/bin/bash\npython -m pytest tests/test_outputs.py -rA\n');
    writeFileSync(join(root, 'solution', 'solve.sh'), '#!/bin/bash\ntrue\n');
    writeFileSync(join(root, 'src', 'index.ts'), 'export const ok = true;\n');
    writeFileSync(join(root, 'src', 'server.js'), 'require("http").createServer().listen(3000);\n');
    writeFileSync(join(root, 'src', 'bitcoin_service.py'), 'print("service")\n');
    writeFileSync(join(root, 'src', 'Fixture.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>\n');
    writeFileSync(join(root, 'tests', 'test_app.py'), 'def test_ok(): assert True\n');
    writeFileSync(join(root, 'tests', 'test_outputs.py'), 'def test_output(): assert True\n');
    writeFileSync(join(root, 'tests', 'test.sh'), '#!/bin/bash\npytest /tests/test_outputs.py\n');
    writeFileSync(join(root, 'oracle', 'solution.txt'), 'do not read unless allowed\n');
    writeFileSync(join(priorRunDir, 'summary.json'), JSON.stringify({
      cwd: root,
      endedAt: '2026-05-26T12:00:00.000Z',
      verificationCommands: ['pnpm run test', 'python -m pytest'],
      changedFiles: ['src/index.ts', 'tests/test_app.py'],
      worktreeChangedFiles: ['src/index.ts'],
      usage: {
        totalTokens: 3700,
        estimatedCostUsd: 0,
      },
      verificationEvidence: {
        failureSignatures: [{
          seq: 4,
          command: 'pnpm run test',
          framework: 'vitest',
          tests: ['billing totals render with fixed decimals'],
          files: ['src/index.ts'],
          errors: ['AssertionError: expected 12.3 to equal 12.30'],
          raw: 'billing total mismatch',
        }],
      },
      trajectoryQuality: {
        processScore: 96,
        successfulVerificationCount: 2,
        taskContractSignalCount: 4,
        taskContractChecklistAfterContext: true,
        taskContractChecklistComplete: true,
        processDefects: [],
      },
    }, null, 2));
    writeFileSync(join(priorRunDir, 'trace.jsonl'), [
      JSON.stringify({
        seq: 1,
        tool: 'benchmark_context',
        target: root,
        status: 'ok',
        verification: false,
        elapsedMs: 50,
        inputPreview: JSON.stringify({ path: root }),
        outputPreview: 'context',
      }),
      JSON.stringify({
        seq: 2,
        tool: 'read_file',
        target: 'src/index.ts',
        status: 'ok',
        verification: false,
        elapsedMs: 20,
        inputPreview: JSON.stringify({ file_path: 'src/index.ts' }),
        outputPreview: 'export const ok = true;',
      }),
      JSON.stringify({
        seq: 3,
        tool: 'grep',
        target: '/billing/ in src',
        status: 'ok',
        verification: false,
        elapsedMs: 20,
        inputPreview: JSON.stringify({ pattern: 'billing', path: 'src/index.ts' }),
        outputPreview: 'src/index.ts:1: billing',
      }),
      JSON.stringify({
        seq: 4,
        tool: 'bash',
        target: '$ pnpm run test',
        status: 'error',
        verification: true,
        elapsedMs: 200,
        inputPreview: JSON.stringify({ command: 'pnpm run test' }),
        outputPreview: 'FAIL billing totals render with fixed decimals',
      }),
      JSON.stringify({
        seq: 5,
        tool: 'edit_file',
        target: 'src/index.ts',
        status: 'ok',
        verification: false,
        elapsedMs: 10,
        inputPreview: JSON.stringify({ file_path: 'src/index.ts' }),
        outputPreview: 'ok',
      }),
    ].join('\n') + '\n');
    writeFileSync(join(failedPriorRunDir, 'summary.json'), JSON.stringify({
      cwd: root,
      endedAt: '2026-05-26T13:00:00.000Z',
      verificationCommands: ['pnpm run test'],
      changedFiles: ['src/index.ts'],
      usage: {
        totalTokens: 9000,
        estimatedCostUsd: 0,
      },
      finalAnswerEvidence: {
        claimsIncomplete: true,
        unsupportedPassingClaim: true,
      },
      trajectoryQuality: {
        processScore: 42,
        successfulVerificationCount: 0,
        processDefects: [
          { code: 'blind_repair_after_failed_verifier' },
          { code: 'no_passing_post_edit_validation' },
        ],
      },
    }, null, 2));

    const result = await BenchmarkContextTool.call({ path: root }, process.cwd());

    expect(result.isError).toBe(false);
    expect(result.output).toContain('# Benchmark Context');
    expect(result.output).toContain('package.json');
    expect(result.output).toContain('TASK.md');
    expect(result.output).toContain('task.yaml');
    expect(result.output).toContain('task.toml');
    expect(result.output).toContain('instruction.md');
    expect(result.output).toContain('Task Instruction Excerpts');
    expect(result.output).toContain('task.yaml:4: description: Create /app/filled_form.pdf exactly.');
    expect(result.output).toContain('task.yaml:5: description: Include sha256 without a hyphen in the verification output.');
    expect(result.output).toContain('Use these exact lines as the initial task contract');
    expect(result.output).toContain('Task Contract Signals');
    expect(result.output).toContain('Preserve the CSV export format exactly.');
    expect(result.output).toContain('Must show billing totals with two decimal places.');
    expect(result.output).toContain('Include sha256 without a hyphen in the verification output.');
    expect(result.output).toContain('Do not change the public API route names.');
    expect(result.output).toContain('No code changes are required if the verifier already passes.');
    expect(result.output).toContain('bash run-tests.sh');
    expect(result.output).toContain('bash tests/test.sh');
    expect(result.output).toContain('python -m pytest tests/test_outputs.py -rA');
    expect(result.output).toContain('pnpm run test');
    expect(result.output).toContain('CI Workflow Hints');
    expect(result.output).toContain('ci workflow: .github/workflows/ci.yml');
    expect(result.output).toContain('ci env: .github/workflows/ci.yml:4: NODE_ENV');
    expect(result.output).toContain('ci env: .github/workflows/ci.yml:5: DATABASE_URL');
    expect(result.output).toContain('ci env: .github/workflows/ci.yml:14: POSTGRES_PASSWORD');
    expect(result.output).not.toContain('postgres://postgres');
    expect(result.output).not.toContain('POSTGRES_PASSWORD: postgres');
    expect(result.output).toContain('ci setup: .github/workflows/ci.yml:19: actions/setup-node@v4');
    expect(result.output).toContain('ci setup: .github/workflows/ci.yml:20: actions/cache@v4');
    expect(result.output).toContain('ci service: .github/workflows/ci.yml:11: postgres');
    expect(result.output).toContain('ci container: .github/workflows/ci.yml:9: node:20');
    expect(result.output).toContain('ci image: .github/workflows/ci.yml:12: postgres:16');
    expect(result.output).toContain('ci image: .gitlab-ci.yml:1: python:3.12');
    expect(result.output).toContain('ci env: .gitlab-ci.yml:3: PIP_CACHE_DIR');
    expect(result.output).toContain('ci service: .gitlab-ci.yml:5: redis:7');
    expect(result.output).toContain('ci image: .gitlab-ci.yml:5: redis:7');
    expect(result.output).toContain('ci service: .gitlab-ci.yml:6: mysql:8');
    expect(result.output).toContain('ci run: .github/workflows/ci.yml:21: pnpm install --frozen-lockfile');
    expect(result.output).toContain('ci verifier: .github/workflows/ci.yml:22: pnpm run test');
    expect(result.output).toContain('ci verifier candidates: pnpm run test | python -m pytest tests/test_app.py && pnpm run build');
    expect(result.output).toContain('CI environment: workflow setup/env/service/container hints were detected');
    expect(result.output).toContain('CI contract: workflow run commands were detected');
    expect(result.output).toContain('reconstruct required CI setup/env/services');
    expect(result.output).toContain('include relevant CI test/build/lint commands');
    expect(result.output).toContain('uv run python -m pytest');
    expect(result.output).toContain('python -m pytest');
    expect(result.output).toContain('go test ./...');
    expect(result.output).toContain('./mvnw test');
    expect(result.output).toContain('./gradlew test');
    expect(result.output).toContain('dotnet test');
    expect(result.output).toContain('make verify');
    expect(result.output).toContain('oracle/solution.txt');
    expect(result.output).toContain('Read-With-Care Candidates');
    expect(result.output).toContain('Benchmark Harness Artifacts');
    expect(result.output).toContain('Benchmark Harness Hints');
    expect(result.output).toContain('Terminal-Bench layout detected');
    expect(result.output).toContain('Harbor task layout detected');
    expect(result.output).toContain('solution artifact detected');
    expect(result.output).toContain('Environment Reconstruction Plan');
    expect(result.output).toContain('setup: pnpm install --frozen-lockfile');
    expect(result.output).toContain('setup: uv sync');
    expect(result.output).toContain('setup: go mod download');
    expect(result.output).toContain('setup: ./mvnw dependency:go-offline');
    expect(result.output).toContain('setup: ./gradlew dependencies');
    expect(result.output).toContain('setup: dotnet restore');
    expect(result.output).toContain('setup: docker compose config');
    expect(result.output).toContain('ci setup: mirror workflow setup/env/service/container hints before relying on CI-only verifier failures.');
    expect(result.output).toContain('Use these setup/restore commands before interpreting missing dependency');
    expect(result.output).toContain('Runtime Environment Hints');
    expect(result.output).toContain('uv project detected');
    expect(result.output).toContain('Go module detected');
    expect(result.output).toContain('Maven project detected');
    expect(result.output).toContain('Gradle project detected');
    expect(result.output).toContain('.NET environment hint');
    expect(result.output).toContain('network/offline hint');
    expect(result.output).toContain('Service Persistence Hints');
    expect(result.output).toContain('start: node src/server.js');
    expect(result.output).toContain('src/bitcoin_service.py');
    expect(result.output).toContain('background:true');
    expect(result.output).toContain('detached tmux');
    expect(result.output).toContain('Benchmark Method Hints');
    expect(result.output).toContain('planner -> navigator -> editor -> executor');
    expect(result.output).toContain('localization dossier');
    expect(result.output).toContain('decision observability');
    expect(result.output).toContain('Prediction: <change> should make <verifier/behavior> pass');
    expect(result.output).toContain('task instruction excerpts and full instruction files');
    expect(result.output).toContain('source research trigger');
    expect(result.output).toContain('source research digest');
    expect(result.output).toContain('github_kind:"all"');
    expect(result.output).toContain('kind:"all"');
    expect(result.output).toContain('kaggle_kind:"both"');
    expect(result.output).toContain('recent_days:90');
    expect(result.output).toContain('Prior Benchmark Experience Hints');
    expect(result.output).toContain('previous run: 2026-05-26T12:00:00.000Z');
    expect(result.output).toContain('process_score=96');
    expect(result.output).toContain('success_verifiers=2');
    expect(result.output).toContain('verifiers=pnpm run test | python -m pytest');
    expect(result.output).toContain('changed=src/index.ts, tests/test_app.py');
    expect(result.output).toContain('replay=read_file#2 src/index.ts | grep#3 /billing/ in src | failing_verifier#4 pnpm run test');
    expect(result.output).toContain('failures=pnpm run test tests=billing totals render with fixed decimals files=src/index.ts errors=AssertionError: expected 12.3 to equal 12.30');
    expect(result.output).toContain('contract=signals:4,checklist_after_context:true,complete:true');
    expect(result.output).toContain('usage=3700 tokens/$0.0000');
    expect(result.output).toContain('Treat prior experience as a cost-saving heuristic only');
    expect(result.output).toContain('Prior Benchmark Experience Warnings');
    expect(result.output).toContain('avoid prior run: 2026-05-26T13:00:00.000Z');
    expect(result.output).toContain('reason=no successful verifier|low process score 42|defects=blind_repair_after_failed_verifier|no_passing_post_edit_validation|final answer incomplete or blocked');
    expect(result.output).toContain('unsupported final verification claim');
    expect(result.output).toContain('Do not copy these prior patterns without fresh current-task evidence');
    expect(result.output).toContain('Convert task instruction excerpts and task contract signals into a short todo checklist');
    expect(result.output).toContain('Before each non-trivial edit, write a one-line `Prediction:`');
    expect(result.output).toContain('reuse only the method-level lesson');
    expect(result.output).toContain('replay only the relevant read/search/verifier steps');
    expect(result.output).toContain('avoid any prior patterns listed as warnings');
  }, 15_000);

  it('uses summary experience-card replay checkpoints when trace.jsonl is absent', async () => {
    const root = makeRoot();
    mkdirSync(join(root, 'src'));
    const traceDir = join(root, '.ventipus', 'benchmark-runs');
    const priorRunDir = join(traceDir, '2026-05-27-card-prior');
    mkdirSync(priorRunDir, { recursive: true });
    process.env.VENTIPUS_BENCHMARK_TRACE_DIR = traceDir;
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    writeFileSync(join(root, 'TASK.md'), [
      '# Task',
      '',
      '## Acceptance Criteria',
      '- Must show billing totals with two decimal places.',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'src', 'app.ts'), 'export const total = 12.3;\n');
    writeFileSync(join(priorRunDir, 'summary.json'), JSON.stringify({
      cwd: root,
      endedAt: '2026-05-27T09:00:00.000Z',
      verificationCommands: ['npm test'],
      changedFiles: ['src/app.ts'],
      usage: {
        totalTokens: 1200,
        estimatedCostUsd: 0,
      },
      trajectoryQuality: {
        processScore: 95,
        successfulVerificationCount: 1,
        processDefects: [],
      },
      experienceCard: {
        version: 1,
        replayCheckpoints: [
          { seq: 2, tool: 'read_file', target: 'src/app.ts', reason: 'file_context', score: 11 },
          { seq: 3, tool: 'bash', target: 'npm test', reason: 'failing_verifier', score: 12 },
        ],
        failureSignatures: [{
          seq: 3,
          command: 'npm test',
          framework: 'vitest',
          tests: ['billing totals render with fixed decimals'],
          files: ['src/app.ts'],
          errors: ['AssertionError: expected 12.3 to equal 12.30'],
          raw: 'billing total mismatch',
        }],
        sourceResearchCoverage: {
          callCount: 1,
          arxiv: true,
          github: true,
          huggingface: true,
          kaggle: true,
          sourceHitCount: 4,
          sourceErrorCount: 0,
          githubKinds: ['repositories', 'issues'],
          huggingFaceKinds: ['papers'],
          kaggleKinds: ['competitions'],
          resultSources: ['arxiv', 'github_repo', 'hf_paper', 'kaggle_competition'],
          topUrls: [
            'https://arxiv.org/abs/2602.08316',
            'https://github.com/example/benchmark-agent',
          ],
          recentDays: [90],
          freshTargetedCoverage: true,
          kaggleCompetitionsSkipped: false,
          coverageNotes: ['targeted benchmark coverage requested'],
          completeTargetedCoverage: true,
        },
        taskContract: {
          signalCount: 2,
          signals: [
            'TASK.md: Must show billing totals with two decimal places.',
          ],
          checklistAfterContext: true,
          checklistComplete: true,
          incompleteCount: 0,
          incompleteItems: [],
        },
        environmentReconstruction: {
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
        },
        dependencyUpgrade: {
          manifestEditCount: 1,
          lockfileEditCount: 1,
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
          setupAfterManifestEdit: true,
          passingSetupAfterManifestEdit: true,
          validationAfterManifestEdit: true,
          passingValidationAfterManifestEdit: true,
          firstSetupAfterManifestEditSeq: 6,
          firstValidationAfterManifestEditSeq: 7,
        },
        decisionObservability: {
          editCount: 1,
          predictedEditCount: 1,
          verifiedPredictionCount: 1,
          editPredictions: [{
            editSeq: 5,
            tool: 'edit_file',
            target: 'src/app.ts',
            prediction: 'formatting total should satisfy billing assertion',
            nextVerifierSeq: 6,
            nextVerifierStatus: 'ok',
            nextVerifierCommand: 'npm test',
          }],
        },
        validationReliability: {
          lastEditSeq: 5,
          finalEditVerificationCount: 2,
          finalEditPassingVerificationCount: 2,
          stableValidationAfterLastEdit: true,
          broadValidationAfterLastEdit: true,
          passingBroadValidationAfterLastEdit: true,
          ciValidationAfterLastEdit: false,
          passingCiValidationAfterLastEdit: false,
          postEditRegressionCycleCount: 0,
          lastPostEditVerificationSeq: 7,
          lastPostEditVerificationStatus: 'ok',
          finalVerifierCommands: ['npm test', 'npm run build'],
        },
        contextUtilization: {
          inspectCount: 4,
          hitCount: 1,
          missCount: 3,
          utilizationPercent: 25,
          risk: true,
          missEvents: [{
            seq: 2,
            tool: 'read_file',
            target: 'src/unrelated.ts',
            reason: 'local read/search/list inspection did not match any edited source target',
          }],
        },
        runEfficiency: {
          toolCallCount: 8,
          usageCallCount: 2,
          totalTokens: 1200,
          estimatedCostUsd: 0,
          successfulVerificationCount: 1,
          processScore: 95,
          processDefectCount: 0,
          warningCount: 0,
          invalidToolActionCount: 0,
          invalidToolActionPercent: 0,
          costEfficiencyRisk: false,
        },
        verificationCommands: ['npm test'],
        changedFiles: ['src/app.ts'],
        warnings: [],
      },
    }, null, 2));

    const result = await BenchmarkContextTool.call({ path: root }, process.cwd());

    expect(result.isError).toBe(false);
    expect(result.output).toContain('previous run: 2026-05-27T09:00:00.000Z');
    expect(result.output).toContain('replay=read_file#2 src/app.ts | failing_verifier#3 npm test');
    expect(result.output).toContain('failures=npm test tests=billing totals render with fixed decimals files=src/app.ts errors=AssertionError: expected 12.3 to equal 12.30');
    expect(result.output).toContain('contract_overlap=TASK.md: Must show billing totals with two decimal places.');
    expect(result.output).toContain('contract=signals:2,checklist_after_context:true,complete:true');
    expect(result.output).toContain('environment=setup_failures:1,unresolved:0,setup:1,setup_ok:1,commands:npm ci,failures:javascript dependency or build artifact missing');
    expect(result.output).toContain('dependency=manifests:1,lockfiles:1,setup:true,setup_ok:true,validation:true,validation_ok:true,targets:node:package.json|node:package-lock.json');
    expect(result.output).toContain('decision=edits:1,predicted:1,verified:1,predictions:#5 src/app.ts -> ok: formatting total should satisfy billing assertion');
    expect(result.output).toContain('reliability=final_verifiers:2,final_ok:2,stable:true,broad_ok:true,ci_ok:false,regressions:0,latest:ok,commands:npm test|npm run build');
    expect(result.output).toContain('context=inspects:4,hits:1,misses:3,utilization:25.00%,risk:true,unused:read_file#2 src/unrelated.ts');
    expect(result.output).toContain('source_research=calls:1,hits:4,errors:0,sources:arxiv|github|huggingface|kaggle,github:repositories|issues,hf:papers,kaggle:competitions,result_sources:arxiv|github_repo|hf_paper|kaggle_competition,targeted:true,fresh:true,kaggle_skipped:false,recent_days:90,top:https://arxiv.org/abs/2602.08316|https://github.com/example/benchmark-agent,notes:targeted benchmark coverage requested');
    expect(result.output).toContain('efficiency=tools:8,usage_calls:2,tokens:1200,cost:$0.0000,cost_risk:false,invalid:0,invalid_pct:0.00,success_verifiers:1,process_score:95,process_defects:0,warnings:0');
  }, 15_000);

  it('surfaces bounded MemPalace memories as benchmark hypotheses', async () => {
    const root = makeRoot();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'billing-fixture',
      scripts: { test: 'vitest run' },
    }));
    writeFileSync(join(root, 'TASK.md'), [
      '# Task',
      '',
      '## Acceptance Criteria',
      '- Must show billing totals with two decimal places.',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'src', 'app.ts'), 'export const total = 12.3;\n');
    addDrawer({
      wing: 'projects',
      room: 'billing-fixture',
      content: 'billing-fixture lesson: totals should be formatted with fixed two decimal places before rendering invoices.',
      tags: ['billing-fixture', 'benchmark', 'formatting'],
      importance: 0.9,
      scope: 'project',
      cwd: root,
    });

    const result = await BenchmarkContextTool.call({ path: root }, process.cwd());

    expect(result.isError).toBe(false);
    expect(result.output).toContain('Relevant MemPalace Memories');
    expect(result.output).toContain('project:projects/billing-fixture');
    expect(result.output).toContain('totals should be formatted with fixed two decimal places');
    expect(result.output).toContain('Treat MemPalace memories as hypotheses');
    expect(result.output).toContain('verify each remembered fact against current files');
  });

  it('reports missing paths as errors', async () => {
    const result = await BenchmarkContextTool.call({ path: join(tmpdir(), 'definitely-missing-ventipus') }, process.cwd());
    expect(result.isError).toBe(true);
    expect(result.output).toContain('path does not exist');
  });
});
