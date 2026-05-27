import { describe, expect, it } from 'vitest';
import {
  BenchmarkRepoCatalogTool,
  decodeBenchmarkReposSentinel,
  encodeBenchmarkReposSentinel,
  filterBenchmarkRepoCatalog,
  formatBenchmarkRepoCatalog,
  formatBenchmarkRepoCatalogUsage,
  parseBenchmarkRepoCatalogCommandArgs,
  TERMINAL_BENCH_REPO_CATALOG,
  _internal,
} from '../src/benchmark-repos.js';
import { getToolNames } from '../src/tools/index.js';

describe('benchmark repo catalog', () => {
  it('registers a read-only tool', () => {
    expect(getToolNames()).toContain('benchmark_repo_catalog');
    expect(BenchmarkRepoCatalogTool.isReadOnly).toBe(true);
    expect(BenchmarkRepoCatalogTool.isDestructive).toBe(false);
  });

  it('contains official and related Terminal-Bench source mappings', () => {
    expect(TERMINAL_BENCH_REPO_CATALOG.length).toBeGreaterThanOrEqual(27);
    expect(TERMINAL_BENCH_REPO_CATALOG.some((entry) =>
      entry.project === 'Codex CLI' && entry.repos.some((repo) => repo.slug === 'openai/codex'),
    )).toBe(true);
    expect(TERMINAL_BENCH_REPO_CATALOG.some((entry) =>
      entry.project === 'Meta-Harness' && entry.status === 'related',
    )).toBe(true);
  });

  it('formats a bounded catalog with next-step repo digest guidance', () => {
    const output = formatBenchmarkRepoCatalog({ query: 'openhands', status: 'all', limit: 5 });

    expect(output).toContain('Terminal-Bench Public Repo Catalog');
    expect(output).toContain('OpenHands/openhands');
    expect(output).toContain('Source: Terminal-Bench 2.0 public source mapping report');
    expect(output).toContain('/repo-digest <owner/repo>');
  });

  it('filters by query and status', () => {
    const official = filterBenchmarkRepoCatalog({ query: 'codex', status: 'official' });
    const all = filterBenchmarkRepoCatalog({ query: 'codex', status: 'all' });

    expect(official.map((entry) => entry.project)).toContain('Codex CLI');
    expect(official.map((entry) => entry.project)).not.toContain('Simple Codex');
    expect(all.map((entry) => entry.project)).toContain('Simple Codex');
  });

  it('parses slash command flags and sentinel payloads', () => {
    const parsed = parseBenchmarkRepoCatalogCommandArgs('"terminal-agent" --all --limit 20 --repos-only');

    expect(parsed.error).toBeUndefined();
    expect(parsed.input).toMatchObject({
      query: 'terminal-agent',
      status: 'all',
      limit: 20,
      repos_only: true,
    });

    const encoded = encodeBenchmarkReposSentinel(parsed.input!);
    expect(encoded.startsWith('__BENCHMARK_REPOS__')).toBe(true);
    expect(decodeBenchmarkReposSentinel(encoded)).toEqual(parsed.input);
  });

  it('rejects unknown options with helpful usage', () => {
    const parsed = parseBenchmarkRepoCatalogCommandArgs('--unknown');

    expect(parsed.error).toContain('unknown option');
    expect(formatBenchmarkRepoCatalogUsage()).toContain('/benchmark-repos');
    expect(_internal.tokenizeArgs('"open ai" --all')).toEqual(['open ai', '--all']);
  });
});
