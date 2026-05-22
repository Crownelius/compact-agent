import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a temp config dir so commands like /dry-run that call saveConfig() can't
// clobber the user's real config. MUST be set BEFORE dist is imported.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'crowcoder-smoke-'));
process.env.CROWCODER_HOME = TMP_HOME;

const dist = path.join(__dirname, '..', 'dist', 'index.js');
if (!fs.existsSync(dist)) {
  throw new Error('dist/index.js missing. Run: npx tsc');
}
const mod = await import(pathToFileURL(dist).href);
const { handleSlashCommand } = mod;

describe('Smoke Tests — handleSlashCommand', () => {
  const config = {
    apiKey: '',
    baseURL: 'http://localhost:8080/v1',
    model: 'test-model',
    provider: 'OpenRouter',
    maxTokens: 8192,
    temperature: 0.3,
    permissionMode: 'yolo' as const,
    dryRun: false,
    theme: 'full' as const,
    showThinking: false,
  };
  const messages: never[] = [];
  const session = {
    id: 'smoke-session',
    cwd: process.cwd(),
    model: 'test-model',
    provider: 'OpenRouter',
    mode: 'dev' as const,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const mode = { current: 'dev' as const };

  const tests: [string, 'local' | 'llm' | 'local-error'][] = [
    // General
    ['/help', 'local'],
    ['/clear', 'local'],
    ['/history', 'local'],
    ['/export md', 'local'],
    // Model & Provider
    ['/model', 'local'],
    ['/models', 'local'],
    ['/provider', 'local'],
    // Modes
    ['/mode dev', 'local'],
    ['/mode hermes', 'local'],
    ['/mode dev', 'local'],
    ['/modes', 'local'],
    ['/hermes', 'local'],
    ['/mode dev', 'local'],
    // Session
    ['/sessions', 'local'],
    // Git
    ['/diff', 'local'],
    ['/log 5', 'local'],
    // Code quality — LLM-driven
    ['/tdd add login button', 'llm'],
    ['/security-review', 'llm'],
    ['/build-fix', 'llm'],
    ['/refactor', 'llm'],
    ['/e2e checkout flow', 'llm'],
    ['/eval correctness', 'llm'],
    ['/plan add user profiles', 'llm'],
    ['/verify', 'llm'],
    ['/test-coverage', 'llm'],
    ['/update-docs', 'llm'],
    // Tools & config
    ['/tools', 'local'],
    ['/rules', 'local'],
    ['/perm', 'local'],
    ['/dry-run', 'local'],
    ['/dry-run', 'local'],
    ['/hooks', 'local'],
    ['/hook-profile', 'local'],
    // Audit + detection
    ['/audit', 'local'],
    ['/detect', 'local'],
    // Planning & docs
    ['/checkpoints', 'local'],
    ['/search-first refactor parser', 'llm'],
    ['/docs-lookup fetch API', 'llm'],
    // Language reviews
    ['/auto-review', 'llm'],
    ['/ts-review', 'llm'],
    ['/py-review', 'llm'],
    ['/go-review', 'llm'],
    ['/rust-review', 'llm'],
    ['/java-review', 'llm'],
    ['/cpp-review', 'llm'],
    ['/kotlin-review', 'llm'],
    ['/php-review', 'llm'],
    ['/db-review', 'llm'],
    // Language build fixes
    ['/ts-build-fix', 'llm'],
    ['/go-build-fix', 'llm'],
    ['/rust-build-fix', 'llm'],
    ['/java-build-fix', 'llm'],
    ['/cpp-build-fix', 'llm'],
    ['/pytorch-fix', 'llm'],
    // Orchestration
    ['/orchestrate refactor billing', 'llm'],
    ['/pr-loop', 'llm'],
    ['/multi-plan refactor billing', 'llm'],
    ['/multi-execute step 1', 'llm'],
    ['/multi-backend users,billing', 'llm'],
    ['/multi-frontend header,footer', 'llm'],
    // Codemaps
    ['/codemap', 'local'],
    // Skills & patterns
    ['/skills', 'local'],
    ['/skill-create', 'llm'],
    ['/git-patterns', 'local'],
    ['/git-workflow', 'local'],
    // Learning & cost
    ['/usage', 'local'],
    ['/instincts', 'local'],
    ['/prune', 'local'],
    ['/memory', 'local'],
    // Content engine
    ['/article 5 productivity hacks', 'llm'],
    ['/slides intro to TDD 10', 'llm'],
    ['/repurpose AI safety primer', 'llm'],
    ['/market-research dev tools', 'llm'],
    ['/investor-deck a TDD coach SaaS', 'llm'],
    ['/code-quality', 'llm'],
    ['/skill-stocktake', 'llm'],
    // Walkthrough
    ['/walkthrough', 'llm'],
    ['/tour', 'llm'],
    ['/guide', 'llm'],
    // ECC
    ['/ecc', 'local'],
    ['/ecc-skills', 'local'],
    ['/ecc-agents', 'local'],
    ['/ecc-commands', 'local'],
    // ECC slash commands (/ecc-tdd, /ecc-feature-development, etc.)
    // were collapsed in v1.25.0 — the bundled ECC harness works
    // automatically now and the per-skill slash names became silent
    // aliases that just print a hint. They return handled:true with
    // no injectPrompt, so they're classified as 'local' here. Tests
    // pinned to the old 'llm' contract were broken since the
    // refactor; this is the canonical fix.
    ['/ecc-tdd add login', 'local'],
    ['/ecc-feature-development add auth', 'local'],
    ['/ecc-database-migration add users table', 'local'],
    ['/ecc-add-language-rules typescript', 'local'],
    ['/ecc-bogus-name', 'local-error'],
  ];

  for (const [cmd, kind] of tests) {
    it(`[${kind}] ${cmd}`, () => {
      let res: unknown;
      let threw: Error | null = null;
      try {
        res = handleSlashCommand(cmd, config, messages, session, mode);
      } catch (e) {
        threw = e instanceof Error ? e : new Error(String(e));
      }

      if (kind === 'local' || kind === 'local-error') {
        expect(threw).toBeNull(`command should not throw: ${cmd}`);
        expect(res).toBeDefined(`command should return a result: ${cmd}`);
        expect(typeof res).toBe('object');
        expect((res as { handled: boolean }).handled).toBe(true);
      } else if (kind === 'llm') {
        expect(threw).toBeNull(`command should not throw: ${cmd}`);
        expect(res).toBeDefined(`command should return a result: ${cmd}`);
        expect(typeof res).toBe('object');
        expect((res as { handled: boolean }).handled).toBe(false);
        const prompt = (res as { injectPrompt?: string }).injectPrompt;
        expect(typeof prompt).toBe('string');
        expect(prompt!.length).toBeGreaterThanOrEqual(50);
      }
    });
  }
});