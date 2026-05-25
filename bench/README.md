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
# from the bench/ directory
uv venv --python 3.12         # terminal-bench requires Python >= 3.12
source .venv/bin/activate     # .venv\Scripts\activate on Windows
uv pip install terminal-bench
```

Then export your API key in the same shell:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...        # bash / zsh
$env:OPENROUTER_API_KEY = "sk-or-v1-..."      # PowerShell
```

## Run a smoke test (one task)

```bash
tb run \
    --agent-import-path compact_agent_adapter:CompactAgent \
    --task-id hello-world
```

The adapter has been verified to load cleanly against `terminal-bench`
0.2.18+ — install script, run commands, and env dict all render
correctly (see `compact_agent_adapter.py` if you want to print the
rendered shell yourself).

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

## How --prompt mode works (under the hood)

Compact-agent v1.33.7+ ships these CLI flags for harness drivers:

| Flag                       | Effect                                                      |
| -------------------------- | ----------------------------------------------------------- |
| `--prompt "<text>"`        | Run one chain with this prompt, then exit                   |
| `--prompt-file <path>`     | Same, but read the prompt from a file (multi-line safe)     |
| `--non-interactive`        | Skip wizard / banner / hotkey listener (implied by --prompt)|
| `--perm ask\|auto\|yolo`   | Per-invocation permission mode (doesn't mutate saved config)|

When `--prompt-file` is set, compact-agent:

1. Refuses to start if `~/.compact-agent/config.json` is missing
   (a wizard would block forever in a piped/headless environment).
2. Skips the banner and the keypress hotkey listener.
3. Pushes the prompt text as one user message.
4. Runs a single `runQuery` chain — agentic tool-use loop until the
   model stops calling tools, or the 10-error loop detector fires.
5. Exits 0 on success, 1 on chain error.

The adapter writes the task description to `/tmp/tb_task.txt` inside
the container, then invokes:

```
compact-agent --prompt-file /tmp/tb_task.txt --perm yolo
```

`--perm yolo` is what makes the agent actually agentic in a benchmark:
without it, every tool call would block on a permission prompt that
the harness can't answer.

## Other caveats

- **API cost** — owl-alpha is free; other models bill per-token. The
  v2 dataset can easily run 1M+ tokens of context across 89 tasks.
  Estimate $5–$50 depending on model + task verbosity.
- **Windows hosts** — Docker Desktop must be running. The harness
  works under WSL2 / PowerShell but you'll want WSL2 for performance.
