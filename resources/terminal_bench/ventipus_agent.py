"""Terminal-Bench adapter for ventipus.

Usage:
    tb run --agent-import-path resources.terminal_bench.ventipus_agent:VentipusTerminalBenchAgent ...

The adapter installs the npm package in the task container, then runs
ventipus in non-interactive benchmark mode with the task instruction.
"""

from __future__ import annotations

import os
import shlex
from pathlib import Path

from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)

try:
    from terminal_bench.harness_models import TerminalCommand
except ImportError:  # terminal-bench moved this in newer releases
    from terminal_bench.terminal.models import TerminalCommand


class VentipusTerminalBenchAgent(AbstractInstalledAgent):
    """Run ventipus as an installed command-line agent."""

    @staticmethod
    def name() -> str:
        return "ventipus"

    def __init__(
        self,
        model_name: str | None = None,
        provider: str | None = None,
        install_spec: str | None = None,
        max_turns: int | None = None,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._model_name = model_name
        self._provider = provider
        self._install_spec = install_spec
        self._max_turns = max_turns

    @property
    def _env(self) -> dict[str, str]:
        env: dict[str, str] = {
            "VENTIPUS_ENV_CONFIG": "1",
            "VENTIPUS_HOME": "/tmp/ventipus-home",
            "VENTIPUS_THEME": "minimal",
            "VENTIPUS_SHOW_THINKING": "0",
            "VENTIPUS_MEMORY": os.environ.get("VENTIPUS_MEMORY", "0"),
            "VENTIPUS_BASH_TIMEOUT_MS": os.environ.get("VENTIPUS_BASH_TIMEOUT_MS", "300000"),
            "VENTIPUS_INSTALL_SPEC": self._install_spec
            or os.environ.get("VENTIPUS_INSTALL_SPEC", "ventipus@latest"),
        }

        passthrough = [
            "VENTIPUS_API_KEY",
            "VENTIPUS_BASE_URL",
            "VENTIPUS_MODEL",
            "VENTIPUS_FALLBACK_MODEL",
            "VENTIPUS_MAX_TOKENS",
            "VENTIPUS_CONTEXT_WINDOW_TOKENS",
            "VENTIPUS_COMPACTION_TRIGGER_TOKENS",
            "VENTIPUS_COMPACTION_MODEL",
            "VENTIPUS_COMPACTION_MAX_TOKENS",
            "VENTIPUS_COMPACTION_USE_FALLBACK",
            "VENTIPUS_LLM_COMPACTION",
            "VENTIPUS_COMPACTION_MODE",
            "VENTIPUS_LOCAL_COMPACTION_FALLBACK",
            "VENTIPUS_TEMPERATURE",
            "VENTIPUS_BUNDLE_ROOT",
            "VENTIPUS_BUNDLE_TARBALL",
            "OPENROUTER_API_KEY",
            "OPENAI_API_KEY",
            "DEEPSEEK_API_KEY",
            "NVIDIA_API_KEY",
            "GOOGLE_API_KEY",
            "GEMINI_API_KEY",
            "GLM_API_KEY",
            "ZHIPUAI_API_KEY",
        ]
        for key in passthrough:
            if os.environ.get(key):
                env[key] = os.environ[key]

        if self._provider:
            env["VENTIPUS_PROVIDER"] = self._provider
        elif os.environ.get("VENTIPUS_PROVIDER"):
            env["VENTIPUS_PROVIDER"] = os.environ["VENTIPUS_PROVIDER"]

        if self._model_name:
            env["VENTIPUS_MODEL"] = self._model_name
        if self._max_turns:
            env["VENTIPUS_MAX_TURNS"] = str(self._max_turns)
        elif os.environ.get("VENTIPUS_MAX_TURNS"):
            env["VENTIPUS_MAX_TURNS"] = os.environ["VENTIPUS_MAX_TURNS"]

        return env

    @property
    def _install_agent_script_path(self) -> Path:
        return Path(__file__).parent / "setup.sh"

    def _run_agent_commands(self, task_description: str) -> list[TerminalCommand]:
        instruction = "/benchmark terminal-bench " + task_description
        agent_command = (
            "ventipus "
            f"--prompt {shlex.quote(instruction)} "
            "--perm yolo "
            "--benchmark-trace-dir .ventipus/trace"
        )
        script = (
            f"{agent_command}; "
            "status=$?; "
            "mkdir -p .ventipus; "
            "redact_ventipus_artifact() { "
            "sed -E "
            "-e 's/sk-or-v1-[A-Za-z0-9_-]+/sk-or-v1-[REDACTED]/g' "
            "-e 's/sk-[A-Za-z0-9_-]{16,}/sk-[REDACTED]/g' "
            "-e 's/hf_[A-Za-z0-9]{16,}/hf_[REDACTED]/g' "
            "-e 's/KGAT_[A-Za-z0-9]{16,}/KGAT_[REDACTED]/g' "
            "-e 's/npm_[A-Za-z0-9]{16,}/npm_[REDACTED]/g'; "
            "}; "
            "summary=$(find .ventipus/trace -name summary.json -type f 2>/dev/null | sort | tail -n 1 || true); "
            "if [ -n \"$summary\" ] && [ -f \"$summary\" ]; then "
            "cp \"$summary\" .ventipus/benchmark-summary.json; "
            "trace_dir=$(dirname \"$summary\"); "
            "if [ -f \"$trace_dir/trace.jsonl\" ]; then cp \"$trace_dir/trace.jsonl\" .ventipus/benchmark-trace.jsonl; fi; "
            "fi; "
            "if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then "
            "{ git diff --binary --no-ext-diff 2>/dev/null || true; "
            "git diff --cached --binary --no-ext-diff 2>/dev/null || true; "
            "git ls-files --others --exclude-standard -z 2>/dev/null | "
            "while IFS= read -r -d '' f; do "
            "git diff --no-index --binary --no-ext-diff -- /dev/null \"$f\" 2>/dev/null || true; "
            "done; } | redact_ventipus_artifact > .ventipus/benchmark.patch; "
            "git status --short 2>/dev/null | redact_ventipus_artifact > .ventipus/git-status.txt || true; "
            "fi; "
            "if [ -s .ventipus/benchmark.patch ]; then "
            "echo '[ventipus] patch artifact: .ventipus/benchmark.patch'; "
            "fi; "
            "if [ -s .ventipus/benchmark-summary.json ]; then "
            "echo '[ventipus] trace summary: .ventipus/benchmark-summary.json'; "
            "fi; "
            "if [ -s .ventipus/benchmark-trace.jsonl ]; then "
            "echo '[ventipus] tool trace: .ventipus/benchmark-trace.jsonl'; "
            "fi; "
            "exit \"$status\""
        )
        command = "bash -lc " + shlex.quote(script)
        return [
            TerminalCommand(
                command=command,
                max_timeout_sec=float("inf"),
                block=True,
            )
        ]
