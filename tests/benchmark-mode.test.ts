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
});
