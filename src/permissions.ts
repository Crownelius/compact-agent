/**
 * Permission system — controls tool execution based on permission mode.
 *
 * Three modes:
 * - `yolo`: All tools allowed without prompting
 * - `auto`: Read-only tools allowed; destructive tools require confirmation
 * - `ask`: All non-read-only tools require confirmation
 *
 * Users can type "always" when prompted to upgrade to `auto` mode
 * for the rest of the session (and persist to config).
 */
import * as readline from 'node:readline/promises';
import chalk from 'chalk';
import type { Tool } from './tools/types.js';
import type { VentipusConfig } from './types.js';
import { saveConfig } from './config.js';
import { evaluateCommand } from './execpolicy.js';

/**
 * Check if a tool call is allowed under the current permission mode.
 * Returns true if allowed, false if denied.
 *
 * @param tool - The tool being invoked
 * @param input - The tool's input arguments
 * @param config - Current Cawdex configuration (may be mutated if user types "always")
 * @param rl - Readline interface for prompting the user
 * @returns True if the tool call is allowed, false if denied
 */
export async function checkPermission(
  tool: Tool,
  input: Record<string, unknown>,
  config: VentipusConfig,
  rl: readline.Interface,
): Promise<boolean> {
  // ── Execpolicy intent-gate (runs BEFORE other checks) ──
  // For bash commands, evaluate the static-policy DSL first. This lets
  // us auto-approve obviously-safe ops (cat, ls, git log) AND block
  // obviously-dangerous ones (rm -rf system path, shutdown) without
  // burning a user prompt either way. Only fires for the `bash` tool.
  if (tool.name === 'bash') {
    const cmd = String(input.command || '');
    const policy = evaluateCommand(cmd);
    if (policy.decision === 'forbidden') {
      console.log(chalk.red(`\n  ✗ Blocked by execpolicy${policy.ruleId ? ` (${policy.ruleId})` : ''}: ${policy.reason || 'command not permitted'}`));
      console.log(chalk.dim(`    $ ${cmd.slice(0, 120)}`));
      return false;
    }
    if (policy.decision === 'allow') {
      // Skip the full permission flow — policy says this is safe
      return true;
    }
    // policy.decision === 'prompt' → fall through to the usual flow
    // (alwaysAllowedTools check, mode check, ask if needed)
  }

  // yolo mode = everything allowed (execpolicy 'forbidden' still wins,
  // applied above; allow + prompt both pass through yolo)
  if (config.permissionMode === 'yolo') return true;

  // Read-only tools always allowed
  if (tool.isReadOnly) return true;

  // Per-tool persistent allowlist. Populated by the "always" answer
  // below. Checked BEFORE the destructive branch so a previous "always"
  // on bash or write_file actually stops the next prompt. The earlier
  // implementation only flipped the global mode to 'auto', which still
  // prompts for tools marked isDestructive — that was the "I keep typing
  // always but it keeps asking" bug.
  if (config.alwaysAllowedTools?.includes(tool.name)) return true;

  // auto mode = allow non-destructive, ask for destructive
  if (config.permissionMode === 'auto' && !tool.isDestructive) return true;

  // ask mode or destructive in auto mode → prompt user
  const desc = formatToolCall(tool, input);
  console.log(chalk.yellow(`\n⚡ Tool: ${tool.name}`));
  console.log(chalk.dim(desc));

  const answer = await rl.question(chalk.yellow('Allow? [Y/n/always] '));
  const a = answer.trim().toLowerCase();

  if (a === 'always') {
    // Persist as a per-tool allow. Old behavior also flipped permissionMode
    // to 'auto', but that only helps non-destructive tools; per-tool list
    // is the actual fix for destructive tools like bash + write_file.
    config.alwaysAllowedTools = config.alwaysAllowedTools || [];
    if (!config.alwaysAllowedTools.includes(tool.name)) {
      config.alwaysAllowedTools.push(tool.name);
    }
    saveConfig(config);
    console.log(chalk.dim(`  (always-allowing ${tool.name} for this session and future sessions — clear with /perm-reset)`));
    return true;
  }

  return a === '' || a === 'y' || a === 'yes';
}

function formatToolCall(tool: Tool, input: Record<string, unknown>): string {
  switch (tool.name) {
    case 'bash':
      return `  $ ${input.command}`;
    case 'write_file':
      return `  Write to: ${input.file_path} (${((input.content as string) || '').split('\n').length} lines)`;
    case 'edit_file':
      return `  Edit: ${input.file_path}`;
    default:
      return `  ${JSON.stringify(input).slice(0, 200)}`;
  }
}
