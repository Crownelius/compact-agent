import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * CLI Page Object — encapsulates spawning, interacting with, and asserting
 * on the Crowcoder CLI process. Mirrors the Page Object Model pattern used
 * in browser E2E tests but adapted for a REPL-based CLI application.
 */
export class CrowcoderCLI {
  private process: ChildProcessWithoutNullStreams | null = null;
  private configDir: string;
  private cwd: string;

  // Output accumulators
  private _stdout = '';
  private _stderr = '';

  constructor(options: { configDir?: string; cwd?: string } = {}) {
    this.configDir = options.configDir || this.createTempConfigDir();
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Create an isolated temp config directory (like the existing smoke tests do).
   */
  private createTempConfigDir(): string {
    const dir = join(tmpdir(), `crowcoder-e2e-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Get the path to the config file.
   */
  get configPath(): string {
    return join(this.configDir, 'config.json');
  }

  /**
   * Get the path to the users file.
   */
  get usersPath(): string {
    return join(this.configDir, 'users.json');
  }

  /**
   * Get the path to the sessions directory.
   */
  get sessionsDir(): string {
    return join(this.configDir, 'sessions');
  }

  /**
   * Spawn the CLI process with a clean environment.
   */
  async spawn(extraEnv: Record<string, string> = {}): Promise<void> {
    const binPath = join(process.cwd(), 'bin', 'crowcoder.js');

    this.process = spawn('node', [binPath], {
      cwd: this.cwd,
      env: {
        ...process.env,
        CROWCODER_HOME: this.configDir,
        NODE_OPTIONS: '--no-deprecation',
        ...extraEnv,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Accumulate output for assertions
    this.process.stdout.on('data', (data) => {
      this._stdout += data.toString();
    });
    this.process.stderr.on('data', (data) => {
      this._stderr += data.toString();
    });

    // Wait for initial prompt
    await this.waitForOutput(/crowcoder|setup|Choose a provider/i, { timeout: 10_000 });
  }

  /**
   * Send input to the CLI and wait for the response.
   */
  async send(input: string, waitForPrompt: boolean = true): Promise<string> {
    if (!this.process) throw new Error('CLI not spawned');

    const before = this._stdout.length;

    this.process.stdin.write(input + '\n');

    if (waitForPrompt) {
      // Wait for the prompt symbol or a reasonable delay
      await this.waitForOutput(/▶|crowcoder|Choice|API Key|Model|Permission|Theme|command/i, { timeout: 5_000 });
    }

    return this.stdoutSince(before);
  }

  /**
   * Get stdout content since a given length.
   */
  stdoutSince(startLen: number): string {
    return this._stdout.slice(startLen);
  }

  /**
   * Get all accumulated stdout.
   */
  get stdout(): string {
    return this._stdout;
  }

  /**
   * Get all accumulated stderr.
   */
  get stderr(): string {
    return this._stderr;
  }

  /**
   * Wait for a specific pattern in stdout.
   */
  async waitForOutput(
    pattern: RegExp | string,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<boolean> {
    const { timeout = 15_000, interval = 100 } = options;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(escapeRegex(pattern));
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (regex.test(this._stdout)) return true;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Wait for the process to exit.
   */
  async waitForExit(options: { timeout?: number } = {}): Promise<number> {
    const { timeout = 10_000 } = options;
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('CLI not spawned'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('Timed out waiting for exit')), timeout);
      this.process.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
  }

  /**
   * Send /exit or /quit to gracefully close the CLI.
   */
  async exit(): Promise<void> {
    if (!this.process) return;
    try {
      this.process.stdin.write('/exit\n');
      await this.waitForExit({ timeout: 5_000 });
    } catch {
      this.process.kill();
    }
  }

  /**
   * Force-kill the process.
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Read the current config file.
   */
  readConfig(): Record<string, unknown> | null {
    if (!existsSync(this.configPath)) return null;
    return JSON.parse(readFileSync(this.configPath, 'utf-8'));
  }

  /**
   * Read the current users file.
   */
  readUsers(): Record<string, unknown> | null {
    if (!existsSync(this.usersPath)) return null;
    return JSON.parse(readFileSync(this.usersPath, 'utf-8'));
  }

  /**
   * Write a config file directly (simulates pre-existing config).
   */
  writeConfig(config: Record<string, unknown>): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Check if config file exists.
   */
  configExists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Clean up temp resources.
   */
  cleanup(): void {
    this.kill();
    try {
      rmSync(this.configDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Run the complete setup wizard programmatically.
   * Returns the sequence of outputs for assertion.
   */
  async runSetupWizard({
    providerIndex = 0,
    apiKey = 'test-api-key-12345',
    model = 'test-model',
    permissionMode = 'ask' as 'ask' | 'auto' | 'yolo',
  }: {
    providerIndex?: number;
    apiKey?: string;
    model?: string;
    permissionMode?: 'ask' | 'auto' | 'yolo';
  } = {}): Promise<string> {
    if (!this.process) throw new Error('CLI not spawned');

    const outputs: string[] = [];

    // Wait for provider prompt
    await this.waitForOutput('Choose a provider');

    // Select provider
    this.process.stdin.write(`${providerIndex + 1}\n`);
    await this.waitForOutput(/API Key|Base URL|Model/i, { timeout: 5_000 });

    // Enter API key (if prompted)
    const apiKeyPattern = /API Key for/i;
    if (apiKeyPattern.test(this._stdout)) {
      this.process.stdin.write(`${apiKey}\n`);
    }

    // Wait for model prompt and enter model
    await this.waitForOutput(/Model.*\[/i, { timeout: 5_000 });
    this.process.stdin.write(`${model}\n`);

    // Wait for permission mode prompt
    await this.waitForOutput(/Permission mode|ask.*auto.*yolo/i, { timeout: 5_000 });
    const permIndex = ['ask', 'auto', 'yolo'].indexOf(permissionMode);
    this.process.stdin.write(`${permIndex + 1}\n`);

    // Wait for config saved confirmation
    await this.waitForOutput(/Config saved/i, { timeout: 5_000 });

    return this._stdout;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}