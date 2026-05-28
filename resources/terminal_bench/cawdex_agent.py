"""Terminal-Bench adapter for Cawdex.

Usage:
    tb run --agent-import-path resources.terminal_bench.cawdex_agent:CawdexTerminalBenchAgent ...

The adapter installs the npm package in the task container, then runs
Cawdex in non-interactive benchmark mode with the task instruction.
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


class CawdexTerminalBenchAgent(AbstractInstalledAgent):
    """Terminal-Bench agent for Cawdex."""

    @staticmethod
    def name() -> str:
        return "cawdex"

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
            "CAWDEX_ENV_CONFIG": "1",
            "CAWDEX_HOME": "/tmp/cawdex-home",
            "CAWDEX_THEME": "minimal",
            "CAWDEX_SHOW_THINKING": "0",
            "CAWDEX_MEMORY": os.environ.get("CAWDEX_MEMORY", "0"),
            "CAWDEX_BASH_TIMEOUT_MS": os.environ.get("CAWDEX_BASH_TIMEOUT_MS", "300000"),
            "CAWDEX_INSTALL_SPEC": self._install_spec
            or os.environ.get("CAWDEX_INSTALL_SPEC", "cawdex@latest"),
        }

        passthrough = [
            "CAWDEX_API_KEY",
            "CAWDEX_BASE_URL",
            "CAWDEX_MODEL",
            "CAWDEX_FALLBACK_MODEL",
            "CAWDEX_MAX_TOKENS",
            "CAWDEX_CONTEXT_WINDOW_TOKENS",
            "CAWDEX_COMPACTION_TRIGGER_TOKENS",
            "CAWDEX_COMPACTION_MODEL",
            "CAWDEX_COMPACTION_MAX_TOKENS",
            "CAWDEX_COMPACTION_USE_FALLBACK",
            "CAWDEX_LLM_COMPACTION",
            "CAWDEX_COMPACTION_MODE",
            "CAWDEX_LOCAL_COMPACTION_FALLBACK",
            "CAWDEX_TEMPERATURE",
            "CAWDEX_BUNDLE_ROOT",
            "CAWDEX_BUNDLE_TARBALL",
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
            env["CAWDEX_PROVIDER"] = self._provider
        elif os.environ.get("CAWDEX_PROVIDER"):
            env["CAWDEX_PROVIDER"] = os.environ["CAWDEX_PROVIDER"]

        if self._model_name:
            env["CAWDEX_MODEL"] = self._model_name
        if self._max_turns:
            env["CAWDEX_MAX_TURNS"] = str(self._max_turns)
        elif os.environ.get("CAWDEX_MAX_TURNS"):
            env["CAWDEX_MAX_TURNS"] = os.environ["CAWDEX_MAX_TURNS"]

        return env

    @property
    def _install_agent_script_path(self) -> Path:
        return Path(__file__).parent / "setup.sh"

    def _run_agent_commands(self, task_description: str) -> list[TerminalCommand]:
        instruction = "/benchmark terminal-bench " + task_description
        agent_command = (
            "cawdex "
            f"--prompt {shlex.quote(instruction)} "
            "--perm yolo "
            "--benchmark-trace-dir .cawdex/trace"
        )
        script = (
            f"{agent_command}; "
            "status=$?; "
            "mkdir -p .cawdex; "
            "redact_cawdex_artifact() { "
            "sed -E "
            "-e 's/sk-or-v1-[A-Za-z0-9_-]+/sk-or-v1-[REDACTED]/g' "
            "-e 's/sk-[A-Za-z0-9_-]{16,}/sk-[REDACTED]/g' "
            "-e 's/hf_[A-Za-z0-9]{16,}/hf_[REDACTED]/g' "
            "-e 's/KGAT_[A-Za-z0-9]{16,}/KGAT_[REDACTED]/g' "
            "-e 's/npm_[A-Za-z0-9]{16,}/npm_[REDACTED]/g'; "
            "}; "
            "summary=$(find .cawdex/trace -name summary.json -type f 2>/dev/null | sort | tail -n 1 || true); "
            "if [ -n \"$summary\" ] && [ -f \"$summary\" ]; then "
            "cp \"$summary\" .cawdex/benchmark-summary.json; "
            "trace_dir=$(dirname \"$summary\"); "
            "if [ -f \"$trace_dir/trace.jsonl\" ]; then cp \"$trace_dir/trace.jsonl\" .cawdex/benchmark-trace.jsonl; fi; "
            "if [ -f \"$trace_dir/agent-context-compiled.jsonl\" ]; then cp \"$trace_dir/agent-context-compiled.jsonl\" .cawdex/agent-context-compiled.jsonl; fi; "
            "if [ -f \"$trace_dir/change-evaluation.json\" ]; then cp \"$trace_dir/change-evaluation.json\" .cawdex/change-evaluation.json; fi; "
            "if [ -f \"$trace_dir/submission-bundle-manifest.json\" ]; then cp \"$trace_dir/submission-bundle-manifest.json\" .cawdex/submission-bundle-manifest.json; fi; "
            "fi; "
            "if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then "
            "{ git diff --binary --no-ext-diff 2>/dev/null || true; "
            "git diff --cached --binary --no-ext-diff 2>/dev/null || true; "
            "git ls-files --others --exclude-standard -z 2>/dev/null | "
            "while IFS= read -r -d '' f; do "
            "git diff --no-index --binary --no-ext-diff -- /dev/null \"$f\" 2>/dev/null || true; "
            "done; } | redact_cawdex_artifact > .cawdex/benchmark.patch; "
            "git status --short 2>/dev/null | redact_cawdex_artifact > .cawdex/git-status.txt || true; "
            "fi; "
            "if [ -s .cawdex/benchmark.patch ]; then "
            "echo '[cawdex] patch artifact: .cawdex/benchmark.patch'; "
            "fi; "
            "if [ -s .cawdex/benchmark-summary.json ]; then "
            "echo '[cawdex] trace summary: .cawdex/benchmark-summary.json'; "
            "fi; "
            "if [ -s .cawdex/benchmark-trace.jsonl ]; then "
            "echo '[cawdex] tool trace: .cawdex/benchmark-trace.jsonl'; "
            "fi; "
            "if [ -s .cawdex/agent-context-compiled.jsonl ]; then "
            "echo '[cawdex] context compilation: .cawdex/agent-context-compiled.jsonl'; "
            "fi; "
            "if [ -s .cawdex/change-evaluation.json ]; then "
            "echo '[cawdex] change evaluation: .cawdex/change-evaluation.json'; "
            "fi; "
            "if [ -s .cawdex/submission-bundle-manifest.json ]; then "
            "echo '[cawdex] submission bundle: .cawdex/submission-bundle-manifest.json'; "
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
