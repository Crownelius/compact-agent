# Crowcoder CLI

Universal AI coding assistant for the terminal. Works with OpenRouter, GLM, Ollama, OpenAI, DeepSeek, LM Studio, or any OpenAI-compatible API.

Ships bundled with the full **[everything-claude-code](https://github.com/Crownelius/everything-claude-code)** harness library — skills, agents, slash commands, language rules, and security hooks — automatically installed on first launch.

```
crowcoder
```

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
| Tool execution | **API** | AI calls tools (bash, read, write, edit, grep, glob, list_dir, web_fetch) |
| Context compaction | **API** | Summarizes old messages via your AI provider when context grows large |
| AI code review | **API** | `/review` — sends diff to your AI for quality/security analysis |
| AI TDD mode | **API** | `/tdd` — AI writes tests first, then implementation |
| AI security review | **API** | `/security-review` — AI audits project for vulnerabilities |
| AI commit/PR | **API** | `/commit`, `/pr` — AI generates commit messages and PR descriptions |
| Multi-agent orchestration | **API** | Spawn parallel sub-tasks using your AI provider |

### Session & History — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| Session persistence | **LOCAL** | `~/.crowcoder/sessions/*.json` |
| Auto-save | **LOCAL** | Saves after every turn to `~/.crowcoder/sessions/` |
| Session resume | **LOCAL** | `/resume <id>` loads from local files |

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
| Import/export | **LOCAL** | `/learn`, `/instincts`, `/prune` — all local files |

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

### Modes — NONE

| Feature | Data Scope | Description |
|---------|------------|-------------|
| Mode switching | **NONE** | `/mode dev\|review\|tdd\|research\|plan\|debug\|architect` — changes system prompt only, no data stored |

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

### Configuration — LOCAL

| Feature | Data Scope | Storage Location |
|---------|------------|------------------|
| API key storage | **LOCAL** | `~/.crowcoder/config.json` (plaintext — protect this file) |
| Provider config | **LOCAL** | `~/.crowcoder/config.json` |
| Permission mode | **LOCAL** | `~/.crowcoder/config.json` |

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
  config.json          — API key, provider, model, permissions
  usage.json           — token counts, cost estimates (local only)
  hooks.json           — hook definitions
  sessions/            — saved conversations
  instincts/           — learned patterns
  rules/               — custom coding rules
  hooks/               — user hook scripts
```

**Your API key** is stored in plaintext in `config.json`. Keep `~/.crowcoder/` private.

---

## Supported Providers

| Provider | Base URL | Default Model |
|----------|----------|---------------|
| OpenRouter | `openrouter.ai/api/v1` | claude-sonnet-4 |
| GLM (ZhipuAI) | `open.bigmodel.cn/api/paas/v4` | glm-4-plus |
| Ollama | `localhost:11434/v1` | qwen2.5-coder |
| LM Studio | `localhost:1234/v1` | loaded-model |
| OpenAI | `api.openai.com/v1` | gpt-4o |
| DeepSeek | `api.deepseek.com/v1` | deepseek-chat |
| Custom | you provide | you provide |

---

## Slash Commands

```
General             Model & Provider        Modes
/help               /model [name]           /mode [name]
/config             /models                 /modes
/clear              /provider               /hermes  (switch to Hermes mode)
/history            /route
/exit

Session             Git                     Code Quality
/sessions           /commit                 /review [target]
/save [name]        /pr                     /tdd <desc>
/resume <id>        /diff                   /security-review
/delete <id>        /log                    /audit

Tools & Config      Learning & Cost
/tools              /usage
/rules              /budget <d> <m>
/perm <mode>        /learn
/cd <path>          /instincts
/hooks              /prune
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

---

## Install

```bash
cd "C:\Users\rsfit\OneDrive\Desktop\Crowcoder"
npm install
npx tsc
npm install -g .
```

Then open any terminal and type `crowcoder`.

## Rebuild after edits

```bash
cd "C:\Users\rsfit\OneDrive\Desktop\Crowcoder" && npx tsc && npm install -g .
```

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

```
/ecc                — show install state + counts
/ecc-install        — install or refresh ECC resources (idempotent)
/ecc-skills         — list ECC skills
/ecc-agents         — list ECC agents (kiro)
/ecc-commands       — list ECC commands
/ecc-tdd            — TDD workflow prompt
/ecc-code-review    — code review prompt
/ecc-security-review— security review prompt
/ecc-build-fix      — build-failure triage prompt
/ecc-plan           — planning prompt
/ecc-refactor       — refactor prompt
/ecc-feature-development      — feature workflow
/ecc-database-migration       — migration workflow
/ecc-add-language-rules       — add language-specific rules
```

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
