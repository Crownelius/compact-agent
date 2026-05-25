# compact-agent × Terminal-Bench v2

Adapter that plugs compact-agent into the [Terminal-Bench](https://www.tbench.ai/)
harness so you can benchmark it against the 89-task v2 dataset.

## What you need on the host

- Python 3.10+
- [`uv`](https://docs.astral.sh/uv/) (the bench harness runs under it)
- Docker (one container per task — the harness handles all the
  lifecycle)
- `OPENROUTER_API_KEY` exported in your shell (or `OPENAI_API_KEY` if
  you're routing through OpenAI / another OAI-compatible gateway)

## Setup

```bash
# from this directory
uv venv
source .venv/bin/activate    # .venv\Scripts\activate on Windows
uv pip install terminal-bench
```

## Run a smoke test (one task)

```bash
uv run tb run \
    --agent-import-path compact_agent_adapter:CompactAgent \
    --task-id hello-world
```

This pulls the `hello-world` task, builds its Docker container,
installs Node 20 + `compact-agent@1.33.5` inside, and runs the agent
against the task. Logs land under `runs/<timestamp>/`.

## Run the full v2 dataset

```bash
uv run tb run \
    --agent-import-path compact_agent_adapter:CompactAgent \
    --dataset-name terminal-bench-core --dataset-version 2.0
```

89 tasks × ~1–5 min each = expect a 1.5–7 hour wall-clock run. Each
task spins up its own container in parallel up to your Docker concurrency
limit; set `--concurrency 4` if you want to cap that.

## Swap the model

Default is `openrouter/owl-alpha` (free + fast). For a quality run:

```bash
uv run tb run \
    --agent-import-path compact_agent_adapter:CompactAgent \
    --agent-kwargs-json '{"model": "deepseek/deepseek-v4-flash"}' \
    --dataset-name terminal-bench-core --dataset-version 2.0
```

## How it works

The adapter (`compact_agent_adapter.py`) is a 130-line Python module that:

1. **Installs** — writes a shell script the harness copies into each
   task container. The script installs Node 20 and `npm i -g compact-agent`
   at a pinned version, then seeds a minimal `~/.compact-agent/config.json`
   so the setup wizard doesn't block on stdin.
2. **Runs** — the harness execs `compact-agent --non-interactive --perm yolo`
   with the task description piped via heredoc on stdin. Compact-agent
   runs autonomously (yolo perms → no permission prompts, agentic loop
   until it stops calling tools).
3. **Reports** — the harness scores by the post-run filesystem state of
   the container against task expectations. Compact-agent's exit code
   doesn't matter; what matters is whether the files / commands / state
   match what the task wanted.

## Status: scaffold only — requires `--prompt` flag in compact-agent

**The adapter is not yet runnable end-to-end.** Compact-agent v1.33.x
only has a REPL — there's no `--prompt <text>` one-shot mode, and
piping the task description on stdin trips the interactive setup
wizard / readline-only input path. The adapter is set up for the
day a non-interactive entrypoint lands; the install + container
wiring is already correct.

**To finish this:**

1. In `compact-agent`'s `bin/crowcoder.js`, parse a `--prompt <text>`
   flag (or `--prompt-file <path>`). On match, set a sentinel env
   var that `src/index.ts` reads on startup.
2. In `src/index.ts`, if the sentinel is set:
   - skip the setup wizard (require config to already exist)
   - skip the banner
   - push the prompt as one user message
   - run a single chain to completion
   - exit with code 0 (success) or 1 (chain errored)
3. Wire `--perm yolo` so permission prompts don't block.
4. Once shipped, change the adapter's `_run_agent_commands` to:
   ```python
   return [f"compact-agent --prompt {shlex.quote(task_description)} --perm yolo"]
   ```

ETA: ~2 hours of focused work + a test pass. Not in scope for this
adapter PR; tracking as a TODO in the project.

## Other caveats

- **API cost** — owl-alpha is free; other models bill per-token. The
  v2 dataset can easily run 1M+ tokens of context across 89 tasks.
  Estimate $5–$50 depending on model + task verbosity.
- **Windows hosts** — Docker Desktop must be running. The harness
  works under WSL2 / PowerShell but you'll want WSL2 for performance.
