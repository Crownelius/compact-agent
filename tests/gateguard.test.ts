/**
 * Coverage for bin/ecc-hooks.cjs gateguard check.
 *
 * The hook is security-critical — bugs here let a model bypass the
 * "investigate before editing" gate. v1.27.1 added a yolo bypass +
 * env-var disable knob; v1.27.2 added a "skip non-existent files"
 * branch; v1.28.1 added sessionId sanitization to plug a path-
 * traversal. These tests pin each of those.
 *
 * Strategy: spawn the hook directly with carefully-crafted env, check
 * exit code (0 = allow, 2 = block) + stderr. The hook is a CJS
 * Node.js script with no other deps so this is fast (~50ms per spawn).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(process.cwd(), 'bin', 'ecc-hooks.cjs');

// Reusable spawn helper. Sets only the env we explicitly pass; never
// inherits HOME or COMPACT_AGENT_* from the test runner's environment.
function runHook(check: string, env: Record<string, string>): {
  exitCode: number; stdout: string; stderr: string;
} {
  const result = spawnSync('node', [HOOK, check, '__ecc__'], {
    env: {
      // Keep PATH so node can find itself, but strip everything else.
      PATH: process.env.PATH || '',
      ...env,
    },
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('gateguard hook', () => {
  let tmpDir: string;
  let existingFile: string;
  let nonExistentFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gateguard-test-'));
    existingFile = join(tmpDir, 'existing.ts');
    nonExistentFile = join(tmpDir, 'brand-new.ts');
    writeFileSync(existingFile, 'export const x = 1;\n');
  });

  describe('yolo bypass (v1.27.1)', () => {
    it('returns ok() when COMPACT_AGENT_PERMISSION_MODE=yolo', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_PERMISSION_MODE: 'yolo',
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: 'test-session',
      });
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toBe('');
    });

    it('honors the legacy CROWCODER_PERMISSION_MODE for back-compat', () => {
      const r = runHook('gateguard', {
        CROWCODER_PERMISSION_MODE: 'yolo',
        CROWCODER_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        CROWCODER_SESSION_ID: 'test-session',
      });
      expect(r.exitCode).toBe(0);
    });

    it('does NOT bypass when permission mode is anything else', () => {
      // Run on an EXISTING file (not the new-file bypass) so we know
      // we'd see a block if yolo wasn't the gating factor.
      const r = runHook('gateguard', {
        COMPACT_AGENT_PERMISSION_MODE: 'ask',
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: `test-${Date.now()}`,
      });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('First Edit/Write');
    });
  });

  describe('env-var disable knob (v1.27.1)', () => {
    for (const val of ['off', 'OFF', 'false', '0', 'no', 'disabled']) {
      it(`returns ok() when COMPACT_AGENT_GATEGUARD=${val}`, () => {
        const r = runHook('gateguard', {
          COMPACT_AGENT_GATEGUARD: val,
          COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
          COMPACT_AGENT_SESSION_ID: `test-${Date.now()}`,
        });
        expect(r.exitCode).toBe(0);
      });
    }

    it('does NOT bypass on garbage env values', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_GATEGUARD: 'maybe',
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: `test-${Date.now()}`,
      });
      expect(r.exitCode).toBe(2);
    });
  });

  describe('non-existent file bypass (v1.27.2)', () => {
    it('returns ok() for a file that does not exist', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: nonExistentFile }),
        COMPACT_AGENT_SESSION_ID: `test-${Date.now()}`,
      });
      expect(r.exitCode).toBe(0);
      expect(existsSync(nonExistentFile)).toBe(false);
    });

    it('blocks first edit to an EXISTING file', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: `test-${Date.now()}`,
      });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('First Edit/Write');
    });
  });

  describe('sessionId path-traversal sanitization (v1.28.1)', () => {
    // The state file is written under ~/.compact-agent/state/gateguard/
    // <sessionId>.json. Without sanitization, a sessionId of
    // "../../../escape" would write outside that dir.
    const stateDir = join(homedir(), '.compact-agent', 'state', 'gateguard');

    it('falls back to "unknown" on a path-traversal sessionId', () => {
      // Use a UNIQUE existing file so the per-file lock for "unknown"
      // can't have been set by an earlier test run.
      const uniqueFile = join(tmpDir, `unique-${Date.now()}.ts`);
      writeFileSync(uniqueFile, 'x');
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: uniqueFile }),
        COMPACT_AGENT_SESSION_ID: '../../../escape',
      });
      // Should block (it's an existing file, no yolo, no disable) AND
      // should not have written outside the state dir.
      expect(r.exitCode).toBe(2);
      // The escape path must not have been created
      const traversalTarget = join(homedir(), '.compact-agent', 'state', 'escape.json');
      expect(existsSync(traversalTarget)).toBe(false);
      // The "unknown" fallback path SHOULD exist
      const fallback = join(stateDir, 'unknown.json');
      // (only assert if the state dir exists — might not on fresh CI)
      if (existsSync(stateDir)) {
        expect(existsSync(fallback)).toBe(true);
      }
    });

    it('accepts valid sessionIds (alphanumeric + dash + underscore, <=64)', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: 'abc-123_DEF',
      });
      // Block (existing file, no bypass) but with the real session id
      expect(r.exitCode).toBe(2);
    });

    it('rejects shell-injection-style sessionIds', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: JSON.stringify({ file_path: existingFile }),
        COMPACT_AGENT_SESSION_ID: 'foo;rm -rf /',
      });
      // Falls back to "unknown" silently; still blocks the existing-file edit
      expect(r.exitCode).toBe(2);
    });
  });

  describe('malformed tool input (v1.28.1 fail-closed fix)', () => {
    it('blocks when COMPACT_AGENT_TOOL_INPUT is non-empty malformed JSON', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_TOOL_INPUT: 'not valid json {{{',
        COMPACT_AGENT_SESSION_ID: 'test',
      });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('not valid JSON');
    });

    it('allows when tool input env var is empty/unset (legitimate for SessionStart events)', () => {
      const r = runHook('gateguard', {
        COMPACT_AGENT_SESSION_ID: 'test',
      });
      // No tool input + no file_path → empty-path guard returns ok()
      expect(r.exitCode).toBe(0);
    });
  });

});
