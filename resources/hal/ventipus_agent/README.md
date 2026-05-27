# ventipus HAL adapter

This directory is a HAL-style custom agent package. It exposes `run(input, **kwargs)` in `main.py` and shells out to the installed `ventipus` CLI in non-interactive benchmark mode.

Defaults:

- SWE-bench-like tasks return a git patch string.
- ScienceAgentBench-like tasks return a solution/trajectory string.
- AppWorld-like tasks return `Completed` after a successful ventipus run.
- USACO and other text-response tasks return the original task dict with a `response` field.
- Oracle-like fields such as `patch`, `test_patch`, `solution`, `answer`, `gold`, `FAIL_TO_PASS`, and `PASS_TO_PASS` are omitted from the prompt unless `VENTIPUS_HAL_INCLUDE_ORACLE_FIELDS=1` is set.
- Traces and logs are written under `.ventipus/hal-trace/` unless `VENTIPUS_HAL_TRACE_DIR` is set.

Useful overrides:

- `VENTIPUS_HAL_COMMAND`: command used to invoke ventipus, default `ventipus`.
- `VENTIPUS_HAL_TIMEOUT_SEC`: per-task timeout, default `1800`.
- HAL `-A model_name=...`, `-A provider=...`, `-A max_turns=...`, and `-A output_format=...` are forwarded to ventipus CLI flags when present.
