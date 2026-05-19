import { readdirSync, existsSync } from 'node:fs';
import { platform, release, homedir } from 'node:os';
import type { CrowcoderConfig } from './types.js';
import { getModePromptAddition, type Mode } from './modes.js';
import { buildRulesPrompt } from './rules.js';
import { getRelevantInstincts } from './learning.js';
import { findEccSkillForQuery } from './ecc.js';
import { ALL_TOOLS } from './tools/index.js';
import { buildUserContext } from './users.js';

function buildToolList(): string {
  const lines = ALL_TOOLS.map((t) => {
    const oneLine = t.description.split('\n')[0];
    return `  - ${t.name}: ${oneLine}`;
  });
  return lines.join('\n');
}

// In coding-oriented modes (dev/architect/plan), append a brief nudge that
// the user can switch to design mode for UI work — but only when Stitch is
// available so we don't waste tokens advertising a dead end.
function buildDesignHint(mode: Mode): string {
  if (mode === 'design' || mode === 'hermes') return '';
  if (mode !== 'dev' && mode !== 'architect' && mode !== 'plan') return '';
  // Stitch availability is determined by tool registry — the stitch tool is
  // only registered when stitchConfigured() returns true.
  const stitchAvailable = ALL_TOOLS.some((t) => t.name === 'stitch');
  if (!stitchAvailable) return '';
  return `\n# UI work hint\nWhen the user asks for UI / visual / layout / design work in this mode, you can either (a) write HTML/CSS directly, or (b) suggest switching to design mode (\`/mode design\` or \`/design <task>\`) which uses Google Stitch to generate real UI screens that you then integrate into the codebase. Choose (b) for anything more involved than a single static page.`;
}

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

  // User context
  const userAddition = buildUserContext();

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

# Available Tools (these and ONLY these — do not invent tool names)
${buildToolList()}

IMPORTANT — tool-call rules:
- The exact, allowed tool names are the bullet keys above. Calling any other name (e.g. \`web_search_exa\`, \`google_search\`, \`shell_exec\`) is an error and the call will fail.
- For web discovery: use \`web_search\` (returns title/URL/snippet for a keyword query).
- For reading a known URL: use \`web_fetch\`.
- For shell-only operations: use \`bash\`. Do not use bash for tasks any other tool already covers.
- If a capability you want isn't in the list, work around it with the tools that exist. Don't pretend a tool exists.

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
${modeAddition}${buildDesignHint(mode)}${rulesAddition}${instinctAddition}${eccSkillAddition}${userAddition}
`;
}
