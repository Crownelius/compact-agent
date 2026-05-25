"""
Terminal-Bench v2 adapter for compact-agent.

Implements the AbstractInstalledAgent interface so the harness can:
  1. Install compact-agent into the task's Docker container.
  2. Hand the task description to compact-agent on stdin.
  3. Let compact-agent run autonomously (--non-interactive + yolo perms)
     against the task workspace, executing whatever shell commands it
     decides it needs to solve the task.

Run a single task:

    uv run tb run \
        --agent-import-path compact_agent_adapter:CompactAgent \
        --task-id hello-world

Run the full v2 dataset:

    uv run tb run \
        --agent-import-path compact_agent_adapter:CompactAgent \
        --dataset-name terminal-bench-core --dataset-version 2.0

Requirements on the host:
  - Python 3.10+
  - uv (https://docs.astral.sh/uv/)
  - Docker (the harness spawns one container per task)
  - terminal-bench installed in the active uv env
  - Network access to npmjs.com (the install step pulls compact-agent)
  - OPENROUTER_API_KEY (or whichever provider) in the host environment;
    the adapter forwards it into the container as OPENAI_API_KEY +
    OPENAI_BASE_URL so compact-agent's setup wizard skips on startup.

Model selection: defaults to owl-alpha via OpenRouter (free + fast for
benchmarking). Override per-run with:

    --agent-kwargs-json '{"model": "deepseek/deepseek-v4-flash"}'
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

# IMPORTANT: this import path corresponds to terminal-bench >= 2.0 layout.
# If you're on an older terminal-bench, the class moved between versions —
# check `from terminal_bench.agents import AbstractInstalledAgent` first.
try:
    from terminal_bench.agents.installed_agents import AbstractInstalledAgent  # type: ignore
except ImportError:  # pragma: no cover
    from terminal_bench.agents import AbstractInstalledAgent  # type: ignore


# Pinned to a known-working compact-agent release. Bump as new versions
# ship; the bench results depend on the exact agent build, so we want
# this reproducible.
COMPACT_AGENT_VERSION = "1.33.5"

# Default model. owl-alpha is free on OpenRouter and tends to be fast
# enough for benchmark turnaround. Swap to claude-sonnet-4 or
# deepseek-v4 for a quality run.
DEFAULT_MODEL = "openrouter/owl-alpha"

# Install script — runs INSIDE the task container. The harness mounts
# the script and execs it once at container startup, before any task
# command runs. We:
#   1. install Node 20 (compact-agent needs node>=18)
#   2. npm install -g compact-agent@<version>
#   3. seed a minimal config so the setup wizard doesn't prompt
#
# The harness expects an executable shell script at the path we return
# from _install_agent_script_path. We materialize it on disk once per
# task invocation (the harness reads it then copies into the container).
INSTALL_SCRIPT = """\
#!/usr/bin/env bash
set -euo pipefail

# Node 20 (compact-agent's engines field requires >=18)
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install compact-agent globally so it's on PATH.
npm install -g compact-agent@__COMPACT_AGENT_VERSION__

# Seed compact-agent config so the setup wizard skips and the agent
# launches straight into a working state. The wizard would block on
# stdin otherwise — terminal-bench drives the agent via piped stdin
# only for the task description, not for setup.
mkdir -p "$HOME/.compact-agent"
cat > "$HOME/.compact-agent/config.json" <<EOF
{
  "provider": "OpenRouter (Any Model)",
  "baseURL": "https://openrouter.ai/api/v1",
  "model": "__MODEL__",
  "permissionMode": "yolo",
  "theme": "minimal",
  "showThinking": false,
  "voice": { "accessibility": { "screenReader": false } },
  "memory": { "enabled": false }
}
EOF

# API key gets forwarded via OPENAI_API_KEY env (set by the harness from
# the host). compact-agent reads OPENAI_API_KEY at startup when the
# baseURL config field is set.
echo "compact-agent install complete: $(compact-agent --version 2>&1 || echo 'no --version flag')"
"""


class CompactAgent(AbstractInstalledAgent):
    """Terminal-bench adapter for compact-agent."""

    @staticmethod
    def name() -> str:
        return "compact-agent"

    def __init__(self, model: str = DEFAULT_MODEL, version: str = COMPACT_AGENT_VERSION, **kwargs):
        super().__init__(**kwargs)
        self._model = model
        self._version = version
        self._install_script_path: Path | None = None

    @property
    def _install_agent_script_path(self) -> Path:
        """Write the install script to a temp path and hand it to the harness.

        The harness's contract is: this path must exist, must be readable,
        and must be a self-contained shell script. We materialize it on
        first access using the currently-configured model + version.
        """
        if self._install_script_path is None:
            tmpdir = Path("/tmp" if os.name != "nt" else os.environ.get("TEMP", "."))
            self._install_script_path = tmpdir / "compact_agent_install.sh"
            content = (
                INSTALL_SCRIPT
                .replace("__COMPACT_AGENT_VERSION__", self._version)
                .replace("__MODEL__", self._model)
            )
            self._install_script_path.write_text(content)
            self._install_script_path.chmod(0o755)
        return self._install_script_path

    def _run_agent_commands(self, task_description: str) -> list[str]:
        """Return the shell commands the harness will run inside the
        container to actually invoke the agent on this task.

        The harness expects compact-agent to:
          1. Receive the task description on stdin
          2. Run autonomously until it considers the task done
          3. Exit cleanly (any exit code is fine; harness scores by the
             post-run state of the workspace, not by the agent's exit)

        compact-agent's `compact-agent --prompt <text>` mode runs a
        single non-interactive chain and exits. If that flag doesn't
        exist in the installed version, fall back to piping via stdin
        with `echo "..." | compact-agent`.
        """
        # Escape single quotes in the task description for safe shell
        # passing. Multi-line tasks are common (TB v2 task descriptions
        # can include code snippets) so we use a heredoc.
        return [
            textwrap.dedent(f"""
                export PATH="$HOME/.npm-global/bin:$PATH"
                cat <<'__TB_TASK_EOF__' | compact-agent --non-interactive --perm yolo
                {task_description}
                __TB_TASK_EOF__
            """).strip()
        ]

    @property
    def _env(self) -> dict[str, str]:
        """Environment variables forwarded into the container.

        Forward the API key from the host. The harness already isolates
        the container from the host filesystem, so a leaked key doesn't
        cross containers, but it's still your real key — only run the
        benchmark with a key you've budgeted for.
        """
        env = {}
        # Compact-agent reads OPENAI_API_KEY when baseURL is configured.
        # OpenRouter, NVIDIA, DeepSeek, etc all key off this same env.
        key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError(
                "compact-agent benchmark requires OPENROUTER_API_KEY (or OPENAI_API_KEY) "
                "in the host environment. Set it before invoking `tb run`."
            )
        env["OPENAI_API_KEY"] = key
        # COMPACT_AGENT_ANIMATIONS=0 disables in-place ANSI repaints so
        # the harness's log capture stays readable (no spinner garbage).
        env["CROWCODER_ANIMATIONS"] = "0"
        return env


if __name__ == "__main__":
    # Sanity check the install script renders cleanly when this file is
    # run directly: `python compact_agent_adapter.py` prints the script
    # the harness will inject into containers.
    agent = CompactAgent()
    print(agent._install_agent_script_path.read_text())
