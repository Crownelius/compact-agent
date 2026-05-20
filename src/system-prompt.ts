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
  // The shell label here MUST match what the bash tool actually runs.
  // The bash tool picks cmd.exe on Windows by default (was a major source
  // of "$USERPROFILE is empty" bugs when we used bash). Keep this in sync
  // with src/tools/bash.ts:pickShell().
  const shell = process.env.COMPACT_AGENT_SHELL
    || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');

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

# Turn semantics — read carefully
Each user message is an INDEPENDENT request. Conversation history is a record
of past requests that are ALREADY DONE. Specifically:
- An assistant message tagged "[Completed in a prior turn. Tools used: …]"
  means those tools have already been run for a previous user message. Do NOT
  re-execute them. They appear in history only so you have continuity / context.
- The CURRENT request is the LATEST user message and only that one. Don't
  invent additional sub-requests from earlier turns. If the user says "research
  further please", do MORE research — don't ALSO re-write the poem from a
  previous turn.
- If the current user message is ambiguous, ask one clarifying question rather
  than guessing that they meant to repeat a previous task.

IMPORTANT — tool-call rules:
- The exact, allowed tool names are the bullet keys above. Calling any other name (e.g. \`web_search_exa\`, \`google_search\`, \`shell_exec\`) is an error and the call will fail.
- For web discovery: use \`web_search\` (returns title/URL/snippet for a keyword query).
- For reading a known URL: use \`web_fetch\`.
- For shell-only operations: use \`bash\`. Do not use bash for tasks any other tool already covers.
- If a capability you want isn't in the list, work around it with the tools that exist. Don't pretend a tool exists.

# File operations — picking the right tool
- **Creating or overwriting a file**: always use \`write_file\`. Never use \`bash\` + \`echo > file\` for this. write_file takes the full content directly, handles multi-line strings without escaping, and resolves \`~/...\` paths to the user's actual home directory. \`bash\` + redirection is fragile across platforms — on Windows it routes through ${shell}, where \`$USERPROFILE\` / \`$HOME\` / bash-style paths may not behave the way you expect.
- **Modifying a specific section** of an existing file: use \`edit_file\` with an exact \`old_string\` → \`new_string\` substitution.
- **Reading**: use \`read_file\`.
- **Finding files by name pattern**: use \`glob\`. **Finding files by content**: use \`grep\`. **Listing a directory**: use \`list_dir\`.
- Tildes work in path arguments to file tools: \`~/Downloads/poem.txt\` resolves to the user's home directory on every platform. Don't try to expand it yourself via bash.
- The active shell is **${shell}**. Generate commands in that shell's syntax when you do use \`bash\` — don't mix POSIX bash idioms (\`$VAR\`, \`/c/...\`) into a cmd.exe command or vice versa.

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
