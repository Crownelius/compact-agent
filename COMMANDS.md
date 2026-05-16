# Compact Agent — Command Reference

Every command Compact Agent exposes, organized by purpose. Two surfaces:

1. **Shell command** — what you type at your OS terminal (`compact-agent`)
2. **Slash commands** — what you type inside the REPL once it's running
3. **Tools** — what the underlying LLM calls automatically; not invoked by you

If you're new, run `compact-agent` then type `/walkthrough` for an agent-led tour.

---

## 1. Shell invocation

After `npm install -g compact-agent`, you have one binary:

```bash
compact-agent
```

That's the whole shell surface. It launches the REPL. There are no subcommands at the OS level — everything else happens via slash commands inside the REPL.

First run also fires the setup wizard (provider, API key, model, permission mode). See [INSTALL.md](INSTALL.md) for setup details.

---

## 2. Slash commands

Everything in this section is typed inside the REPL after `❯ `.

### 2.1 General & session control

| Command | What it does |
|---|---|
| `/help` | Show the full command list grouped by category. |
| `/walkthrough` (aliases: `/tour`, `/guide`) | Launches an agent-led tour of every feature. Recommended first thing. |
| `/clear` | Empty the current message history (REPL stays open). |
| `/history` | Show message count + estimated tokens + whether compaction is recommended. |
| `/export [md\|json\|txt]` | Save the current conversation to a file in CWD. Default: `md`. |
| `/exit` / `/quit` | Quit the REPL. |
| `/config` | Re-run the setup wizard (change provider/key/model/permissions). |
| `/theme [full\|compact\|minimal]` | Toggle startup display verbosity. `full` shows splash + banner; `minimal` is a single line. |
| `!<cmd>` | Run a shell command directly without involving the AI. Example: `!ls -la`. |

### 2.2 Modes

Modes change the system prompt to bias the agent toward a particular workflow.

| Command | Mode | What changes |
|---|---|---|
| `/mode dev` | Development (default) | General coding — write features, fix bugs, refactor. |
| `/mode review` | Code Review | Severity-rated findings, no edits unless asked. |
| `/mode tdd` | Test-Driven Development | Strict RED → GREEN → REFACTOR. No impl before a failing test. |
| `/mode research` | Research | Read-only exploration. Won't modify files. |
| `/mode plan` | Planning | Designs implementation plans, no edits. |
| `/mode debug` | Debug | Systematic root-cause hunt with hypothesis tracking. |
| `/mode architect` | Architect | System-level design, component boundaries, trade-offs. |
| `/mode hermes` | Hermes | Self-improving learning loop — recalls prior memory, models the user, parallelizes, distills skills, persists knowledge. Inspired by nousresearch/hermes-agent. |
| `/modes` | (list-only) | Print all available modes. **Does NOT switch** — use `/mode <name>`. |
| `/hermes` | Alias | Same as `/mode hermes`. |

### 2.3 Model & provider

| Command | What it does |
|---|---|
| `/model [name]` | Show current model, or switch to `<name>` (e.g. `/model anthropic/claude-sonnet-4`). |
| `/models` | List models the provider can serve. |
| `/provider` | Show provider name, base URL, masked key, current model. |
| `/route` | Auto-route the **next** message to a cheaper/more-capable model based on its complexity. Single-use. |

### 2.4 Sessions

Sessions are JSON snapshots stored in `~/.crowcoder/sessions/`.

| Command | What it does |
|---|---|
| `/sessions` | List saved sessions with ID, name, model, message count. |
| `/save [name]` | Save the current session. Auto-named if `name` omitted. |
| `/resume <id>` | Replay a saved session into the current REPL. |
| `/delete <id>` | Remove a saved session. |

### 2.5 Git

| Command | What it does |
|---|---|
| `/commit` | AI writes a commit message from the current diff. |
| `/pr` | AI writes a PR title + body for the current branch vs `main`. |
| `/diff` | Show `git diff` (working tree). |
| `/log [N]` | Show recent `git log` (default 15 entries). |

### 2.6 Code quality (LLM-driven)

These trigger an LLM workflow with an injected prompt. `/tdd`, `/review`, `/security-review`, `/plan`, `/refactor`, `/build-fix` automatically use the higher-quality bundled ECC prompts when ECC is installed (default).

| Command | What it does |
|---|---|
| `/review [target]` | AI code review with severity-rated findings. Target can be a path, commit, or `HEAD~N`. |
| `/tdd <feature>` | TDD workflow — agent writes tests first, then implementation. |
| `/security-review` | Security audit: SQLi, XSS, secrets, auth bypasses, etc. |
| `/audit` | Local-only project health check (git, tests, linter, secrets). No data leaves your machine. |
| `/verify [cmd]` | Run tests, fix failures, repeat until green. |
| `/build-fix` | Auto-detect language/build tool and fix build errors. |
| `/test-coverage` | Analyze coverage and suggest missing tests. |
| `/refactor [target]` | Dead code detection + cleanup. With no args, full project scan. |
| `/refactor-clean` | Alias of `/refactor` — same dispatch. |
| `/e2e <feature>` | Generate E2E tests (Playwright/Cypress/Puppeteer, auto-detected). |
| `/eval <criteria> [target]` | Evaluate the project against custom criteria. |
| `/plan <task>` | Structured implementation planning, no edits. |
| `/update-docs` | Sync documentation files with current code. |

### 2.7 Language-specific reviews

For when you want a reviewer with deep language-idiom knowledge.

| Command | Language |
|---|---|
| `/auto-review` | Auto-detect the dominant language and review. |
| `/ts-review` | TypeScript / JavaScript |
| `/py-review` | Python |
| `/go-review` | Go |
| `/rust-review` | Rust |
| `/java-review` | Java |
| `/cpp-review` | C++ |
| `/kotlin-review` | Kotlin |
| `/php-review` | PHP |
| `/db-review` | Databases / SQL |

### 2.8 Language-specific build fixes

| Command | Target |
|---|---|
| `/ts-build-fix` | TypeScript / JavaScript build errors |
| `/go-build-fix` | Go build/test errors |
| `/rust-build-fix` | Rust compile errors |
| `/java-build-fix` | Java compile/maven/gradle errors |
| `/cpp-build-fix` | C++ compile/linker errors |
| `/pytorch-fix` | PyTorch / CUDA setup issues |

### 2.9 Multi-agent orchestration

| Command | What it does |
|---|---|
| `/orchestrate <task>` | Decomposes a task and runs sub-agents in parallel. |
| `/pr-loop` | Autonomous loop: read PRs, write feedback, repeat. |
| `/multi-plan <task>` | Several agents propose independent plans, then converge. |
| `/multi-execute <plan>` | Several agents execute the same plan, vote on output. |
| `/multi-backend <s1,s2,...>` | Generate multiple services in parallel. |
| `/multi-frontend <c1,c2,...>` | Generate multiple components in parallel. |

### 2.10 Search & docs

| Command | What it does |
|---|---|
| `/search-first <task>` | Forces research-before-code mode: web/grep/glob first, then edit. |
| `/docs-lookup <query>` | Search docs (project + web) for a concept or API. |

### 2.11 Tools & config (REPL state)

| Command | What it does |
|---|---|
| `/tools` | List the tools the LLM has access to with flags `[R]` read-only, `[RW]` read-write, `[!]` destructive. |
| `/rules` | Show language-specific coding rules currently in the system prompt. |
| `/perm <ask\|auto\|yolo>` | Permission mode: `ask` prompts every time, `auto` allows non-destructive, `yolo` allows everything. |
| `/dry-run` | Toggle. When ON, tools print what they WOULD do without executing. |
| `/thinking` | Toggle. When ON, model "thinking" / reasoning tokens are displayed. |
| `/cd <path>` | Change CWD without leaving the REPL. |
| `/hooks` | List configured hooks (PreToolUse / PostToolUse / SessionStart / SessionStop). |
| `/hook-profile` | Show + change hook profile (`minimal`, `standard`, `strict`) — controls how many hooks fire. |
| `/pm2 [action]` | PM2 service management if pm2 is on PATH. With no args: list services. |

### 2.12 Planning & checkpoints

| Command | What it does |
|---|---|
| `/plan <task>` | See [Code Quality](#26-code-quality-llm-driven). |
| `/checkpoint [label]` | Snapshot current git working state with a label. |
| `/checkpoints` | List checkpoints. Restore via the listed command. |

### 2.13 Codemaps

| Command | What it does |
|---|---|
| `/codemap` (also `/codemaps`) | Show a saved project structure map summarizing every file. |
| `/update-codemaps` | Regenerate the codemap from the current source tree. |

### 2.14 Content engine

| Command | What it does |
|---|---|
| `/article <topic>` | Generate a long-form article or blog post. |
| `/slides <topic> [count]` | Generate a slide outline. Default `count`: 10. |
| `/repurpose <content>` | Repurpose existing content for twitter / linkedin / blog. |
| `/market-research <market>` | Generate a market-research report. |
| `/investor-deck <company>` | Investor pitch deck outline. |
| `/investor-outreach <co> --investor <name>` | Personalized investor outreach email. |
| `/code-quality` | Comprehensive code-quality audit (broader than `/review`). |
| `/skill-stocktake` | Inventory the assistant's skills + capabilities. |
| `/chief-of-staff <context>` | Executive briefing — top priorities, what to do next. |

### 2.15 Skills & patterns

Skills are reusable prompt templates. The 33 ECC skills are bundled; you can create your own.

| Command | What it does |
|---|---|
| `/skills` | List all skills (built-in + ECC + learned). |
| `/skill-create [args]` | Distill a new skill from recent git commit patterns. |
| `/git-patterns` | Analyze the project's git history for repeating change patterns. |
| `/git-workflow` | Summarize the project's git workflow conventions. |

### 2.16 Learning & cost

The learning system extracts patterns from your sessions and decays unused ones.

| Command | What it does |
|---|---|
| `/usage` | Token + cost summary across sessions. |
| `/budget <daily> <monthly>` | Local budget alerts (no data sent anywhere). |
| `/learn` | Extract patterns from the current session into instincts. |
| `/instincts` | Show learned instincts with confidence scores. |
| `/instinct-export <file>` | Export instincts to JSON for backup/sharing. |
| `/instinct-import <file>` | Import instincts from JSON. |
| `/evolve` | Cluster high-confidence instincts into reusable skills. |
| `/prune` | Delete instincts whose confidence has decayed below threshold. |
| `/memory` | Show cross-session memory status (`~/.crowcoder/memory/`). |

### 2.17 Detection

| Command | What it does |
|---|---|
| `/detect` | Print detected package manager (npm/pnpm/yarn/bun), test runner (jest/vitest/pytest/etc.), build tool. |

### 2.18 Users (feature-branch, optional)

If the `users.ts` module is wired in your build, you also get:

| Command | What it does |
|---|---|
| `/users` (or `/users ls`) | List user records. |
| `/users add <email> [name]` | Add a new user record. |
| `/users use <email>` | Set the active user for this REPL. |

### 2.19 Counter demo

A tiny stateful demo command useful for testing/learning:

| Command | What it does |
|---|---|
| `/count` | Show current counter value. |
| `/count inc` (or `/count +`) | Increment. |
| `/count dec` (or `/count -`) | Decrement. |
| `/count reset` | Reset to 0. |

### 2.20 ECC (everything-claude-code)

ECC is the bundled skill / agent / hook library. Auto-installed on first launch.

| Command | What it does |
|---|---|
| `/ecc` | Show ECC install state (counts of skills, agents, commands, rules). |
| `/ecc-install` | Re-install / refresh bundled ECC resources. |
| `/ecc-skills` | Filtered view of `/skills` — only ECC entries (`category=ecc`). |
| `/ecc-agents` | List ECC agent prompts available via `/skills`. |
| `/ecc-commands` | List the ECC-only workflow commands (below). |
| `/ecc-feature-development [desc]` | ECC's feature-implementation workflow. |
| `/ecc-add-language-rules <lang>` | Add a fresh ECC language rule bundle. |
| `/ecc-database-migration [desc]` | ECC's database migration workflow. |

**Important — no duplicates.** `/tdd`, `/review`, `/security-review`, `/plan`, `/refactor`, `/build-fix` already use the ECC prompt when ECC is installed. You do NOT need to learn or type `/ecc-tdd` etc. — the non-prefixed version is canonical.

---

## 3. Tools the LLM uses (not invoked by you)

These are called automatically by the agent during tool-use cycles. Listed for reference because you may see them in the output stream.

| Tool | Description | Read-only? |
|---|---|---|
| `bash` | Run a shell command. | No |
| `read_file` | Read a file (paged, with size limits). | Yes |
| `write_file` | Create or overwrite a file. Auto-creates parent dirs. | No |
| `edit_file` | Find-and-replace within a file (with optional `replace_all`). | No |
| `grep` | Search file contents (ripgrep, falls back to grep). | Yes |
| `glob` | Find files by glob pattern. | Yes |
| `list_dir` | List directory entries (type, size, name). | Yes |
| `web_fetch` | Fetch a URL and return text (HTML→text). | Yes |
| `web_search` | Search the web by keyword (DuckDuckGo, no API key). | Yes |

Any tool name you see in error output other than these (e.g. `web_search_exa`, `TodoWrite`, `exec_file`) is a model hallucination — the agent will be told the valid list and self-correct on the next iteration.

---

## 4. Environment variables

These affect the REPL's runtime behavior. Set in your shell before launching `compact-agent`.

| Variable | Default | Purpose |
|---|---|---|
| `CROWCODER_HOME` | `~/.crowcoder` | Override config/state directory (useful for tests and sandboxes). |
| `CROWCODER_HOOK_PROFILE` | `standard` | Hook profile: `minimal`, `standard`, `strict`. See `/hook-profile`. |
| `CROWCODER_GATEWAY` | (unset) | Hint URL for the LLM gateway, when bundled with the open-antigravity wrapper. |
| `OPENROUTER_API_KEY` | (unset) | Picked up by the LLM driver test (`tests/llm-drive-all.mjs`) if your real `config.json` isn't available. |

---

## 5. Files & state

Compact Agent is local-first. Everything lives in `~/.crowcoder/` (or `$CROWCODER_HOME` if set):

```
~/.crowcoder/
  config.json          # provider, model, key, theme, perms
  usage.json           # token counts, cost estimates (LOCAL ONLY)
  hooks.json           # hook definitions
  ecc-state.json       # ECC install metadata
  sessions/            # *.json — saved conversations
  instincts/           # *.json — learned patterns
  skills/              # *.json — reusable skill templates (ECC + your own)
  memory/              # cross-session project context
  rules/               # *.md — language-specific coding rules
  checkpoints/         # git state snapshots
  hooks/               # your hook scripts (if any)
  ecc-commands/        # bundled command prompts (/ecc-*)
  ecc-agents/          # bundled agent prompts
```

**To wipe all state:** `rm -rf ~/.crowcoder`.

---

## 6. Hooks

Default ECC-bundled hooks (configured in `~/.crowcoder/hooks.json`):

| Event | Match | What fires |
|---|---|---|
| PreToolUse | `bash` | Block `git --no-verify` / `--no-gpg-sign`. Reminder to run dev servers under tmux. |
| PreToolUse | `read_file` | Warn when reading `.env` / `.key` / `.pem` / credential paths. |
| PostToolUse | `edit_file` / `write_file` | Warn when an edit leaves `console.*` statements in `.ts`/`.js`. |

Disable individual hooks by editing the `enabled` field in `~/.crowcoder/hooks.json`, or set `CROWCODER_HOOK_PROFILE=minimal` to silence all but the most critical.

Write your own hooks: add an entry to `hooks.json` with `event`, `match` (tool name glob), `command` (shell), and optional `blocking`/`timeout`. The hook receives `CROWCODER_TOOL`, `CROWCODER_TOOL_INPUT`, `CROWCODER_CWD` in its env.

---

## Quick recipes

**Refactor a service end-to-end with tests:**

```
❯ /mode tdd
❯ /tdd add idempotency to the billing service /create endpoint
```

**Audit a project you just cloned:**

```
❯ /detect            # know what build tools to expect
❯ /audit             # local-only health check
❯ /auto-review       # AI review of the most recent changes
```

**Bulk codebase exploration without edits:**

```
❯ /mode research
❯ /codemap
❯ /search-first walk through how authentication is wired
```

**Multi-agent feature delivery:**

```
❯ /multi-plan add a search bar with debounced queries and result caching
❯ /multi-execute (use the chosen plan from above)
```

**Hermes mode for ongoing work:**

```
❯ /mode hermes
❯ help me continue what I was doing yesterday on the billing rewrite
```

Hermes will search prior sessions + instincts before asking clarifying questions.

---

## See also

- [README.md](README.md) — feature overview + privacy/data scope table
- [INSTALL.md](INSTALL.md) — installation, providers, troubleshooting
- Upstream [everything-claude-code](https://github.com/Crownelius/everything-claude-code) — the bundled skill library
- Upstream [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) — inspiration for Hermes mode
