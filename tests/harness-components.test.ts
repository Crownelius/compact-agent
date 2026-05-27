import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HarnessComponentsTool, _internal } from '../src/tools/harness-components.js';
import { getToolByName, getToolNames } from '../src/tools/index.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ventipus-harness-'));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content = ''): void {
  const full = join(root, ...path.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('harness_components tool', () => {
  it('is registered as a read-only tool', () => {
    expect(getToolNames()).toContain('harness_components');
    expect(getToolByName('harness_components')).toBe(HarnessComponentsTool);
    expect(HarnessComponentsTool.isReadOnly).toBe(true);
    expect(HarnessComponentsTool.isDestructive).toBe(false);
  });

  it('maps Ventipus harness surfaces to files, tests, docs, and edit contracts', async () => {
    const root = makeRoot();
    write(root, 'package.json', JSON.stringify({ name: 'ventipus', version: '9.9.9' }));
    write(root, 'src/system-prompt.ts');
    write(root, 'src/modes.ts');
    write(root, 'src/tools/bash.ts');
    write(root, 'src/tools/research-sources.ts');
    write(root, 'src/query.ts');
    write(root, 'src/live-queue.ts');
    write(root, 'src/mempalace/index.ts');
    write(root, 'src/tools/memory.ts');
    write(root, 'src/openai-oauth.ts');
    write(root, 'src/openai-smoke.ts');
    write(root, 'src/command-palette.ts');
    write(root, 'resources/ecc/skills/example/SKILL.md');
    write(root, 'resources/ecc/agents/planner.md');
    write(root, 'resources/terminal_bench/ventipus_agent.py');
    write(root, 'bench/README.md');
    write(root, 'README.md');
    write(root, 'COMMANDS.md');
    write(root, 'tests/query-liveness.test.ts');
    write(root, 'tests/openai-oauth.test.ts');
    write(root, 'tests/research-sources.test.ts');
    write(root, 'tests/terminal-bench-adapter.test.ts');
    write(root, 'tests/smoke-commands.test.ts');

    const result = await HarnessComponentsTool.call({ path: root, max_files_per_component: 6 }, process.cwd());

    expect(result.isError).toBe(false);
    expect(result.output).toContain('Package: ventipus@9.9.9');
    expect(result.output).toContain('System Prompts And Modes');
    expect(result.output).toContain('Tool Descriptions And Implementations');
    expect(result.output).toContain('Runtime Middleware And Turn Control');
    expect(result.output).toContain('Long-Term Memory');
    expect(result.output).toContain('Providers, Models, And Auth');
    expect(result.output).toContain('Benchmark Adapters And Evidence Artifacts');
    expect(result.output).toContain('CLI UX, Slash Commands, And Accessibility');
    expect(result.output).toContain('src/openai-oauth.ts');
    expect(result.output).toContain('tests/openai-oauth.test.ts');
    expect(result.output).toContain('Prediction:');
    expect(result.output).not.toContain('hf_');
    expect(result.output).not.toContain('sk-or-v1-');
  });

  it('filters to one component and rejects unsupported filters', () => {
    const root = makeRoot();
    write(root, 'package.json', JSON.stringify({ name: 'ventipus' }));
    write(root, 'src/openai-oauth.ts');
    write(root, 'tests/openai-oauth.test.ts');

    const providers = _internal.buildHarnessComponentsReport({ path: root, component: 'providers' }, process.cwd());
    expect(providers.isError).toBe(false);
    expect(providers.output).toContain('components: 1 shown');
    expect(providers.output).toContain('Providers, Models, And Auth');
    expect(providers.output).not.toContain('Long-Term Memory');

    const bad = _internal.buildHarnessComponentsReport({ path: root, component: 'bogus' }, process.cwd());
    expect(bad.isError).toBe(true);
    expect(bad.output).toContain('unsupported component');
  });

  it('reports missing paths cleanly', () => {
    const result = _internal.buildHarnessComponentsReport({ path: join(tmpdir(), 'no-such-ventipus-harness') }, process.cwd());
    expect(result.isError).toBe(true);
    expect(result.output).toContain('path does not exist');
  });
});
