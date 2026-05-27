---
name: Ventipus
version: 1.35.36
developers:
  - Crownelius
license: MIT
repository: https://github.com/Crownelius/ventipus
framework: CLI agent with packaged benchmark adapters
models:
  - configurable OpenAI-compatible model
tags:
  - coding-agent
  - general-agent
  - open-agent-leaderboard
  - exgentic
  - terminal-bench
  - kbench
  - hal
  - mempalace
---

# Ventipus Agent Card

## Agent Details

Ventipus is a terminal AI agent for software engineering and general benchmark tasks. It runs as a CLI, speaks OpenAI-compatible APIs, and packages adapters for Terminal-Bench, KBench, HAL, and Exgentic/Open Agent Leaderboard style evaluation.

This card documents the agent system. It is not an official benchmark result and does not claim leaderboard performance without official harness output.

## Architecture

Ventipus uses an iterative tool-calling loop with benchmark mode prompts, read-only preflight context, task-contract extraction, todo tracking, source-specific research, redacted benchmark traces, and structured process scoring.

Primary tool surfaces include shell execution, file read/write/edit/patch operations, search/glob/listing, `benchmark_context`, `research_sources`, `todo_write`, web fetch/search, MemPalace memory tools, and progressive-disclosure skills.

Benchmark mode emphasizes:

- Current task instructions and verifier output over prior memory.
- Task-contract checklist creation before edits.
- Task-alignment checks for ignored constraints, distractor/decoy references, and off-task-looking edits.
- Reproduction before repair when feasible.
- Live preflight checks for PATH, package-manager, interpreter, virtualenv, and network/offline mismatches before treating a verifier as representative.
- Narrow-to-broad validation after edits.
- Reward-hack checks for verifier tampering, oracle/solution probes, result-file edits, shortcut completion markers, and bypass commands.
- CI workflow reconstruction from visible configuration.
- Anti-leakage handling for oracle, answer, gold, hidden, result, and solution files.
- Bounded replay of prior read/search/verifier checkpoints as hypotheses, not patch recipes.

## Memory

Ventipus includes MemPalace-backed project and global memory. In benchmark mode, `benchmark_context` can surface bounded relevant memories and prior local benchmark experience cards. These are explicitly framed as hypotheses that must be verified against current task files and verifier output.

Benchmark traces write compact `experienceCard` summaries with replay checkpoints, failure signatures, task-contract state and signals, task-alignment, spec-compliance, reward-hack, and long-horizon roadmap/SaaS/mobile/WebDevBench/SWE-Cycle/SWE-CI coverage risk signals, environment-reconstruction setup/failure evidence, dependency-upgrade setup-validation evidence, decision-observability edit predictions, validation-reliability evidence, context-utilization precision/miss evidence plus pre-edit context-bloat evidence, evidence-grounding signals for stale/no-effect edit retries without a current-state refresh, AHE publish-state mutation signals for post-pass edits or state-changing commands without revalidation, run-efficiency action/usage/cost/time evidence, source-research coverage, verification commands, changed files, and warnings. They also emit a redacted ACC-style task/context/answer JSONL artifact and an AHE-style change-evaluation artifact for edit prediction verdicts, unpredicted edits, and post-edit regression-cycle attribution.

## Models

For AHE-style decision observability, Ventipus now records explicit regression foresight. Non-trivial benchmark edits should include both `Prediction:` and `At-risk regression:` lines; missing forecasts appear in change evaluation, trajectory quality, process defects, and completion reminders.

Ventipus is model-agnostic across OpenAI-compatible providers. Common configurations include OpenRouter, OpenAI, NVIDIA, Ollama, LM Studio, and DeepSeek-compatible endpoints. The model and provider are selected by CLI flags or environment configuration.

## Supported Environments

Packaged evaluation surfaces:

- Terminal-Bench adapter.
- KBench custom adapter.
- HAL custom agent.
- Exgentic/Open Agent Leaderboard custom agent.

Benchmark mode is designed for SWE-bench-style code repair, terminal tasks, context-reuse benchmarks, long-horizon RoadmapBench/SaaSBench/SWE-Bench Mobile/SWE-WebDevBench/SWE-Cycle/SWE-CI-style tasks, SWE-PRBench-style pull request review tasks, TML-Bench/Kaggle-style tabular ML tasks, Open Agent AppWorld/BrowseComp+/tau2-style tasks, and generic multi-step tool-use tasks. The Exgentic adapter builds a deterministic recommended action shortlist from the current task, context, latest observation, profile, schemas, and recent diagnostics before showing the full action schemas, highlights required argument keys with redacted exact current-state hints when available, repairs case/camelCase/schema-key near misses and exact latest-observation/context required-argument omissions before `ActionType` dispatch, avoids repeating no-effect actions when the latest observation did not change, uses the shortlist/hints to recover from malformed or missing action JSON with a viable non-finish action while completion is not ready, then folds prior observations/actions into a compact task-relevant ledger between steps so long noisy sessions keep current state, policy evidence, WebDevBench canary requirements, frontend/backend evidence, SWE-Cycle lifecycle phases, environment setup state, generated/selected tests, judge evidence, SWE-CI current/target commits, test gaps, inferred requirements, verifier deltas, SWE-PRBench PR metadata/diff/findings/evidence gaps, TML-Bench data contract/validation/submission evidence, selected actions, and diagnostics in view without repeatedly reinjecting raw transcripts. The interactive CLI acknowledges submitted turns before provider I/O, treats F5/Shift+F5 raw terminal sequences as active-turn cancellation on Windows/xterm terminals, and auto-heals known-stuck OpenRouter preview models to the configured free fallback unless explicitly overridden.

## Evaluation Results

Ventipus writes `summary.json`, `trace.jsonl`, `worktree.patch`, `git-status.txt`, `open-agent-leaderboard-draft.json`, `agent-context-compiled.jsonl`, `change-evaluation.json`, and `submission-bundle-manifest.json` artifacts when benchmark trace output is enabled. The draft row follows the public Open Agent Leaderboard result-column shape where local trace evidence can support it, but remains `submissionReady:false` until an official harness supplies benchmark-owned scores and session success evidence. The submission bundle manifest indexes artifact paths and SHA-256 hashes, summarizes verifier/usage/process evidence, and lists missing official fields so local traces are not mistaken for leaderboard scores. Trajectory quality includes explicit task-alignment, spec-compliance, reward-hack, long-horizon coverage, context-utilization, pre-edit context-bloat, weak change-manifest, and evidence-grounding risk fields so benchmark reviewers can separate genuine task progress from distractor-following, recall-heavy unused context gathering, visible-suite-only validation, stale/no-effect edit loops, verifier tampering, oracle access, shortcut score markers, unsupported RoadmapBench/SaaSBench/SWE-Bench Mobile/SWE-WebDevBench/SWE-Cycle/SWE-CI completion claims, or edits without falsifiable prediction/verifier follow-through.

Official results should be produced through Exgentic, HAL, Terminal-Bench, KBench, or another benchmark-owned grader before submission.

## Limitations

- Prior memory and replay traces can be stale or mismatched; current task evidence must override them.
- Generic web or source research cannot prove task success without local or official verifier evidence.
- The agent card does not substitute for official harness scoring.
- Hosted or sandboxed benchmarks may restrict network, package install, or provider access; use pinned bundles or preinstalled `ventipus` where possible.
- Open-weight or free-tier models may show high variance on long-horizon tasks.

## How To Run

Print packaged adapters and card paths:

```bash
ventipus --print-exgentic-agent
ventipus --print-hal-agent
ventipus --print-kbench-adapter
ventipus --print-open-agent-card
```

Run a benchmark task directly:

```bash
ventipus --provider openrouter --model openrouter/free --perm yolo --prompt "/benchmark swe-bench fix the issue"
```

For reproducible leaderboard runs, pin the installed package or bundle, pass provider credentials through environment variables, enable benchmark trace output, and submit only official harness results.
