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
import type { CrowcoderConfig } from './types.js';
import { saveConfig } from './config.js';

/**
 * Check if a tool call is allowed under the current permission mode.
 * Returns true if allowed, false if denied.
 *
 * @param tool - The tool being invoked
 * @param input - The tool's input arguments
 * @param config - Current Crowcoder configuration (may be mutated if user types "always")
 * @param rl - Readline interface for prompting the user
 * @returns True if the tool call is allowed, false if denied
 */
export async function checkPermission(
  tool: Tool,
  input: Record<string, unknown>,
  config: CrowcoderConfig,
  rl: readline.Interface,
): Promise<boolean> {
  // yolo mode = everything allowed
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
