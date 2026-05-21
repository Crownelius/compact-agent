# compact-agent

A terminal AI coding CLI for any OpenAI-compatible API.

[![npm](https://img.shields.io/npm/v/compact-agent?color=cyan)](https://www.npmjs.com/package/compact-agent)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

```bash
npm install -g compact-agent
compact-agent
```

First run prompts you for a provider, key, model, and permission mode. After that, `compact-agent` from any directory drops you into a REPL with a persistent bottom-anchored input box.

---

## What it does

- Speaks any OpenAI-compatible Chat Completions endpoint. OpenRouter, OpenAI, NVIDIA, DeepSeek, GLM, Ollama, LM Studio, or anything custom.
- Tool-call loop with `bash`, `read_file`, `write_file`, `edit_file`, `apply_patch`, `grep`, `glob`, `list_dir`, `web_search`, `web_fetch`, plus optional `stitch` (Google's UI generator) when configured.
- Permission gating: `/perm ask` prompts every tool call, `/perm auto` lets read-only and safe writes through, `/perm yolo` runs everything.
- Optional OS sandbox: `/sandbox standard` uses `sandbox-exec` (macOS) or `bwrap` (Linux) when available. No-op on Windows.
- Multi-key rotation pool: add several provider keys via `/keys add`. The agent round-robins and cools down keys that hit 429 / quota / auth errors so the others keep working.
- Parallel agent swarm: `/swarm <agent,agent,...> <task>` fans out N specialized ECC agents against the same prompt and prints attributed results.
- Bundled [everything-claude-code](https://github.com/Crownelius/everything-claude-code): 228 skills, 60 agents, 75 workflow commands, 19 language rule bundles. Auto-installed on first launch; refresh with `/ecc-install`.
- 9 modes (`/mode <name>`): `dev`, `review`, `tdd`, `research`, `plan`, `debug`, `architect`, `hermes`, `design`. Each rewrites the system-prompt addendum.
- Optional voice: Whisper dictation (push-to-talk `F5`) and ElevenLabs TTS readout. Screen-reader mode for blind / low-vision users. All off by default — opt in with `/voice on`.
- Zero telemetry. The only outbound traffic is to your chosen LLM provider when you send a turn.

---

## Modes

`/mode <name>` swaps the system-prompt addendum.

| Mode | What changes |
| :--- | :--- |
| `dev` | Default. General coding, minimal-change bias, reads before edits. |
| `review` | Severity-rated findings (CRITICAL / HIGH / MEDIUM / LOW). Confidence filter — only reports issues it's >80% sure about. |
| `tdd` | RED → GREEN → REFACTOR. Refuses to write implementation before a failing test. |
| `research` | Read-only. Maps architecture, traces paths, never modifies files. |
| `plan` | Numbered step-by-step plans with paths and trade-offs. No code. |
| `debug` | Reproduce → hypothesize → narrow → fix → verify. Refuses to guess. |
| `architect` | Component boundaries, data flow, scalability, schemas, deployment. |
| `hermes` | Recalls prior sessions, parallelizes independent subtasks, distills new skills from experience, suggests what's worth banking. |
| `design` | UI requests flow through Google Stitch automatically. Requires `/stitch-config`. |

---

## Providers

| Provider | Base URL | Notes |
| :--- | :--- | :--- |
| OpenRouter | `https://openrouter.ai/api/v1` | One key, hundreds of models, free tier. Recommended default. |
| OpenAI | `https://api.openai.com/v1` | GPT-4o, o-series. |
| NVIDIA | `https://integrate.api.nvidia.com/v1` | NIM-hosted Llama, Mistral, DeepSeek, etc. Free tier with rate limits. |
| DeepSeek | `https://api.deepseek.com/v1` | Cheap, strong on code. |
| GLM (ZhipuAI) | `https://open.bigmodel.cn/api/paas/v4` | GLM family. |
| Ollama | `http://localhost:11434/v1` | Local. No key. |
| LM Studio | `http://localhost:1234/v1` | Local. No key. |
| Custom | you provide | Anything that speaks OpenAI Chat Completions. |

Anthropic models reach you via OpenRouter (`anthropic/claude-sonnet-4` etc.) — the native Anthropic API isn't OpenAI-compatible.

---

## Key rotation

If you have multiple keys for the same provider (e.g. several free OpenRouter accounts), add them to a pool. The agent round-robins through them and cools off any key that hits 429, quota, or auth errors.

```
/keys add sk-or-v1-…
/keys add sk-or-v1-…
/keys status
```

Cool-down policy: 60s for rate-limit (`429`, `rate.?limit`), 1h for quota / auth / 403. 404 model-not-found and 5xx server errors are NOT treated as key problems — they're surfaced upward without burning a key.

---

## Swarming

Fan out the same task to N specialized agents in parallel.

```
> /swarm code-architect,silent-failure-hunter,type-design-analyzer  audit the auth flow

══════════════════════════════════════════════
  code-architect   (12.4s)
──────────────────────────────────────────────
…
══════════════════════════════════════════════
  silent-failure-hunter   (9.1s)
──────────────────────────────────────────────
…
```

Agents are pulled from the bundled ECC harness. Each runs against an empty tool list (analysis only — no edits or shell). Failures in one don't kill the others (`Promise.allSettled`). Cost = N model calls.

---

## Slash commands

130+ commands. The common ones:

| Command | What it does |
| :--- | :--- |
| `/walkthrough` | Agent-led tour. Aliases: `/tour`, `/guide`. |
| `/help` | Full command list. |
| `/mode <name>` | Switch mode. |
| `/model [name]` | Show or switch model. |
| `/perm ask\|auto\|yolo` | Change permission mode. |
| `/sandbox off\|standard\|strict` | OS sandbox level (macOS / Linux only). |
| `/keys add\|remove\|status\|clear` | Manage the key-rotation pool. |
| `/swarm <agents> <task>` | Parallel multi-agent fan-out. |
| `/tdd <feature>` | TDD workflow — failing test first. |
| `/review [target]` | Severity-rated code review. |
| `/audit` | Local project health check. Nothing leaves your machine. |
| `/orchestrate <task>` | Decompose, run sub-agents in parallel. |
| `/skills`, `/ecc-guide`, `/skill-show <name>` | Browse the bundled skill library. |
| `/learn`, `/evolve`, `/prune` | Cross-session learning system. |
| `/memory` | MemPalace-backed persistent memory (rooms, drawers, KG triples). |
| `/usage`, `/budget` | Local token and cost ledger. |
| `/voice on\|off\|config` | Toggle dictation + TTS. |
| `/accessibility screenReader on` | Screen-reader-friendly output. |
| `/sessions`, `/save`, `/resume` | Full session snapshots. |
| `/checkpoint` | Git-state snapshot inside a session. |
| `/export md\|json\|txt` | Save the conversation. |
| `!<cmd>` | Run a shell command without involving the LLM. |
| `/exit` | Quit. |

See **[COMMANDS.md](COMMANDS.md)** for the full reference.

---

## Permissions and safety

| Mode | Behavior |
| :--- | :--- |
| `ask` | Prompts before each tool call. Default. |
| `auto` | Reads and safe writes go through. Bash + destructive ops still prompt. |
| `yolo` | Approves everything. Use with caution. |

A separate execpolicy gate intercepts dangerous bash patterns (`rm -rf`, `git ... --no-verify`, secret scanners) before they reach the shell — independent of the permission mode. Five default hooks (configurable in `~/.crowcoder/hooks.json`) cover console-leftover warnings, `.env` reads, missing tmux for dev servers, and a hard block on `--no-verify`.

---

## Privacy

| Data | Where it lives |
| :--- | :--- |
| Conversation messages | Your chosen provider only — required for inference. |
| Token counts, costs | `~/.crowcoder/usage.json`. Local. |
| Sessions, skills, instincts, memory | `~/.crowcoder/`. Local. |
| API keys | `~/.crowcoder/config.json`. Plaintext, local. Protect this file. |
| Hooks | Run locally in your shell. No outbound calls. |

No analytics SDKs, no crash reporting, no auto-update beacon. `rm -rf ~/.crowcoder` removes everything.

---

## From source

```bash
git clone https://github.com/Crownelius/compact-agent.git
cd compact-agent
npm install
npm link
```

Rebuild after edits with `npm run build` (or `npx tsc`). The `prepare` script also runs `tsc` on `npm install`, so a clean clone produces a working `dist/` without an extra step.

Update: `npm install -g compact-agent@latest`. Uninstall: `npm uninstall -g compact-agent && rm -rf ~/.crowcoder`.

---

## Contributing

PRs welcome. Strict TypeScript (avoid `any`), one thing per PR, Conventional Commits, no API keys in diffs. Run `node tests/smoke-commands.mjs` before submitting.

For larger features (new mode, new tool, new orchestration pattern), open an issue first.

---

## License

[MIT](LICENSE).

Bundles content from:
- [everything-claude-code](https://github.com/Crownelius/everything-claude-code) — skill / agent / hook harness
- [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) — Hermes mode reference

[Bug reports](https://github.com/Crownelius/compact-agent/issues) · [Install guide](INSTALL.md) · [Commands](COMMANDS.md) · [npm](https://www.npmjs.com/package/compact-agent)
