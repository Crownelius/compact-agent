# Compact Agent

Universal AI coding assistant for the terminal. Works with OpenRouter, GLM, Ollama, OpenAI, DeepSeek, LM Studio, or any OpenAI-compatible API.

Ships bundled with the full **[everything-claude-code](https://github.com/Crownelius/everything-claude-code)** harness library — skills, agents, slash commands, language rules, and security hooks — automatically installed on first launch.

```
npm install -g compact-agent
compact-agent
```

> **New here?** See [INSTALL.md](INSTALL.md) for setup (prerequisites, providers, troubleshooting) and [COMMANDS.md](COMMANDS.md) for a complete reference of every slash command. Inside the REPL, type `/walkthrough` for an agent-led tour.

---

## Features

Each feature is labeled with its data scope:

| Label | Meaning |
|-------|---------|
| **LOCAL** | All data stays on your machine in `~/.crowcoder/` |
| **API** | Sends data to your chosen AI provider only (required for the feature to work) |
| **NONE** | No data stored or sent |

### Core — API

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Streaming chat | **API** | Send messages to your configured AI provider, stream responses |
| Tool execution | **API** | AI calls tools (bash, read, write, edit, grep, glob, list_dir, web_fetch, web_search) |
| Context compaction | **API** | Summarizes old messages via your AI provider when context grows large |
| AI code review | **API** | `/review` — sends diff to your AI for quality/security analysis |
| AI TDD mode | **API** | `/tdd` — AI writes tests first, then implementation |
| AI security review | **API** | `/security-review` — AI audits project for vulnerabilities |
| AI commit/PR | **API** | `/commit`, `/pr` — AI generates commit messages and PR descriptions |
| Multi-agent orchestration | **API** | Spawn parallel sub-tasks using your AI provider |
| Verification loop | **API** | `/verify` — run tests, fix failures, repeat until green |
| Build fix | **API** | `/build-fix` — auto-detect and fix build errors for all major languages |
| E2E test generation | **API** | `/e2e` — generate end-to-end tests (Playwright, Cypress, Puppeteer) |
| Evaluation | **API** | `/eval` — evaluate project against custom criteria |
| Documentation sync | **API** | `/update-docs` — sync documentation with code |
| Coverage analysis | **API** | `/test-coverage` — analyze test coverage, suggest tests |
| Refactoring | **API** | `/refactor` — dead code detection & cleanup |
| Content engine | **API** | `/article`, `/slides`, `/repurpose`, `/market-research`, `/investor-deck` |
| Codemap generation | **NONE** | `/codemap`, `/update-codemaps` — project structure mapping |
| Skill creation | **API** | `/skill-create` — create reusable skills from git patterns |
| Search-first research | **API** | `/search-first` — research before coding |
| Docs lookup | **API** | `/docs-lookup` — search docs for answers |
| Walkthrough tour | **API** | `/walkthrough` (aliases: `/tour`, `/guide`) — agent-led onboarding |

### Session & History — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Session persistence | **LOCAL** | `~/.crowcoder/sessions/*.json` |
| Auto-save | **LOCAL** | Saves after every turn to `~/.crowcoder/sessions/` |
| Session resume | **LOCAL** | `/resume <id>` loads from local files |
| Checkpoints | **LOCAL** | `/checkpoint` — save/restore git state |

### Cost & Usage Tracking — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Token counting | **LOCAL** | `~/.crowcoder/usage.json` |
| Cost estimation | **LOCAL** | Estimated from local model cost table, never sent anywhere |
| Budget alerts | **LOCAL** | `/budget` sets local daily/monthly limits |
| Usage summary | **LOCAL** | `/usage` reads from local file only |

### Learning System — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Pattern extraction | **LOCAL** | `~/.crowcoder/instincts/*.json` |
| Instinct confidence | **LOCAL** | Scores stored and decayed locally |
| Import/export | **LOCAL** | `/learn`, `/instincts`, `/instinct-export`, `/instinct-import`, `/prune` |
| Skill evolution | **LOCAL** | `/evolve` — cluster instincts into reusable skills |
| Memory persistence | **LOCAL** | `~/.crowcoder/memory/` — cross-session project context |

### Security — NONE / LOCAL

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Dangerous command detection | **NONE** | Regex-based, runs in-process, no data stored |
| Secret scanning | **NONE** | Regex-based, runs in-process, blocks secrets from being written |
| Security threat levels | **NONE** | Critical commands (rm -rf, DROP TABLE, force push) auto-blocked |

### Hooks — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Hook configuration | **LOCAL** | `~/.crowcoder/hooks.json` |
| PreToolUse / PostToolUse | **LOCAL** | User-defined scripts, run locally |
| SessionStart / SessionStop | **LOCAL** | User-defined scripts, run locally |
| Hook profiles | **LOCAL** | `/hook-profile` — minimal/standard/strict profiles via `CROWCODER_HOOK_PROFILE` |

### Modes — NONE

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Mode switching | **NONE** | `/mode dev\|review\|tdd\|research\|plan\|debug\|architect\|hermes` — changes system prompt only, no data stored |

### Model Routing — LOCAL

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Cost-aware routing | **LOCAL** | `/route` classifies task complexity locally, switches model |
| Model switching | **LOCAL** | `/model`, `/models` — updates `~/.crowcoder/config.json` |

### Rules Engine — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Built-in rules | **NONE** | Hardcoded for TS, Python, Go, Rust, Java, Kotlin, C++, PHP |
| Custom rules | **LOCAL** | `~/.crowcoder/rules/<language>.md` |
| Auto-detection | **NONE** | Scans cwd file extensions in-process |

### Project Audit — NONE

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Harness audit | **NONE** | `/audit` checks local project files (git, tests, linter, secrets) — no data leaves your machine |
| Project detection | **NONE** | `/detect` — detect package manager, test runner, build tool |

### Configuration — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| API key storage | **LOCAL** | `~/.crowcoder/config.json` (plaintext — protect this file) |
| Provider config | **LOCAL** | `~/.crowcoder/config.json` |
| Permission mode | **LOCAL** | `~/.crowcoder/config.json` |
| Theme | **LOCAL** | `full`, `compact`, or `minimal` startup display |
| Dry-run mode | **LOCAL** | `/dry-run` — toggle tool execution preview |
| Thinking display | **LOCAL** | `/thinking` — toggle model reasoning visibility |

---

## Privacy

**Crowcoder has zero telemetry, zero analytics, and zero phone-home.**

- No data is sent to Crowcoder developers or any third party
- No tracking headers, no analytics SDKs, no crash reporting
- The only external network calls are to **your chosen AI provider** (OpenRouter, OpenAI, etc.) when you send a message
- The `web_fetch` tool only fetches URLs **you explicitly ask for**
- All local data lives in `~/.crowcoder/` — delete that folder to remove everything

### What goes where

```
~/.crowcoder/
  config.json          — API key, provider, model, permissions, theme
  usage.json           — token counts, cost estimates (local only)
  hooks.json           — hook definitions
  users.json           — user management table
  ecc-state.json       — ECC install state
  sessions/            — saved conversations (*.json)
  instincts/           — learned patterns (*.json)
  skills/              — reusable skill templates (*.json)
  memory/              — cross-session project memory (*.json)
  checkpoints/         — git state checkpoints (*.json)
  rules/               — custom coding rules (*.md)
  hooks/               — user hook scripts
  ecc-commands/        — ECC command prompt templates (*.md)
  ecc-agents/          — ECC agent prompt templates (*.md)
```

**Your API key** is stored in plaintext in `config.json`. Keep `~/.crowcoder/` private.

---

## Supported Providers

| Provider | Base URL | Default Model |
|----------|----------|---------------|
| OpenRouter | `openrouter.ai/api/v1` | anthropic/claude-sonnet-4 |
| Anthropic (Claude) | `api.anthropic.com/v1/` | claude-sonnet-4-20250514 |
| OpenAI (GPT) | `api.openai.com/v1` | gpt-4o |
| Google (Gemini) | `generativelanguage.googleapis.com/v1beta/openai/` | gemini-2.5-flash |
| DeepSeek | `api.deepseek.com/v1` | deepseek-chat |
| GLM (ZhipuAI) | `open.bigmodel.cn/api/paas/v4` | glm-4-plus |
| Ollama (Local) | `localhost:11434/v1` | qwen2.5-coder:latest |
| LM Studio | `localhost:1234/v1` | loaded-model |
| Custom | you provide | you provide |

---

## Slash Commands

```
General                 Model & Provider        Modes
/help                   /model [name]           /mode [name]
/config                 /models                 /modes
/theme [full|compact|minimal]  /provider          /hermes
/clear                  /route
/history                                        Code Quality
/export [md|json|txt]   Session                 /review [target]
/exit | /quit           /sessions               /tdd <desc>
/walkthrough | /tour    /save [name]            /security-review
  | /guide              /resume <id>            /audit
                        /delete <id>            /verify [cmd]
                                                /build-fix
Git                     /test-coverage
/commit                 /refactor [target]
/pr                     /e2e <feature>
/diff                   /eval <criteria>
/log

Planning & Docs         Language Reviews        Language Build Fixes
/plan <task>            /auto-review            /ts-build-fix
/update-docs            /ts-review              /go-build-fix
/checkpoint [label]     /py-review              /rust-build-fix
/checkpoints            /go-review              /java-build-fix
/search-first <task>    /rust-review            /cpp-build-fix
/docs-lookup <query>    /java-review            /pytorch-fix
                        /cpp-review
Tools & Config          /kotlin-review
/tools                  /php-review
/rules                  /db-review
/perm <mode>
/dry-run                Orchestration
/thinking               /orchestrate <task>
/cd <path>              /pr-loop
/hooks                  /multi-plan <task>
                        /multi-execute
Learning & Cost         /multi-backend
/usage                  /multi-frontend
/budget <d> <m>
/learn                  Codemaps
/instincts              /codemap
/instinct-export        /update-codemaps
/instinct-import
/evolve                 Content Engine
/skills                 /article <topic>
/memory                 /slides <topic>
/users                  /repurpose <text>
/count [inc|dec|reset]  /market-research
/detect                 /investor-deck
/hook-profile           /investor-outreach
/pm2 [action]           /code-quality
                        /skill-stocktake
ECC                     /chief-of-staff
/ecc
/ecc-install            Skills & Patterns
/ecc-skills             /skill-create
/ecc-agents             /git-patterns
/ecc-commands           /git-workflow
/ecc-feature-development
/ecc-add-language-rules
/ecc-database-migration
```

### Modes

`/mode <name>` (or shorthand commands where shown):

- `dev` — general coding
- `review` — code review
- `tdd` — strict RED → GREEN → REFACTOR
- `research` — read-only exploration
- `plan` — design before coding (no edits)
- `debug` — systematic root-cause hunt
- `architect` — system-level design
- `hermes` (`/hermes`) — **self-improving learning loop**: recall prior memory + instincts before acting, model the user across sessions, parallelize independent subtasks, distill skills from experience, nudge to persist knowledge. Inspired by [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent).

### Theme Modes

`/theme [full|compact|minimal]`:

- `full` — splash screen + banner (default)
- `compact` — banner only
- `minimal` — one-liner

### Permission Modes

`/perm <ask|auto|yolo>`:

- `ask` — prompt before writes/commands (safest)
- `auto` — auto-approve reads, ask for destructive
- `yolo` — approve everything (fastest)

Type `always` when prompted to permanently switch to `auto`.

### Shell Escape

Prefix any line with `!` to run a shell command directly without AI involvement:

```
!ls -la
!git status
```

---

## Install

```bash
npm install -g compact-agent
compact-agent
```

For the full setup walkthrough (prerequisites, providers, troubleshooting) see [INSTALL.md](INSTALL.md).

### From source (development)

```bash
git clone https://github.com/Crownelius/Crowcoder.git
cd Crowcoder
npm install
npm link
```

Rebuild after edits:

```bash
npx tsc
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CROWCODER_HOME` | Override config directory | `~/.crowcoder` |
| `CROWCODER_HOOK_PROFILE` | Hook strictness: `minimal`, `standard`, `strict` | `standard` |
| `CROWCODER_DISABLED_HOOKS` | Comma-separated hook IDs to disable | (none) |
| `CROWCODER_PACKAGE_MANAGER` | Override package manager detection | (auto-detect) |

---

## everything-claude-code (ECC) integration

Crowcoder ships with the full ECC library — imported from
[Crownelius/everything-claude-code](https://github.com/Crownelius/everything-claude-code) — and
installs it automatically on first launch. The library lives at `resources/ecc/`
inside the install and is materialized into your Crowcoder data dir as:

| Resource | Source                          | Destination                       | Used by                                |
|----------|---------------------------------|-----------------------------------|----------------------------------------|
| Skills   | `resources/ecc/skills/*/SKILL.md` | `~/.crowcoder/skills/ecc-*.json`  | `/skills`, system-prompt auto-injection |
| Agents   | `resources/ecc/agents/*.{json,md}` | `~/.crowcoder/ecc-agents/*.md` + `~/.crowcoder/skills/ecc-agent-*.json` | `/ecc-agents`, `/skills` |
| Commands | `resources/ecc/commands/*.md` + `prompts/*.md` | `~/.crowcoder/ecc-commands/*.md` | `/ecc-<command-name>`                  |
| Rules    | `resources/ecc/rules/<lang>-*.md` | `~/.crowcoder/rules/<lang>.md`    | System prompt language rules           |
| Hooks    | Native Crowcoder ports          | `~/.crowcoder/hooks.json`         | PreToolUse / PostToolUse pipeline       |

### ECC slash commands

ECC commands are auto-injected into their built-in equivalents (e.g. `/tdd`, `/review`, `/plan` automatically use ECC prompts when ECC is installed). The following ECC-only commands have no built-in equivalent:

```
/ecc                       — show install state + counts
/ecc-install               — install or refresh ECC resources (idempotent)
/ecc-skills                — list ECC skills
/ecc-agents                — list ECC agents
/ecc-commands              — list ECC-only commands
/ecc-feature-development   — feature implementation workflow
/ecc-add-language-rules    — add language-specific rule files
/ecc-database-migration    — database migration workflow
```

Any `/ecc-<command-name>` dynamic dispatch is also supported for commands in `~/.crowcoder/ecc-commands/`.

### Skill auto-injection

When you send a prompt that matches an ECC skill's triggers
(e.g. asking about *TDD*, *bun*, *e2e testing*, *MCP servers*, *frontend slides*),
the highest-scoring skill's body is auto-injected into the system prompt for
that turn. Skills also appear in `/skills` so you can invoke them by trigger
matching from any prompt.

### ECC hooks (security)

Five native hooks are installed (auto-disabled if you remove them from
`~/.crowcoder/hooks.json`):

| Event       | Match       | Behavior                                         |
|-------------|-------------|--------------------------------------------------|
| PreToolUse  | `bash`      | Block `git ... --no-verify` and `--no-gpg-sign`  |
| PreToolUse  | `bash`      | Remind to run dev servers under tmux (non-blocking) |
| PreToolUse  | `read_file` | Warn when reading `.env / .key / .pem / credentials*` |
| PostToolUse | `edit_file` | Warn when an edit leaves `console.*` statements  |
| PostToolUse | `write_file`| Same console-statement warning on new files      |

All hook entries are tagged `__ecc__` so `/ecc-install` can refresh them
without touching hooks you've defined yourself.

### Rebuilding bundled ECC resources

The bundled `resources/ecc/` is a frozen snapshot of the upstream repo. To
refresh from upstream:

```bash
git -C /e/ecc-mirror/everything-claude-code pull
# then re-copy: skills, agents, commands, rules, prompts
# (run /ecc-install afterwards to re-import)
```

---

## License

MIT
