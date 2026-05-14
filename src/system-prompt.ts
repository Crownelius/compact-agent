import { readdirSync, existsSync } from 'node:fs';
import { platform, release, homedir } from 'node:os';
import type { CrowcoderConfig } from './types.js';
import { getModePromptAddition, type Mode } from './modes.js';
import { buildRulesPrompt } from './rules.js';
import { getRelevantInstincts } from './learning.js';
import { findEccSkillForQuery } from './ecc.js';

export function buildSystemPrompt(
  config: CrowcoderConfig,
  cwd: string,
  mode: Mode = 'dev',
  userQuery?: string,
): string {
  const os = `${platform()} ${release()}`;
  const shell = process.platform === 'win32' ? 'bash (Git Bash / WSL)' : '/bin/bash';

  // Detect if cwd is a git repo
  let isGit = false;
  try {
    isGit = existsSync(`${cwd}/.git`);
  } catch {}

  // Try to list top-level files for context
  let fileList = '';
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    fileList = entries
      .slice(0, 30)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join(', ');
  } catch {}

  // Mode-specific prompt addition
  const modeAddition = getModePromptAddition(mode);

  // Language-specific rules
  const rulesAddition = buildRulesPrompt(cwd);

  // Relevant instincts from learning system
  let instinctAddition = '';
  if (userQuery) {
    const instincts = getRelevantInstincts(userQuery, 3);
    if (instincts.length > 0) {
      instinctAddition = '\n# Learned Patterns\n' +
        instincts.map((i) => `- [${(i.confidence * 100).toFixed(0)}%] ${i.pattern}`).join('\n');
    }
  }

  // Auto-inject the highest-scoring ECC skill for this query, if any
  let eccSkillAddition = '';
  if (userQuery) {
    try {
      const skill = findEccSkillForQuery(userQuery);
      if (skill) {
        // Truncate large skills so we don't blow the context budget
        const body = skill.prompt.length > 4000 ? skill.prompt.slice(0, 4000) + '\n...[truncated]' : skill.prompt;
        eccSkillAddition = `\n# ECC Skill: ${skill.name}\n${body}\n`;
      }
    } catch { /* skill matching is best-effort */ }
  }

  return `You are Crowcoder, a powerful AI coding assistant running in the user's terminal.
You help with software engineering tasks: writing code, fixing bugs, refactoring, explaining code, running commands, and more.

# Environment
- Working directory: ${cwd}
- OS: ${os}
- Shell: ${shell}
- Git repo: ${isGit ? 'yes' : 'no'}
- Model: ${config.model} via ${config.provider}
- Home: ${homedir()}
- Mode: ${mode}
${fileList ? `- Files in cwd: ${fileList}` : ''}

# Available Tools
You have tools for: running shell commands (bash), reading files (read_file), writing files (write_file), editing files (edit_file), searching file contents (grep), finding files by pattern (glob), listing directories (list_dir), and fetching web content (web_fetch).

# Guidelines
- Read files before editing them. Understand existing code before suggesting changes.
- Use the appropriate tool for the task. Don't use bash when read_file or edit_file is better.
- Be concise. Lead with the answer, not the reasoning.
- When editing, use edit_file with exact string matching. Provide enough context to be unique.
- For bash commands, prefer non-destructive operations. Ask before deleting things.
- Don't add unnecessary features, comments, or abstractions beyond what was asked.
- When writing code, prioritize correctness and security. Avoid OWASP top 10 vulnerabilities.
- If an approach fails, diagnose the root cause before trying something else.
- Use markdown formatting in your responses.
- For git operations: prefer new commits over amending, never force-push without asking.
- Respond in the same language the user writes in.
${modeAddition}${rulesAddition}${instinctAddition}${eccSkillAddition}
`;
}
