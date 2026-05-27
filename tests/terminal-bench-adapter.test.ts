import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('Terminal-Bench adapter packaging', () => {
  const adapterPath = join(process.cwd(), 'resources', 'terminal_bench', 'ventipus_agent.py');
  const setupPath = join(process.cwd(), 'resources', 'terminal_bench', 'setup.sh');

  it('ships an importable adapter and setup script under resources', () => {
    expect(existsSync(adapterPath)).toBe(true);
    expect(existsSync(setupPath)).toBe(true);
    const adapter = readFileSync(adapterPath, 'utf-8');
    expect(adapter).toContain('AbstractInstalledAgent');
    expect(adapter).toContain('VentipusTerminalBenchAgent');
    expect(adapter).toContain('/benchmark terminal-bench');
    expect(adapter).toContain('ventipus');
    expect(adapter).toContain('--perm yolo');
    expect(adapter).toContain('VENTIPUS_BASH_TIMEOUT_MS');
    expect(adapter).toContain('VENTIPUS_BUNDLE_ROOT');
    expect(adapter).toContain('VENTIPUS_COMPACTION_MODEL');
    expect(adapter).toContain('--benchmark-trace-dir .ventipus/trace');
    expect(adapter).toContain('.ventipus/benchmark-summary.json');
    expect(adapter).toContain('.ventipus/benchmark-trace.jsonl');
    expect(adapter).toContain('.ventipus/agent-context-compiled.jsonl');
    expect(adapter).toContain('.ventipus/submission-bundle-manifest.json');
    expect(adapter).toContain('.ventipus/benchmark.patch');
    expect(adapter).toContain('redact_ventipus_artifact');
    expect(adapter).toContain('sk-or-v1-[A-Za-z0-9_-]+');
    expect(adapter).toContain('hf_[A-Za-z0-9]{16,}');
    expect(adapter).toContain('KGAT_[A-Za-z0-9]{16,}');
    expect(adapter).toContain('npm_[A-Za-z0-9]{16,}');
    expect(adapter).toContain('| redact_ventipus_artifact > .ventipus/benchmark.patch');
    expect(adapter).toContain('| redact_ventipus_artifact > .ventipus/git-status.txt');
    expect(adapter).toContain('git diff --binary --no-ext-diff');
    expect(adapter).toContain('git diff --cached --binary --no-ext-diff');
    expect(adapter).toContain('git ls-files --others --exclude-standard');
    expect(adapter).toContain('bash -lc');
    expect(adapter).toContain('git-status.txt');
    expect(adapter).toContain('trace summary: .ventipus/benchmark-summary.json');
    expect(adapter).toContain('tool trace: .ventipus/benchmark-trace.jsonl');
    expect(adapter).toContain('context compilation: .ventipus/agent-context-compiled.jsonl');
    expect(adapter).toContain('submission bundle: .ventipus/submission-bundle-manifest.json');
  });

  it('prefers offline/local install sources before registry install', () => {
    const setup = readFileSync(setupPath, 'utf-8');
    expect(setup).toContain('VENTIPUS_INSTALL_SPEC');
    expect(setup).toContain('VENTIPUS_BUNDLE_ROOT');
    expect(setup).toContain('VENTIPUS_BUNDLE_TARBALL');
    expect(setup).toContain('install_from_bundle_root "$PACKAGE_ROOT"');
    expect(setup).toContain('install_from_tarball "$candidate"');
    expect(setup).toContain('npm install -g');
    expect(setup).toContain('ventipus@latest');
    expect(setup).toContain('command -v ventipus');
    expect(setup.indexOf('command -v ventipus')).toBeLessThan(setup.indexOf('apt-get update'));
    expect(setup.indexOf('try_offline_install')).toBeLessThan(setup.lastIndexOf('VENTIPUS_INSTALL_SPEC'));
  });

  it('prints the packaged adapter path from the CLI wrapper', () => {
    const out = execFileSync('node', ['bin/ventipus.js', '--print-terminal-bench-adapter'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(normalize(out)).toBe(normalize(adapterPath));
  });

  it('accepts common harness CLI flags before utility flags', () => {
    const out = execFileSync('node', [
      'bin/ventipus.js',
      '--model', 'openrouter/free',
      '--max-turns=3',
      '--output-format', 'text',
      '--benchmark-trace-dir', 'artifacts',
      '--print-terminal-bench-adapter',
    ], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(normalize(out)).toBe(normalize(adapterPath));
  });
});
