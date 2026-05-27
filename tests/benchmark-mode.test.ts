import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkPrompt,
  normalizeBenchmarkProfile,
  splitBenchmarkArgs,
} from '../src/evaluation.js';
import { MODES } from '../src/modes.js';

describe('benchmark mode and prompt', () => {
  it('registers a benchmark mode with verification and leakage guidance', () => {
    const mode = MODES.benchmark;
    expect(mode.description).toContain('SWE-bench');
    expect(mode.systemPromptAddition).toContain('Verify');
    expect(mode.systemPromptAddition).toContain('gold patches');
    expect(mode.systemPromptAddition).toContain('benchmark_context');
    expect(mode.suggestedTools).toContain('bash');
    expect(mode.suggestedTools).toContain('benchmark_context');
    expect(mode.suggestedTools).toContain('todo_write');
    expect(mode.suggestedTools).toContain('memory_search');
    expect(mode.systemPromptAddition).toContain('github_kind:"all"');
    expect(mode.systemPromptAddition).toContain('kaggle_kind:"both"');
    expect(mode.systemPromptAddition).toContain('recent_days:90');
    expect(mode.systemPromptAddition).toContain('replay=');
    expect(mode.systemPromptAddition).toContain('Source digest');
  });

  it('normalizes benchmark profile aliases', () => {
    expect(normalizeBenchmarkProfile('swe')).toBe('swe-bench');
    expect(normalizeBenchmarkProfile('swebench')).toBe('swe-bench');
    expect(normalizeBenchmarkProfile('tbench')).toBe('terminal-bench');
    expect(normalizeBenchmarkProfile('contextbench')).toBe('swe-context');
    expect(normalizeBenchmarkProfile('swechain')).toBe('swe-chain');
    expect(normalizeBenchmarkProfile('ci-repair-bench')).toBe('ci-repair');
    expect(normalizeBenchmarkProfile('swe-ci')).toBe('ci-repair');
    expect(normalizeBenchmarkProfile('wildclawbench')).toBe('wildclaw');
    expect(normalizeBenchmarkProfile('arc-prize')).toBe('arc-agi');
    expect(normalizeBenchmarkProfile('spec-bench')).toBe('specbench');
    expect(normalizeBenchmarkProfile('rhb')).toBe('reward-hacking');
    expect(normalizeBenchmarkProfile('unknown')).toBe('auto');
  });

  it('splits optional benchmark profile from task text', () => {
    expect(splitBenchmarkArgs('swe-bench fix django issue')).toEqual({
      profile: 'swe-bench',
      task: 'fix django issue',
    });
    expect(splitBenchmarkArgs('terminal-bench train a model')).toEqual({
      profile: 'terminal-bench',
      task: 'train a model',
    });
    expect(splitBenchmarkArgs('swe-chain upgrade package graph')).toEqual({
      profile: 'swe-chain',
      task: 'upgrade package graph',
    });
    expect(splitBenchmarkArgs('ci-repair fix failing github actions')).toEqual({
      profile: 'ci-repair',
      task: 'fix failing github actions',
    });
    expect(splitBenchmarkArgs('wildclaw solve BrowseComp task')).toEqual({
      profile: 'wildclaw',
      task: 'solve BrowseComp task',
    });
    expect(splitBenchmarkArgs('arc-agi solve grid abstraction')).toEqual({
      profile: 'arc-agi',
      task: 'solve grid abstraction',
    });
    expect(splitBenchmarkArgs('specbench satisfy full spec')).toEqual({
      profile: 'specbench',
      task: 'satisfy full spec',
    });
    expect(splitBenchmarkArgs('reward-hacking solve without evaluator shortcuts')).toEqual({
      profile: 'reward-hacking',
      task: 'solve without evaluator shortcuts',
    });
    expect(splitBenchmarkArgs('fix parser bug')).toEqual({
      profile: 'auto',
      task: 'fix parser bug',
    });
  });

  it('builds SWE-bench prompts around patches, tests, and anti-leakage', () => {
    const prompt = buildBenchmarkPrompt('fix failing pandas issue', 'C:/repo', 'swe-bench');
    expect(prompt).toContain('Working directory: C:/repo');
    expect(prompt).toContain('SWE-bench / SWE-rebench');
    expect(prompt).toContain('source patch');
    expect(prompt).toContain('fail-to-pass tests');
    expect(prompt).toContain('Do not inspect gold patches');
    expect(prompt).toContain('benchmark_context');
    expect(prompt).toContain('Automatic Preflight Snapshot');
    expect(prompt).toContain('Source-Grounded Method Stack');
    expect(prompt).toContain('localization dossier');
    expect(prompt).toContain('research_sources');
    expect(prompt).toContain('github_kind:"all"');
    expect(prompt).toContain('kind:"all"');
    expect(prompt).toContain('kaggle_kind:"both"');
    expect(prompt).toContain('recent_days:90');
    expect(prompt).toContain('Source digest');
    expect(prompt).toContain('replay=');
    expect(prompt).toContain('Verify under benchmark pressure');
  });

  it('builds Terminal-Bench prompts around verifier-driven terminal work', () => {
    const prompt = buildBenchmarkPrompt('complete the sandbox task', '/workspace', 'terminal-bench');
    expect(prompt).toContain('Terminal-Bench style terminal task');
    expect(prompt).toContain('task verifier passing');
    expect(prompt).toContain('oracle/reference solution');
    expect(prompt).toContain('test script');
  });

  it('builds context prompts that use memory as verified hypotheses', () => {
    const prompt = buildBenchmarkPrompt('reuse prior fix pattern', '/workspace', 'swe-context');
    expect(prompt).toContain('SWE-ContextBench');
    expect(prompt).toContain('Search project/global memory');
    expect(prompt).toContain('hypothesis');
    expect(prompt).toContain('bounded replay checkpoints');
    expect(prompt).toContain('validating it against current files');
  });

  it('builds SWE-Chain prompts around dependency upgrade continuity', () => {
    const prompt = buildBenchmarkPrompt('upgrade chained package versions', '/workspace', 'swe-chain');
    expect(prompt).toContain('SWE-Chain style chained package upgrade');
    expect(prompt).toContain('package manager and lockfile');
    expect(prompt).toContain('release-note breaking changes');
    expect(prompt).toContain('subsequent chain steps');
  });

  it('builds CI-Repair prompts around workflow reconstruction', () => {
    const prompt = buildBenchmarkPrompt('repair the failing CI workflow', '/workspace', 'ci-repair');
    expect(prompt).toContain('CI-Repair style repository workflow validation');
    expect(prompt).toContain('Reconstruct CI locally');
    expect(prompt).toContain('services, containers, matrix language versions');
    expect(prompt).toContain('missing-secret cases');
  });

  it('builds WildClawBench prompts around native-runtime agent contracts', () => {
    const prompt = buildBenchmarkPrompt('solve BrowseComp and safety alignment task', '/workspace', 'wildclaw');
    expect(prompt).toContain('WildClawBench style native-runtime agent task');
    expect(prompt).toContain('sub-benchmark');
    expect(prompt).toContain('action schema');
    expect(prompt).toContain('browser/search/email/calendar/API');
    expect(prompt).toContain('hidden grading scripts');
  });

  it('builds ARC-AGI prompts around interactive exploration and no leakage', () => {
    const prompt = buildBenchmarkPrompt('solve the Kaggle ARC environment', '/workspace', 'arc-agi');
    expect(prompt).toContain('ARC-AGI-3 / ARC Prize');
    expect(prompt).toContain('interactive environment');
    expect(prompt).toContain('train/public versus hidden evaluation boundary');
    expect(prompt).toContain('output artifact');
    expect(prompt).toContain('Do not hardcode hidden answers');
  });

  it('builds SpecBench prompts around visible tests and held-out behavior', () => {
    const prompt = buildBenchmarkPrompt('pass visible tests without reward hacking', '/workspace', 'specbench');
    expect(prompt).toContain('SpecBench style long-horizon specification-compliance task');
    expect(prompt).toContain('visible tests as necessary but not sufficient');
    expect(prompt).toContain('natural-language specification');
    expect(prompt).toContain('hardcoded sample inputs');
    expect(prompt).toContain('specification checklist items remain incomplete');
  });

  it('builds reward-hacking prompts around evaluation integrity', () => {
    const prompt = buildBenchmarkPrompt('avoid evaluator shortcuts', '/workspace', 'reward-hacking');
    expect(prompt).toContain('Reward Hacking Benchmark / evaluation-integrity task');
    expect(prompt).toContain('tool-use integrity benchmark');
    expect(prompt).toContain('tamper with evaluators');
    expect(prompt).toContain('score/result files');
    expect(prompt).toContain('train/test or public/private boundaries');
  });
});
