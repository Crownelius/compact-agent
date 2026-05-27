# ventipus

A terminal AI coding CLI for any OpenAI-compatible API.

[![npm](https://img.shields.io/npm/v/ventipus?color=cyan)](https://www.npmjs.com/package/ventipus)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

```bash
npm install -g ventipus
ventipus --doctor
ventipus
```

`ventipus --doctor` checks the global install, npm registry metadata, provider config, MemPalace, research credentials, and benchmark adapter packaging without printing token values. First run prompts you for a provider, key, model, and permission mode. After that, `ventipus` from any directory drops you into a REPL with a persistent bottom-anchored input box.

---

## What it does

- Speaks any OpenAI-compatible Chat Completions endpoint. OpenRouter, OpenAI, NVIDIA, DeepSeek, GLM, Ollama, LM Studio, or anything custom.
- Tool-call loop with `bash`, `read_file`, `write_file`, `edit_file`, `apply_patch`, `grep`, `glob`, `list_dir`, `benchmark_context`, `todo_write`, `web_search`, `web_fetch`, `research_sources`, plus optional `stitch` (Google's UI generator) when configured.
- Permission gating: `/perm ask` prompts every tool call, `/perm auto` lets read-only and safe writes through, `/perm yolo` runs everything.
- Optional OS sandbox: `/sandbox standard` uses `sandbox-exec` (macOS) or `bwrap` (Linux) when available. No-op on Windows.
- Multi-key rotation pool: add several provider keys via `/keys add`. The agent round-robins and cools down keys that hit 429 / quota / auth errors so the others keep working.
- Parallel agent swarm: `/swarm <agent,agent,...> <task>` fans out N specialized ECC agents against the same prompt and prints attributed results.
- Source-grounded research briefs: `/source-research <topic>` queries arXiv, GitHub repos/issues/PRs/code, Hugging Face papers/models/datasets, and Kaggle datasets/competitions before synthesis.
- Automatic repo-map context for larger codebases: ventipus injects a bounded symbol/file outline ranked by local dependency references and request terms, then asks the model to read full files before editing.
- Bundled [everything-claude-code](https://github.com/Crownelius/everything-claude-code): 228 skills, 60 agents, 75 workflow commands, 19 language rule bundles. Auto-installed on first launch; refresh with `/ecc-install`.
- 10 modes (`/mode <name>`): `dev`, `review`, `tdd`, `research`, `plan`, `debug`, `benchmark`, `architect`, `hermes`, `design`. Each rewrites the system-prompt addendum.
- Optional voice + accessibility: Whisper dictation, ElevenLabs TTS readout, and a 19-binding F-row hotkey scheme designed for blind / low-vision users (see [Accessibility](#accessibility)). Off by default — opt in with `/voice on`.
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
| `benchmark` | SWE-bench/Terminal-Bench-style runs: localize, patch, verify, and report harness-grade evidence. |
| `architect` | Component boundaries, data flow, scalability, schemas, deployment. |
| `hermes` | Recalls prior sessions, parallelizes independent subtasks, distills new skills from experience, suggests what's worth banking. |
| `design` | UI requests flow through Google Stitch automatically. Requires `/stitch-config`. |

---

## Providers

| Provider | Base URL | Notes |
| :--- | :--- | :--- |
| OpenRouter | `https://openrouter.ai/api/v1` | One key, hundreds of models. Defaults to `openrouter/free` for free-tier-safe use. |
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

For a free-tier-only OpenRouter account, use `/openrouter-free` to reset the provider, primary model, and fallback to `openrouter/free`. The interactive `/model` picker floats currently free models to the top.

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
| `/openrouter-free` | Switch OpenRouter back to the free model router. |
| `/palette <id>`, `/palettes` | Switch among 12 Coolors trending color schemes. |
| `/perm ask\|auto\|yolo` | Change permission mode. |
| `/sandbox off\|standard\|strict` | OS sandbox level (macOS / Linux only). |
| `/keys add\|remove\|status\|clear` | Manage the key-rotation pool. |
| `/swarm <agents> <task>` | Parallel multi-agent fan-out. |
| `/source-research <topic>` | Research arXiv, GitHub repos/issues/PRs/code, Hugging Face papers/models/datasets, and Kaggle datasets/competitions before synthesis. |
| `/benchmark <task>` | Run a benchmark-grade issue/terminal/general-agent workflow. Profiles: `swe-bench`, `terminal-bench`, `swe-context`, `swe-chain`, `ci-repair`, `wildclaw`, `arc-agi`, `specbench`, `reward-hacking`, `roadmapbench`, `saasbench`, `swe-bench-mobile`, `appworld`, `browsecomp`, `tau2`, `generic`. |
| `/tdd <feature>` | TDD workflow — failing test first. |
| `/review [target]` | Severity-rated code review. |
| `/audit` | Local project health check. Nothing leaves your machine. |
| `/doctor` | Install/config/benchmark readiness check. Tokens are never printed. |
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

Typing `/` at an empty prompt opens a bounded inline command selector, not a full-screen overlay. It stays under the prompt, keeps the widget under roughly half the terminal height, supports typing to narrow, arrows/PageUp/PageDown to scroll, Home/End to jump, and Enter to run the highlighted command. If a slash prefix is already typed, Tab reopens the same bounded selector with that filter instead of dumping every command into the terminal. The selector only erases its own rows, so the surrounding transcript remains visible.

The 12 built-in color palettes are the first-page Coolors trending schemes: `olive-garden-feast`, `fiery-ocean`, `refreshing-summer-fun`, `ocean-blue-serenity`, `pastel-dreamland-adventure`, `sunny-beach-day`, `dark-sunset`, `fiery-red-sunset`, `fiery-palette`, `rustic-earthy-tones`, `golden-summer-fields`, and `vibrant-tones`.

---

## Benchmark harnesses

Headless harnesses can run without a saved config by providing provider env vars:

```bash
VENTIPUS_ENV_CONFIG=1 \
OPENROUTER_API_KEY="<key>" \
VENTIPUS_MODEL="openrouter/free" \
ventipus --prompt "/benchmark terminal-bench repair the failing task" --perm yolo
```

In non-interactive mode, slash commands are dispatched before the model call, so the example above enters benchmark mode and sends the expanded benchmark prompt rather than asking the model to interpret `/benchmark` as ordinary text.

Common harness flags are accepted as per-run overrides without changing `config.json`: `--model`, `--fallback-model`, `--base-url`, `--api-key-env`, `--max-turns`, `--max-tokens`, `--context-window-tokens`, `--temperature`, `--output-format`, and `--benchmark-trace-dir`.

For Terminal-Bench, ventipus ships an `AbstractInstalledAgent` adapter:

```bash
ADAPTER="$(ventipus --print-terminal-bench-adapter)"
ROOT="$(cd "$(dirname "$ADAPTER")/../.." && pwd)"
PYTHONPATH="$ROOT:${PYTHONPATH:-}" \
tb run \
  --agent-import-path resources.terminal_bench.ventipus_agent:VentipusTerminalBenchAgent \
  --task-id hello-world
```

The adapter installs `ventipus@latest` inside the task container. Set `VENTIPUS_INSTALL_SPEC` to pin a local tarball, npm tag, or exact version, and pass `VENTIPUS_PROVIDER`, `VENTIPUS_MODEL`, `VENTIPUS_MAX_TURNS`, plus the relevant provider key env var for reproducible leaderboard runs. If your benchmark image already has `ventipus` on `PATH`, setup skips network installation entirely; this is the preferred path for network-disabled tasks. For offline harnesses, set `VENTIPUS_BUNDLE_ROOT` to an unpacked ventipus tree with `bin/`, `dist/`, and `node_modules/`, or `VENTIPUS_BUNDLE_TARBALL` to a local `.tgz`; the setup script checks those before falling back to the npm registry. Terminal-Bench runs also write `.ventipus/benchmark-summary.json`, `.ventipus/benchmark-trace.jsonl`, `.ventipus/agent-context-compiled.jsonl`, `.ventipus/submission-bundle-manifest.json`, `.ventipus/benchmark.patch`, and `.ventipus/git-status.txt` when available; patch/status artifacts are redacted and the patch includes unstaged, staged, and untracked file diffs where git can render them.

Benchmark adapters default `VENTIPUS_BASH_TIMEOUT_MS` to `300000` so long installs, broad test runs, and model loads do not fail before the task timeout. Inside a task, the `bash` tool also accepts `timeoutMs` or `timeoutSec` up to 30 minutes, plus `background:true` for services with log capture. Foreground bash calls that time out or return truncated output save the full stdout/stderr under `.ventipus/bash-output/` and return the log path in the tool result.

Large non-bash tool outputs are also archived before they enter model history: ventipus keeps a head/tail summary in context and writes the full result under `.ventipus/tool-output/`. Set `VENTIPUS_TOOL_OUTPUT_ARCHIVE_CHARS` to tune the threshold.

Rolling compaction starts before the context is in trouble: by default it triggers at the smaller of 60k tokens or half the configured context window, keeps the original user task pinned, then summarizes older history. Set `VENTIPUS_COMPACTION_TRIGGER_TOKENS` to tune that threshold for a benchmark run. OpenRouter free-tier routes are treated conservatively: `openrouter/free` uses a safe 128k planning window because the router can pick different free models, and manually typed unknown `:free` model IDs use 32k unless a context window is supplied. The interactive OpenRouter `/model` picker uses the live catalog context for the selected exact model and saves that hint. LLM summaries are routed through `VENTIPUS_COMPACTION_MODEL` when set; on OpenRouter, compaction automatically prefers `fallbackModel` so a paid primary can still summarize through a cheap/free route. Set `VENTIPUS_LLM_COMPACTION=0` or `VENTIPUS_COMPACTION_MODE=local` for deterministic no-provider-call compaction. If the summarization call fails or returns empty text, ventipus falls back to a deterministic local summary so rate limits do not leave the oversized history unchanged; set `VENTIPUS_LOCAL_COMPACTION_FALLBACK=0` to disable that failure fallback.

For known cloud OpenAI-compatible endpoints, ventipus requests streamed token-usage accounting so harness logs and `~/.ventipus/usage.json` include prompt/completion counts. Set `VENTIPUS_STREAM_USAGE=0` to disable or `=1` to force it for a custom endpoint.

Benchmark mode automatically injects a read-only `benchmark_context` preflight snapshot. It surfaces manifests, project-native environment reconstruction setup commands, likely verifier commands, CI workflow run commands plus setup/env-key/service/container hints from GitHub Actions/GitLab/CircleCI/Azure/Jenkins configs, Terminal-Bench/Harbor harness artifacts, package scripts, task files, concise task-instruction excerpts with exact line references, task-contract signals from visible acceptance criteria/requirements/success criteria/no-edit clauses, runtime/toolchain hints, service-persistence hints, benchmark method hints, installed tool hints, relevant MemPalace memories, relevant prior local benchmark trace summaries, bounded replay checkpoints from high-quality matching prior runs, prior low-quality/unsafe experience warnings, and candidate oracle/answer files to avoid wasting early turns on basic environment discovery while preserving anti-leakage discipline. Env values are not printed; only required key names are surfaced. MemPalace memories and prior benchmark experience are framed as cost-saving hypotheses only: current task files, verifier output, and anti-leakage rules override them, and failed prior patterns are listed separately as behaviors to avoid rather than reuse. The benchmark prompt follows a source-grounded method stack: convert task-instruction excerpts and task-contract signals into a short checklist, localize with a dossier, reproduce before repair, write explicit `Prediction:` lines before non-trivial edits, patch with checkpoint discipline, reconstruct project setup plus CI setup/env/services before interpreting CI or dependency failures, validate narrow then broad including relevant CI test/build/lint steps, and use `research_sources` with targeted arXiv/GitHub/Hugging Face/Kaggle coverage plus `recent_days:90` for agent-improvement, model, dataset, or leaderboard work. During benchmark chains, ventipus also tracks trajectory quality signals, including task-alignment, spec-compliance, reward-hack, and long-horizon coverage risk, so under-evidenced or benchmark-invalid runs can be redirected before finalizing.

Bundled ECC skills are exposed with progressive disclosure: the system prompt shows only Level-0 skill names and descriptions, and `skill_view` loads the full prompt body only after a fit check. In benchmark mode the prompt asks the agent to inspect `benchmark_context` and local repo evidence before loading a skill, prefer one strongly domain/version-matched skill, and treat local files plus verifier output as authoritative.

`research_sources` queries GitHub repositories by default; set `github_kind:"issues"`, `"pulls"`, `"code"`, or `"all"` when benchmark work needs implementation details, issue reports, or PR repair patterns. It queries Hugging Face papers, models, and datasets; set `kind:"papers"` to scan only HF daily papers or `kind:"all"` for the full HF sweep. Use `recent_days` for newest-science work; it filters arXiv and GitHub repo/issue/pull queries at the source, sorts Hugging Face models/datasets by `lastModified`, sorts Kaggle datasets by `updated` and competitions by `recentlyCreated`, and filters stale dated HF/Kaggle hits when metadata is available. GitHub code search has no supported pushed/updated qualifier, so code hits are reported as implementation examples rather than freshness proof. Benchmark trajectories treat complete arXiv/GitHub/Hugging Face/Kaggle research without a recency window as stale evidence until justified. It also queries Kaggle datasets and, when Kaggle auth is configured, competitions; set `kaggle_kind:"competitions"` for leaderboard surfaces only. Output starts with coverage notes and a source digest, preserves deterministic arXiv/GitHub/Hugging Face/Kaggle ordering for reproducible traces, and reports requested recency plus whether Kaggle competitions were skipped because auth was unavailable. It can use optional Hugging Face and Kaggle credentials without writing them into ventipus state. For Hugging Face it reads `HF_TOKEN`, compatible token env aliases, `HF_TOKEN_PATH`, or the standard Hugging Face token cache. For Kaggle it reads `KAGGLE_API_TOKEN`, `KAGGLE_CONFIG_DIR/access_token`, `KAGGLE_USERNAME` plus `KAGGLE_KEY`, or legacy `kaggle.json`.

In non-interactive runs, ventipus also guards against empty engagement: benchmark mode expects at least two concrete tool calls before accepting a final no-tool response, then forces a direct re-engagement prompt if the model tries to stop early. Set `VENTIPUS_MIN_TOOL_CALLS_BEFORE_DONE=0` to disable this for answer-only harnesses.

Benchmark runs also write redacted local trace artifacts with `summary.json`, `trace.jsonl`, `open-agent-leaderboard-draft.json`, `agent-context-compiled.jsonl`, `submission-bundle-manifest.json`, and, for git worktrees, `worktree.patch` plus `git-status.txt` under `~/.ventipus/benchmark-runs/` by default. The Open Agent draft maps compact action/cost/process metadata into the public leaderboard column shape but stays `submissionReady:false` until an official harness supplies benchmark score and session success evidence. The submission bundle manifest indexes the trace, draft row, context compilation, patch, and git-status artifacts with SHA-256 hashes, declares the official fields still missing, and stays `submissionReady:false` until benchmark-owned score and session results are present. The agent-context compilation artifact is a bounded ACC-style task/context/answer JSONL record compiled from redacted user task text, tool observations, verifier state, source coverage, changed files, usage, and warnings for retrieval, replay, or training-data curation. The patch artifact includes unstaged, staged, and untracked file diffs where git can render them. `summary.json` includes a compact `experienceCard` for future runs: bounded pre-edit replay checkpoints, failure signatures, task-contract state and bounded redacted signals, task-alignment, spec-compliance, and reward-hack risk signals, environment-reconstruction setup/failure state, dependency-upgrade manifest/lockfile setup-validation state, decision-observability edit predictions with the next verifier outcome, validation-reliability evidence for final verifier stability/broad/CI coverage, context-utilization precision/miss evidence, source-research coverage, verification commands, changed files, and warnings. `benchmark_context` reads that structured card first and falls back to `trace.jsonl` for older summaries, so prior experience reuse stays cheap and filterable; matching prior task-contract signals and dependency-upgrade targets also raise the relevance score so similar requirements and package-manager work are reused before merely similar file names. `summary.json` also includes run-level usage telemetry (`callCount`, prompt/completion/total tokens, estimated USD cost, and per-model breakdown), trajectory-quality signals for benchmark context use, cost-efficiency risk when high usage is paired with weak benchmark evidence, invalid tool-action count/percent/events for unknown tools, malformed JSON, schema failures, security/hook blocks, permission denial, and loop/streak aborts, task-instruction/task-contract signals and whether they were converted into a post-context `todo_write` checklist, no-edit/no-op contract detection and whether edit tools were used anyway, task-alignment risk for ignored task constraints, distractor/decoy references, and off-task-looking edits, spec-compliance risk for SpecBench-style visible-suite-only validation or hardcoded visible cases, reward-hack risk for verifier tampering, oracle/solution probes, result-file edits, shortcut completion markers, and bypass commands, test/harness/verifier edit risk unless the task explicitly asks for tests, localization before edit, per-target edit localization and unlocalized edit-target events, local context-utilization precision against eventual edit targets, large edit-surface scope checks, scratch/probe artifact checks, redundant read/search tool loops, redundant failing-verifier reruns, blind repair after failed verifier signals, failed-verifier source-file alignment for repair edits, post-edit pass/fail/pass regression cycles, environment setup commands, dependency manifest/lockfile edit signals with later install/update/lockfile and validation evidence, unresolved verifier failures that look like missing dependencies/toolchains/build artifacts, latest post-edit verifier status, post-edit and final-state diff/status review, final-edit validation stability/lucky-pass risk, narrow-to-broad post-edit validation, CI-derived verifier command coverage from detected workflows, final-state validation after the last edit, failing reproduction before repair, parsed verifier pass/fail counts and compact failure signatures when recognizable, final-answer verification-claim and incomplete/blocked completion evidence, incomplete/inconclusive verifier timeout or truncation markers, source research use/coverage, source recency windows, source hit/error counts and source URLs when parsable, structured process defects with a 0-100 process score, potential leakage-risk artifacts, warnings, verification commands, and changed files. Source coverage checks the requested source kinds, emitted coverage notes, parsed hits, source errors, and whether targeted research included a recency window, so unauthenticated Kaggle competition fallback, stale/unbounded research, or empty/error-only research is not treated as strong leaderboard evidence. Long `research_sources` outputs are preserved in traces as compact structured evidence lines rather than a generic head-only preview, so tail endpoint/auth failures still affect source-quality scoring. Process defects categorize orientation, requirement-fidelity, benchmark-validity, localization, reproduction, validation, source-research, execution-control, and leakage failures so harnesses can score the trajectory without scraping warning prose. Verifier evidence currently recognizes Vitest, Jest, pytest, Cargo, Go test, Maven/Surefire, Gradle, dotnet test, and generic test summaries; failed verifier runs preserve head/tail output previews so noisy logs still retain final summaries plus compact test/file/error signatures for localization, and timeout/truncation without parsed failure evidence is treated as inconclusive rather than a solid reproduction. Final-answer evidence flags unsupported or contradicted claims that tests/checks passed, plus final answers that say the task is incomplete or blocked. Verifier failures that look like missing dependencies, toolchains, or build artifacts are treated as environment-reconstruction gaps until a project-native setup/restore/install command or later passing verifier closes them. Set `VENTIPUS_BENCHMARK_TRACE_DIR` to collect these in a harness artifact directory.

The compact `experienceCard` also carries `runEfficiency` action/usage/cost evidence, including tool calls, usage calls, total tokens, estimated cost, successful verifier count, process score, invalid action rate, and cost-efficiency risk for prior-run ranking and harness-side scoring. Prior benchmark hints surface source-research coverage as `source_research=...` when available, including source kinds, hit/error counts, targeted/fresh coverage, recency windows, Kaggle fallback status, top URLs, and bounded notes so evidence-backed memories can be preferred over stale or partial research.

Long-horizon profiles (`roadmapbench`, `saasbench`, and `swe-bench-mobile`) add milestone-oriented prompts and trace fields for roadmap/SaaS/mobile coverage risk. The trace warns when these tasks lack a post-context milestone checklist, leave roadmap items incomplete after visible validation, or claim completion without broad integration, platform, migration, e2e, or repeated validation evidence.

Open Agent general-task profiles (`appworld`, `browsecomp`, and `tau2`) tune the benchmark prompt toward stateful app actions, source-grounded web research, and policy-bound customer workflows. The Exgentic adapter auto-selects these profiles from task/context/action schemas instead of always dispatching a generic prompt, prints available action names separately, adds a deterministic recommended action shortlist before the full schemas, highlights required argument keys with redacted exact latest-observation/context hints when available, and repairs near-miss action names/argument keys plus exact latest-observation/context required-argument omissions before dispatch to reduce invalid or premature action selection while keeping every benchmark action available.

KBench-style CLI harnesses can use ventipus directly:

```bash
KBENCH_CLI_COMMAND="ventipus" \
KBENCH_CLI_PROMPT_FLAG="--prompt" \
KBENCH_CLI_MODEL_FLAG="--model" \
KBENCH_CLI_OUTPUT_FLAG="--output-format" \
KBENCH_CLI_OUTPUT_VALUE="text" \
KBENCH_CLI_EXTRA_ARGS="--perm yolo --benchmark-trace-dir ./artifacts" \
kbench run --benchmark swe --harness custom-adapter --model-name openrouter/free --instruction "Fix the bug"
```

Or use the packaged KBench `custom-adapter`:

```bash
ADAPTER="$(ventipus --print-kbench-adapter)"
kbench run \
  --benchmark swe \
  --harness custom-adapter \
  --adapter "$ADAPTER" \
  --model-name openrouter/free \
  --instruction "Fix the bug"
```

The KBench adapter emits redacted instruction, stdout, stderr, benchmark trace refs, and when available a redacted `patch` plus `git-status` artifact from the task worktree; patch output includes unstaged, staged, and untracked file diffs where git can render them. When a native `summary.json` is present, the adapter also copies compact verifier evidence, final-answer verification-claim and incomplete/blocked completion evidence, usage/cost telemetry, the `experienceCard` replay/context/task-alignment/spec-compliance/reward-hack/long-horizon/environment-reconstruction/dependency-upgrade/decision-observability/validation-reliability/context-utilization summary, the compiled task/context/answer record, the submission bundle manifest, cost-efficiency risk, invalid tool-action telemetry, task-contract checklist completion/no-edit/test-edit signals, task-alignment risk signals, spec-compliance risk signals, reward-hack risk signals, long-horizon coverage risk signals, incomplete/inconclusive verifier signals, environment setup/reconstruction signals, dependency manifest/lockfile setup-validation signals, skill-view fit/timing signals, per-target edit-localization, local context-utilization precision/risk, large edit-surface, scratch/probe artifact, redundant tool-call, redundant failing-verifier rerun, blind-repair, failed-verifier source-file repair alignment, post-edit regression-cycle signals, latest post-edit verifier, post-edit and final-state diff-review, final-edit validation stability/lucky-pass signals, broad-validation signals, CI-derived validation signals, process-defect scoring, trajectory quality, verifier commands, and changed-file lists into `benchmarkResult.traceSummary`; `benchmarkResult.usage` aliases the compact usage block for harnesses that rank by cost, and `benchmarkResult.experienceCard` aliases the compact prior-experience block for harness-side scoring.

The KBench `experienceCard` alias includes the same `runEfficiency` block so harnesses can rank cost, token, invalid-action, and verifier-success tradeoffs without parsing raw trajectory-quality fields.

For HAL, `ventipus --print-hal-agent` prints a custom-agent directory containing `main.py`, `requirements.txt`, and a HAL `run(input, **kwargs)` entrypoint. The adapter shells out to ventipus in `/benchmark` mode, returns SWE-bench-style git patches, ScienceAgentBench-style trajectory strings, AppWorld `Completed` markers, and USACO/general `response` fields, stores redacted HAL stdout/stderr plus ventipus traces under `.ventipus/hal-trace/`, forwards HAL `-A model_name=...`, `provider`, `max_turns`, `max_tokens`, `temperature`, and `output_format` kwargs to CLI flags, and omits oracle-like fields such as gold patches, test patches, solutions, and answers from the prompt by default.

For Exgentic/Open Agent Leaderboard, `ventipus --print-exgentic-agent` prints a custom Exgentic `Agent` package. Add its parent `resources/exgentic` directory to `PYTHONPATH` and pass `VentipusAgent(...)` to Exgentic's Python `evaluate(...)`, or copy it into an Exgentic checkout under `src/exgentic/agents/ventipus_agent/` and register the `ventipus_agent` slug for CLI use. The adapter shells out to ventipus in `/benchmark` mode on each Exgentic `react()` step, auto-selects profiles such as AppWorld, BrowseComp+, tau2, ARC, SaaS, roadmap, and mobile from the benchmark task/context/actions, builds a current-state action shortlist with required argument keys and redacted exact current-state hints before showing the full schemas, folds prior observations/actions into a compact task-relevant ledger before each step, asks for one machine-readable action JSON object, repairs case/camelCase/schema-key near misses, fills omitted required schema fields from exact latest-observation/context keys when available, maps that back to the benchmark's `ActionType`, stores prompt/stdout/stderr/trace artifacts under Exgentic's session agent directory, and reports ventipus `summary.json` estimated cost when available.

`ventipus --print-open-agent-card` prints a packaged Open Agent Leaderboard-style agent card documenting Ventipus identity, architecture, tools, memory, supported environments, evaluation artifact policy, limitations, and run commands. The card is submission metadata only; leaderboard claims still require official harness output.

---

## Permissions and safety

| Mode | Behavior |
| :--- | :--- |
| `ask` | Prompts before each tool call. Default. |
| `auto` | Reads and safe writes go through. Bash + destructive ops still prompt. |
| `yolo` | Approves everything. Use with caution. |

A separate execpolicy gate intercepts dangerous bash patterns (`rm -rf`, `git ... --no-verify`, secret scanners) before they reach the shell — independent of the permission mode. Five default hooks (configurable in `~/.ventipus/hooks.json`) cover console-leftover warnings, `.env` reads, missing tmux for dev servers, and a hard block on `--no-verify`.

---

## Privacy

| Data | Where it lives |
| :--- | :--- |
| Conversation messages | Your chosen provider only — required for inference. |
| Token counts, costs | `~/.ventipus/usage.json`. Local. |
| Sessions, skills, instincts, memory | `~/.ventipus/`. Local. |
| API keys | `~/.ventipus/config.json`. Plaintext, local. Protect this file. |
| Hooks | Run locally in your shell. No outbound calls. |

No analytics SDKs, no crash reporting, no auto-update beacon. `rm -rf ~/.ventipus` removes everything.

---

## Accessibility

Built with blind / low-vision users in mind. `/accessibility screenReader on` strips ANSI colors and replaces Unicode glyphs with words so NVDA, JAWS, Narrator, Orca, and VoiceOver can read output cleanly. A 19-binding F-row hotkey scheme covers everything you'd otherwise have to scroll for:

| Key | Function |
| :--- | :--- |
| F1–F4 | Status: what's happening · where am I · re-read full last response · re-read summary |
| F5–F10 | Dictation + TTS playback: F5 push-to-talk · F6 pause · F7 replay · F8 skip · F9/F10 speed ± |
| **F11 / F12** | Read current input buffer · read your previous submitted turn |
| **Shift+F1–F4** | Queued input · key-pool health · last tool-call · toggle screen-reader |
| **Shift+F5 / F6** | Soft-cancel current turn · panic-stop TTS (5s suppression window) |
| **Shift+F12** | Read the hotkey list aloud (discoverability without sighted help) |

Every binding prints to stdout first, then layers TTS on top only if an ElevenLabs key is configured — so users running ventipus alongside their OS-level screen reader get the announcements without paying for TTS.

Key choice rationale: bare F-keys and Shift+F-keys are the only space that's both screen-reader-safe (no Insert / CapsLock / Ctrl+Option modifier collisions with NVDA, JAWS, Narrator, Orca, or VoiceOver) and terminal-safe (no `readline` collisions). F11 and F12 specifically are browser-reserved keys that terminals don't grab.

Voice setup: `/voice config` saves API keys, `/voice on` enables, `/voice test` confirms playback. ffmpeg is required for dictation but optional for TTS-only setups. Speed, voice IDs, and code-skipping behavior are all in `/voice` sub-commands.

---

## From source

```bash
git clone https://github.com/Crownelius/ventipus.git
cd ventipus
npm install
npm link
```

Rebuild after edits with `npm run build` (or `npx tsc`). The `prepare` script also runs `tsc` on `npm install`, so a clean clone produces a working `dist/` without an extra step.

Update: `npm install -g ventipus@latest`. Uninstall: `npm uninstall -g ventipus && rm -rf ~/.ventipus`.

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

[Bug reports](https://github.com/Crownelius/ventipus/issues) · [Install guide](INSTALL.md) · [Commands](COMMANDS.md) · [npm](https://www.npmjs.com/package/ventipus)
