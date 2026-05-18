
# Compact Agent

**A dense, feature-rich AI coding agent for the terminal.**

[![npm](https://img.shields.io/npm/v/compact-agent?color=cyan)](https://www.npmjs.com/package/compact-agent)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hermes](https://img.shields.io/badge/Mode-Hermes-purple)](https://github.com/nousresearch/hermes-agent)
[![ECC](https://img.shields.io/badge/Bundled-everything--claude--code-orange)](https://github.com/Crownelius/everything-claude-code)

Compact Agent is a single-command terminal AI coding CLI. It speaks any OpenAI-compatible API (OpenRouter, OpenAI, Anthropic via compatible endpoints, Ollama, LM Studio, DeepSeek, GLM). It ships with **80+ slash commands**, **8 operation modes** including the self-improving **Hermes** mode, the bundled **everything-claude-code** skill library, multi-agent orchestration, a cross-session learning system, and zero telemetry.

[Features](#-features) • [Modes](#-operation-modes) • [Skills](#-skills-system) • [Tools](#-tool-arsenal) • [Providers](#-supported-providers) • [Installation](#-installation) • [Commands](#-slash-commands) • [Privacy](#-privacy) • [Architecture](#-architecture)

---

## ✨ Features

- **Single-command install** — `npm install -g compact-agent && compact-agent`. No clone, no build step, no Docker, no IDE extension.
- **Universal LLM transport** — works with any OpenAI-compatible API. Switch providers and models from inside the REPL with `/model`, `/provider`, `/route`.
- **8 operation modes** — `dev`, `review`, `tdd`, `research`, `plan`, `debug`, `architect`, and `hermes` (self-improving learning loop). Each rewrites the system prompt to bias the agent toward its specific workflow.
- **Hermes self-improving mode** — recalls prior sessions, models the user across conversations, parallelizes independent subtasks, distills new skills from experience, and proposes what's worth banking before finishing. Inspired by [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent).
- **Bundled everything-claude-code library** — 33 high-quality skills, 16 agents, 9 workflow commands, 7 language rule bundles, and 5 default security hooks. Auto-installed on first launch via [Crownelius/everything-claude-code](https://github.com/Crownelius/everything-claude-code).
- **Unified slash-command surface** — `/tdd`, `/review`, `/security-review`, `/plan`, `/refactor`, `/build-fix` automatically use the ECC prompts when ECC is installed. **No `/ecc-tdd` vs `/tdd` duplication.**
- **Multi-agent orchestration** — `/orchestrate`, `/multi-plan`, `/multi-execute`, `/multi-backend`, `/multi-frontend`, `/pr-loop` spawn parallel sub-tasks against the same project.
- **10 language-specific reviewers** — `/auto-review` (auto-detects the language) plus dedicated reviewers for TS, Python, Go, Rust, Java, C++, Kotlin, PHP, and SQL.
- **6 language-specific build fixers** — `/ts-build-fix`, `/go-build-fix`, `/rust-build-fix`, `/java-build-fix`, `/cpp-build-fix`, `/pytorch-fix`.
- **Learning system** — `/learn` extracts patterns from the current session into confidence-scored instincts. `/evolve` promotes high-confidence instincts into reusable skills. Confidence decays automatically; `/prune` removes stale patterns.
- **Cross-session memory** — `~/.crowcoder/memory/` retains project context across sessions. Hermes mode searches it before answering.
- **Sessions & checkpoints** — `/sessions`, `/save`, `/resume`, `/delete` for full session snapshots; `/checkpoint` for git-state snapshots inside a session.
- **Agent-led walkthrough** — type `/walkthrough` (or `/tour`, `/guide`) and the agent walks new users through every feature interactively.
- **Native security hooks** — by default, block `git --no-verify`, warn on reading `.env`/`.key`/`.pem`, warn when an edit leaves `console.*` statements, suggest tmux for long-running dev servers. Fully configurable in `~/.crowcoder/hooks.json`.
- **Permission modes** — `/perm ask` prompts before every tool use, `/perm auto` allows non-destructive ops, `/perm yolo` approves everything. Per-tool dry-run via `/dry-run`.
- **Cost & budget tracking** — `/usage`, `/budget` keep token counts and cost estimates entirely local in `~/.crowcoder/usage.json`. Cost-aware routing via `/route`.
- **Real web search** — `web_search` tool backed by DuckDuckGo Lite (no API key). The LLM gets unknown-tool errors with the valid tool list so free models that hallucinate `web_search_exa` can self-correct.
- **Google Stitch integration** — `/stitch <query>` interface to [Stitch](https://stitch.withgoogle.com/), Google's AI UI/UX design tool. List projects, generate UI from text, enhance design prompts. Ports the [gemini-cli-extensions/stitch](https://github.com/gemini-cli-extensions/stitch) extension; API-key auth.
- **Zero telemetry** — no analytics SDKs, no phone-home, no crash reporting. The only network calls are to your chosen LLM provider when you send a message.

---

## 🧠 Operation Modes

Switchable any time with `/mode <name>`. Each mode injects a specialized system-prompt addition.

### ⚡ dev — *default*

General coding. Write features, fix bugs, refactor. Reads files before editing, prefers minimal changes.

### 🔍 review

Code review with severity-rated findings (CRITICAL/HIGH/MEDIUM/LOW). Confidence-filtered: only reports issues the model is >80% sure about.

### 🧪 tdd

Strict RED → GREEN → REFACTOR cycle. Will **not** write implementation before a failing test. Lower temperature for tighter cycles.

### 🔭 research

Read-only exploration. The agent reads code, traces execution paths, maps architecture, and reports — without modifying files.

### 📋 plan

Design before building. Produces numbered step-by-step plans with file paths, trade-offs, and risk assessment. Does **not** write code in this mode.

### 🐛 debug

Systematic root-cause hunting. Reproduce → hypothesize → narrow → fix → verify. Never guesses — always confirms with evidence.

### 🏛 architect

System-level design. Component boundaries, data flow, technology choices, scalability, API design, database schemas, deployment.

### 🜲 hermes

**The agent that grows with you.** Recalls prior sessions and instincts before answering, builds a model of the user across conversations, parallelizes independent subtasks, distills skills from experience, nudges to persist knowledge at end of work, and proactively suggests scheduled follow-ups.

Activate with `/hermes` or `/mode hermes`.

---

## 🛠 Skills System

Skills are reusable prompt templates stored in `~/.crowcoder/skills/`. Three sources:

| Source | Stored as | Origin |
| :--- | :--- | :--- |
| **ECC bundled** | `ecc-<name>.json` | The 33 skills from [everything-claude-code](https://github.com/Crownelius/everything-claude-code), auto-installed on first launch |
| **ECC agents** | `ecc-agent-<name>.json` | 16 specialized agent prompts (code-reviewer, planner, doc-updater, etc.) |
| **Your own** | `<id>.json` | Created via `/skill-create` (distilled from git patterns) or `/evolve` (promoted from high-confidence instincts) |

When you send a message, Compact Agent auto-matches the highest-scoring skill against your query and injects its body into the system prompt for that turn. Browse with `/skills`, filter to ECC with `/ecc-skills`.

---

## 🔧 Tool Arsenal

The LLM has access to these tools. Each call is gated by your permission mode (`ask`/`auto`/`yolo`).

| Tool | Description | R/W |
| :--- | :--- | :---: |
| `bash` | Run a shell command. Spawns via Git Bash on Windows, `/bin/bash` elsewhere. | RW |
| `read_file` | Read a file with paging + size limits. | R |
| `write_file` | Create or overwrite a file. Auto-creates parent dirs. | W |
| `edit_file` | Find-and-replace within a file with optional `replace_all`. | W |
| `grep` | Search file contents. Uses ripgrep when available, falls back to grep. | R |
| `glob` | Find files by glob pattern (e.g. `src/**/*.ts`). | R |
| `list_dir` | List directory entries (type, size, name). | R |
| `web_fetch` | Fetch a URL and convert HTML → readable text. | R |
| `web_search` | Keyword search via DuckDuckGo Lite. Returns title/URL/snippet. No API key required. | R |
| `stitch` | Google Stitch MCP server — 12 tools across Project Management, Screen Management, AI Generation (gemini-3-flash / -pro, slow), and Design Systems. Auto-registered when `/stitch-config` has saved an API key. | RW |

Unknown-tool calls are intercepted: when a free model hallucinates `web_search_exa`, `TodoWrite`, or similar, the error response lists the valid tool names so the model self-corrects on the next iteration.

---

## 🌐 Supported Providers

| Provider | Base URL | Notes |
| :--- | :--- | :--- |
| **OpenRouter** | `https://openrouter.ai/api/v1` | One key, hundreds of models, free tier available. Recommended for new users. |
| **OpenAI** | `https://api.openai.com/v1` | GPT-4o / o-series. |
| **Anthropic** (via OpenRouter) | `https://openrouter.ai/api/v1` | Use `anthropic/claude-sonnet-4` etc. (native Anthropic API is not OpenAI-compatible). |
| **DeepSeek** | `https://api.deepseek.com/v1` | Cheap, strong on code. |
| **GLM (ZhipuAI)** | `https://open.bigmodel.cn/api/paas/v4` | GLM family. |
| **Ollama** | `http://localhost:11434/v1` | Local models — no API key needed. |
| **LM Studio** | `http://localhost:1234/v1` | Local models — no API key needed. |
| **Custom** | you provide | Anything that speaks OpenAI Chat Completions. |

---

## 📦 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) **18 or newer** (tested on 18, 20, 22, 24)
- An API key from any supported provider (or use a local Ollama / LM Studio)
- A POSIX-like shell. Compact Agent spawns Git Bash for shell tools on Windows.

### Single-command install

```bash
npm install -g compact-agent
compact-agent
```

First run launches the setup wizard (provider, key, model, permission mode). After that, `compact-agent` from any directory drops you into the REPL.

### From source (development)

```bash
git clone https://github.com/Crownelius/Crowcoder.git
cd Crowcoder
npm install
npm link
```

Rebuild after edits: `npx tsc` (or `npm run build`). The `prepare` script also runs `tsc` automatically on `npm install`, so a clean clone produces a working `dist/` without an extra step.

### Updating

```bash
npm install -g compact-agent@latest
```

### Uninstalling

```bash
npm uninstall -g compact-agent
rm -rf ~/.crowcoder        # remove all local state (config, sessions, skills, ...)
```

See [INSTALL.md](INSTALL.md) for the full setup walkthrough including provider-specific tips and troubleshooting.

---

## ⌨ Slash commands

The most-used commands at a glance. See **[COMMANDS.md](COMMANDS.md)** for the complete reference (~80 commands).

| Command | Description |
| :--- | :--- |
| `/walkthrough` | Agent-led tour of every feature *(aliases: `/tour`, `/guide`)* |
| `/help` | Print the full command list |
| `/mode <name>` | Switch operation mode (dev/review/tdd/research/plan/debug/architect/hermes) |
| `/model [name]` | Switch model, or show the current one |
| `/perm <mode>` | Change permission mode (ask/auto/yolo) |
| `/tdd <feature>` | Test-driven workflow — tests first, then implementation |
| `/review [target]` | AI code review with severity ratings |
| `/orchestrate <task>` | Decompose a task and run sub-agents in parallel |
| `/skills` | List all skills (built-in, ECC bundled, learned) |
| `/learn` | Extract patterns from the current session into instincts |
| `/usage` | Show token + cost summary |
| `/audit` | Local-only project health check (no data leaves your machine) |
| `/export [md\|json\|txt]` | Save the current conversation to a file |
| `!<cmd>` | Run a shell command directly without involving the AI |
| `/exit` | Quit the REPL |

---

## 🔒 Privacy

**Zero telemetry, zero analytics, zero phone-home.**

| Data | Where it goes |
| :--- | :--- |
| Conversation messages | Your chosen LLM provider only (required for the model to respond) |
| Token counts, costs | `~/.crowcoder/usage.json` — local file only, never transmitted |
| Sessions | `~/.crowcoder/sessions/*.json` — local files |
| Learned instincts & skills | `~/.crowcoder/instincts/`, `~/.crowcoder/skills/` — local files |
| Memory | `~/.crowcoder/memory/` — local files |
| API keys | `~/.crowcoder/config.json` — plaintext, local only. **Protect this file.** |
| Hook execution | All hooks run locally in your shell. No external calls. |

The `web_fetch` and `web_search` tools only contact URLs the agent decides to fetch in response to your request. There is no background telemetry, no crash reporting, no auto-update beacon.

**To remove everything:** `rm -rf ~/.crowcoder`.

---

## 🪝 Default Hooks

Five hooks ship by default via the bundled everything-claude-code library. Configured in `~/.crowcoder/hooks.json` — disable any you don't want.

| Event | Match | Behavior |
| :--- | :--- | :--- |
| `PreToolUse` | `bash` | **Block** `git ... --no-verify` and `--no-gpg-sign` — they skip pre-commit hooks |
| `PreToolUse` | `bash` | Warn (non-blocking) when running a dev server outside tmux on POSIX |
| `PreToolUse` | `read_file` | Warn when reading `.env`, `.key`, `.pem`, or paths containing `credentials`/`secrets`/`id_rsa` |
| `PostToolUse` | `edit_file` | Warn when an edit leaves `console.log`/`console.warn`/`console.error` statements in `.ts`/`.js` files |
| `PostToolUse` | `write_file` | Same console-statement warning on new files |

Set `CROWCODER_HOOK_PROFILE=minimal` to silence all but the blocking ones. Set `=strict` to enable additional reminders (tmux prompts, git-push warnings). Write your own hooks by adding entries to `hooks.json` with `event`, `match`, `command`, `blocking`, `timeout`, `enabled`.

---

## 🏛 Architecture

```
src/
├── index.ts                 # REPL main loop + ~80 slash-command dispatcher
├── api.ts                   # OpenAI-compatible client (streaming, retries, 429-aware)
├── query.ts                 # Tool-call loop: stream chat → exec tools → feed back results
├── system-prompt.ts         # System prompt assembly (env + mode + rules + ECC skill)
├── config.ts                # ~/.crowcoder/config.json (CROWCODER_HOME-aware)
├── modes.ts                 # 8 operation modes — dev/review/tdd/research/plan/debug/architect/hermes
├── walkthrough.ts           # /walkthrough — agent-led tour prompt
├── ecc.ts                   # everything-claude-code installer + skill/agent/command loader
├── stitch.ts                # Google Stitch integration (MCP JSON-RPC client + prompt builder)
├── tools/                   # 9 tools — each implements { name, parameters, call(input, cwd) }
│   ├── bash.ts              # Shell exec with timeout, 10 MB buffer
│   ├── read.ts              # Paged file read with size limit
│   ├── write.ts             # File creation/overwrite, auto mkdir
│   ├── edit.ts              # Find/replace with optional replace_all
│   ├── grep.ts              # ripgrep with grep fallback
│   ├── glob.ts              # File pattern matching
│   ├── list-dir.ts          # Directory listing
│   ├── web-fetch.ts         # URL fetch + HTML→text
│   ├── web-search.ts        # DuckDuckGo Lite — no API key
│   ├── stitch.ts            # Google Stitch MCP wrapper (opt-in via /stitch-config)
│   └── index.ts             # ALL_TOOLS registry (stitch only listed when configured)
├── hooks.ts                 # PreToolUse / PostToolUse / SessionStart / SessionStop dispatcher
├── hook-controls.ts         # Hook profile system (minimal/standard/strict)
├── permissions.ts           # ask/auto/yolo gating per tool
├── security.ts              # Dangerous-command + secret-write scanner
├── sessions.ts              # ~/.crowcoder/sessions/*.json — save/load/resume
├── memory.ts                # Cross-session project memory
├── learning.ts              # Instincts: pattern extraction, confidence decay, pruning
├── skills.ts                # Skill JSON store + trigger-based auto-injection
├── skill-create.ts          # Distill new skills from git history patterns
├── orchestration.ts         # /orchestrate + /multi-* parallel sub-agent prompts
├── autonomous-loops.ts      # /pr-loop + multi-plan/multi-execute prompts
├── search-first.ts          # /search-first /docs-lookup research-before-code prompts
├── modes.ts, codemaps.ts, compaction.ts, strategic-compaction.ts
├── verification.ts          # /verify /test-coverage prompts + checkpoint helpers
├── refactor.ts              # /refactor /refactor-clean prompts
├── evaluation.ts            # /review /tdd /security-review /audit /plan prompts
├── content-engine.ts        # /article /slides /investor-deck /chief-of-staff prompts
├── git-workflow.ts          # /commit /pr /diff /log + branch helpers
├── agents.ts                # 10 language-specific review + build-fix prompt builders
├── cost-tracker.ts          # ~/.crowcoder/usage.json — token counts, cost estimates
├── model-router.ts          # /route — complexity-based model switching
├── docs-sync.ts             # /update-docs + project language detection
├── package-detect.ts        # /detect — package manager / test runner / build tool
├── rules.ts                 # Language-specific coding rules (loaded into system prompt)
├── pm2-manager.ts           # /pm2 wrapper
├── theme.ts                 # TUI colors + splash + banner + tool-call rendering
├── retry.ts                 # API call retry with backoff
├── export.ts                # /export md/json/txt
├── html-parser.ts           # HTML→text for web_fetch
└── types.ts                 # CrowcoderConfig, Message, Session, Mode types

bin/
└── crowcoder.js             # CLI entry — DEP0040 suppress + dynamic import dist/index.js

resources/
└── ecc/                     # Bundled everything-claude-code library
    ├── skills/              # 33 SKILL.md files (one per skill)
    ├── agents/              # 16 kiro agent JSON+MD pairs
    ├── commands/            # 9 workflow command prompts
    ├── rules/               # 39 language-specific rule files
    └── prompts/             # 6 GitHub prompt files

tests/
├── smoke-commands.mjs       # 88-command dispatch smoke test (no LLM calls)
├── llm-drive-all.mjs        # End-to-end LLM driver against a real API
├── users.test.ts            # Vitest unit tests
└── e2e/                     # Playwright E2E
```

---

## 🤝 Contributing

PRs welcome. Please:

- Strict TypeScript — avoid `any`
- Focused PRs — one thing per PR
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Never commit API keys, tokens, or paths containing your username
- Run `node tests/smoke-commands.mjs` before submitting — must report `88/88 pass`

For larger features (new mode, new tool, new orchestration pattern), open an issue first to discuss the design.

---

## 📜 License

Distributed under the **[MIT License](LICENSE)**.

Crowcoder bundles content from these projects, each under their own license:
- [everything-claude-code](https://github.com/Crownelius/everything-claude-code) — agent harness library
- [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) — Hermes mode inspiration

---

<div align="center">

**Compact Agent** — Built to fit a lot of intelligence in a small command.

[Bug reports](https://github.com/Crownelius/Crowcoder/issues) • [Install guide](INSTALL.md) • [Command reference](COMMANDS.md) • [npm](https://www.npmjs.com/package/compact-agent)

</div>
