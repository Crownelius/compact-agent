/**
 * Hook system — configurable pre/post tool execution hooks.
 * Hooks are scripts in ~/.crowcoder/hooks/ that fire on events:
 *   - PreToolUse:  before a tool runs (can block)
 *   - PostToolUse: after a tool runs (can log/alert)
 *   - SessionStart: when a session begins
 *   - SessionStop:  when a session ends
 *
 * Hook config in ~/.crowcoder/hooks.json:
 * {
 *   "hooks": [
 *     { "event": "PreToolUse", "match": "bash", "command": "node guard.js" },
 *     { "event": "PostToolUse", "match": "*", "command": "node logger.js" }
 *   ]
 * }
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { getConfigDir } from './config.js';
import { shouldRunHook } from './hook-controls.js';

const HOOKS_DIR = join(getConfigDir(), 'hooks');
const HOOKS_CONFIG = join(getConfigDir(), 'hooks.json');

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'SessionStart' | 'SessionStop';

export interface HookDef {
  event: HookEvent;
  match: string;          // tool name glob or "*"
  command: string;        // shell command to run
  timeout?: number;       // ms, default 10000
  blocking?: boolean;     // if true (default for PreToolUse), can cancel the operation
  enabled?: boolean;      // default true
}

export interface HooksConfig {
  hooks: HookDef[];
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  sessionId?: string;
  cwd: string;
}

export interface HookResult {
  allowed: boolean;       // false = blocked by hook
  message?: string;       // reason for blocking
}

function loadHooksConfig(): HooksConfig {
  if (!existsSync(HOOKS_CONFIG)) {
    return { hooks: [] };
  }
  try {
    return JSON.parse(readFileSync(HOOKS_CONFIG, 'utf-8'));
  } catch {
    return { hooks: [] };
  }
}

export function initHooksDir(): void {
  mkdirSync(HOOKS_DIR, { recursive: true });
  if (!existsSync(HOOKS_CONFIG)) {
    const defaultConfig: HooksConfig = {
      hooks: [
        {
          event: 'PostToolUse',
          match: '*',
          command: 'echo "Tool $CROWCODER_TOOL used"',
          blocking: false,
          enabled: false,
        },
      ],
    };
    writeFileSync(HOOKS_CONFIG, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
}

function matchesTool(pattern: string, toolName: string): boolean {
  if (pattern === '*') return true;
  if (pattern === toolName) return true;
  // Simple glob: "bash*" matches "bash", "bash_safe"
  if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) return true;
  return false;
}

export async function runHooks(ctx: HookContext): Promise<HookResult> {
  const config = loadHooksConfig();
  const matching = config.hooks.filter(
    (h) =>
      h.event === ctx.event &&
      (h.enabled !== false) &&
      (!ctx.toolName || matchesTool(h.match, ctx.toolName)),
  );

  for (const hook of matching) {
    // Apply profile-based filtering before executing
    const hookId = `${ctx.event}:${hook.match}`;
    if (!shouldRunHook(hookId, ctx.event)) {
      continue;
    }

    const env = {
      ...process.env,
      CROWCODER_EVENT: ctx.event,
      CROWCODER_TOOL: ctx.toolName || '',
      CROWCODER_TOOL_INPUT: ctx.toolInput ? JSON.stringify(ctx.toolInput) : '',
      CROWCODER_TOOL_OUTPUT: ctx.toolOutput || '',
      CROWCODER_SESSION_ID: ctx.sessionId || '',
      CROWCODER_CWD: ctx.cwd,
    };

    const isBlocking = hook.blocking ?? (ctx.event === 'PreToolUse');
    const timeout = hook.timeout ?? 10_000;

    try {
      const result = execSync(hook.command, {
        cwd: ctx.cwd,
        env,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32' ? 'bash' : '/bin/bash',
      });

      const output = result.toString().trim();
      if (output) {
        console.log(chalk.dim(`  [hook:${ctx.event}] ${output}`));
      }
    } catch (err: unknown) {
      if (isBlocking) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.yellow(`  [hook:${ctx.event}] BLOCKED: ${msg}`));
        return { allowed: false, message: msg };
      }
      // Non-blocking hooks just log errors
      console.log(chalk.dim(`  [hook:${ctx.event}] error (non-blocking): ${err}`));
    }
  }

  return { allowed: true };
}

export function saveHooksConfig(config: HooksConfig): void {
  mkdirSync(HOOKS_DIR, { recursive: true });
  writeFileSync(HOOKS_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
}

export function listHooks(): HookDef[] {
  return loadHooksConfig().hooks;
}

export function addHook(hook: HookDef): void {
  const config = loadHooksConfig();
  config.hooks.push(hook);
  saveHooksConfig(config);
}

export function removeHook(index: number): boolean {
  const config = loadHooksConfig();
  if (index < 0 || index >= config.hooks.length) return false;
  config.hooks.splice(index, 1);
  saveHooksConfig(config);
  return true;
}
