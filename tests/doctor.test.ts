import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDoctorReport, formatDoctorReport } from '../src/doctor.js';
import pkg from '../package.json' with { type: 'json' };

const tempDirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ventipus-doctor-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('doctor readiness checks', () => {
  it('builds a non-secret readiness report without registry access', () => {
    const secret = 'sensitive-provider-token-value';
    const report = buildDoctorReport({
      includeRegistry: false,
      env: {
        ...process.env,
        VENTIPUS_HOME: tempHome(),
        VENTIPUS_PROVIDER: 'openrouter',
        VENTIPUS_MODEL: 'openrouter/free',
        VENTIPUS_API_KEY: secret,
        HF_TOKEN: secret,
        KAGGLE_USERNAME: 'tester',
        KAGGLE_KEY: secret,
      },
    });

    const text = `${JSON.stringify(report)}\n${formatDoctorReport(report)}`;
    expect(report.version).toBe(pkg.version);
    expect(report.checks.some((check) => check.id === 'benchmark_adapters' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'openrouter_free_tier' && check.status === 'pass')).toBe(true);
    expect(text).not.toContain(secret);
  });

  it('prints JSON from the CLI wrapper before first-time setup', () => {
    const out = execFileSync('node', ['bin/ventipus.js', '--doctor-json', '--doctor-no-registry'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        VENTIPUS_HOME: tempHome(),
        VENTIPUS_PROVIDER: 'openrouter',
        VENTIPUS_MODEL: 'openrouter/free',
        VENTIPUS_API_KEY: 'test-token-value',
      },
    });
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe(pkg.version);
    expect(parsed.checks.some((check: { id: string }) => check.id === 'registry_latest')).toBe(true);
    expect(parsed.summary.fail).toBe(0);
  });
});
