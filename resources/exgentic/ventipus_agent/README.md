# ventipus for Exgentic

This directory is a custom Exgentic agent package for running ventipus in
Open Agent Leaderboard style evaluations.

The adapter implements Exgentic's `Agent` / `AgentInstance` split. On each
`react()` step it writes an Exgentic prompt, launches ventipus in
non-interactive `/benchmark` mode, asks ventipus to finish with one JSON
action object, then maps that JSON back to an Exgentic `ActionType`.
It auto-selects specialized `/benchmark` profiles for AppWorld, BrowseComp+,
tau2, ARC, SaaS, roadmap, and mobile-style tasks from the task, context, and
available action schemas, and lists valid action names separately to reduce
invalid-action rate. Long sessions use a folded history ledger that preserves
latest observations, selected actions, action counts, and diagnostics without
reinjecting bulky raw stdout into every step.

## Python API use

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path("path/to/resources/exgentic").resolve()))

from ventipus_agent import VentipusAgent
from exgentic.interfaces.lib import evaluate

results = evaluate(
    benchmark="gsm8k",
    agent=VentipusAgent(
        model="openrouter/free",
        provider="openrouter",
        max_turns=8,
    ),
    num_tasks=5,
)
```

## Registry use

For Exgentic CLI usage, copy this directory into an Exgentic checkout at:

```text
src/exgentic/agents/ventipus_agent/
```

Then add a registry entry:

```python
"ventipus_agent": RegistryEntry(
    display_name="Ventipus",
    module="exgentic.agents.ventipus_agent.agent",
    class_name="VentipusAgent",
),
```

After that:

```bash
exgentic install --agent ventipus_agent --local
exgentic evaluate --benchmark gsm8k --agent ventipus_agent --model openrouter/free
```

## Configuration

- `VENTIPUS_EXGENTIC_COMMAND` overrides the command, default `ventipus`.
- `VENTIPUS_INSTALL_SPEC` controls `setup.sh`, default `ventipus@latest`.
- `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, and other ventipus provider env vars
  are passed through by the launched ventipus process.
- `model`, `provider`, `max_turns`, `max_tokens`, `context_window_tokens`,
  `temperature`, and `output_format` become ventipus CLI flags.
- `extra_env` and `extra_args` let Exgentic experiments pass additional
  ventipus settings without modifying this adapter.

The adapter reports ventipus's `summary.json` estimated cost to Exgentic
when `VENTIPUS_BENCHMARK_TRACE_DIR` output is present.
