# ventipus KBench Adapter

This directory is a KBench `custom-adapter` for ventipus.

```bash
kbench run \
  --benchmark swe \
  --harness custom-adapter \
  --adapter /path/to/resources/kbench/ventipus_agent \
  --model-name openrouter/free \
  --instruction "Fix the bug"
```

The runner reads the KBench JSON payload from `KBENCH_ADAPTER_INPUT` or stdin,
invokes `ventipus --prompt "/benchmark ..."` in task mode, and emits one
`AdapterRunnerOutput` JSON object to stdout.
Known KBench slugs are mapped to benchmark profiles before dispatch:
`swe`/`swe-bench`, `tb2`/`terminal-bench`, `swe-chain`,
`ci-repair`/`ci-repair-bench`, `roadmapbench`, `saasbench`,
`swe-bench-mobile`, `webdevbench`/`swe-webdev-bench`, `appworld`, `browsecomp`/`browsecompplus`, and
`tau2`/`tau-bench` use specialized prompts; unknown slugs use
`generic`.

The output includes redacted instruction/stdout/stderr artifact refs, native
ventipus trace refs, and redacted git patch/status refs when the task
worktree is a git repo. If a native `summary.json` exists, compact verifier
evidence, including parsed counts, compact failure signatures, and final-answer
verification-claim plus incomplete/blocked completion evidence, usage/cost
telemetry, cost-efficiency risk, invalid tool-action telemetry, task-contract checklist completion/no-edit/test-edit signals,
task-alignment risk signals, spec-compliance risk signals, reward-hack risk signals, long-horizon coverage risk signals, incomplete/inconclusive verifier markers,
environment setup/reconstruction signals for missing dependencies, toolchains,
or build artifacts, dependency manifest/lockfile setup-validation signals,
skill-view fit/timing signals, per-target edit localization signals, large edit-surface
signals, scratch/probe artifact signals, redundant tool-call signals,
redundant failing-verifier rerun signals, blind-repair signals, post-edit regression-cycle signals,
latest post-edit verifier signals, post-edit and final-state
diff-review signals, final-edit validation stability/lucky-pass signals, broad-validation signals,
CI-derived validation signals,
source-research recency signals,
process-defect scoring, AHE-style change-evaluation verdicts, submission bundle manifest readiness/hash metadata,
and trajectory-quality fields are copied to
`benchmarkResult.traceSummary` for harness-side scoring. `benchmarkResult.usage`
also aliases the native usage block for cost-aware leaderboards. Native verifier
trace previews preserve both head and tail output so final test summaries survive
noisy install/build logs. `benchmarkResult.experienceCard` includes bounded
task-alignment/spec-compliance/reward-hack/long-horizon risk blocks, including SWE-WebDevBench canary/frontend-backend/security validation signals, decision-observability predictions for edits and validation-reliability evidence
for final verifier stability, broad validation, and CI-derived validation, plus
context-utilization precision/miss evidence for retrieval-aware scoring and
run-efficiency action/usage/cost/time evidence for cost-aware scoring. Prior
experience hints also expose compact source-research coverage, including
hit/error counts, targeted/fresh coverage, recency windows, top URLs, and
Kaggle fallback status. When present, `benchmarkResult.traceSummary` also
includes the redacted ACC-style task/context/answer compilation from the native
Ventipus trace for retrieval, replay, or training-data curation.
It also includes `changeEvaluation` and `submissionBundleManifest` when present, so leaderboard
submission tooling can inspect artifact hashes and missing official score/session
fields without parsing the full summary.

Inside benchmark mode, the read-only `benchmark_context` preflight also surfaces
CI workflow run commands plus setup actions, env key names, service containers,
job containers, and images from GitHub Actions, GitLab CI, CircleCI, Azure
Pipelines, and Jenkins files. Env values are not printed. Agents can reconstruct
the relevant CI environment and then reproduce project-native test/build/lint
steps before finalizing.
It also separates reusable prior local benchmark experience from similar failed
or unsafe prior runs, so context reuse stays method-level and current verifier
evidence remains authoritative.

Useful env vars:

- `VENTIPUS_KBENCH_COMMAND`: command used to launch ventipus, default `ventipus`.
- `VENTIPUS_KBENCH_PERMISSION`: permission flag value, default `yolo`.
- `VENTIPUS_KBENCH_EXTRA_ARGS`: extra ventipus CLI flags.
- `VENTIPUS_KBENCH_ARTIFACT_DIR`: directory for redacted instruction/stdout/stderr and trace files.
- `VENTIPUS_BASH_TIMEOUT_MS`: default ventipus `bash` tool timeout; the adapter defaults to `300000` when unset.

Provider keys should be passed via normal ventipus env config or KBench's
`--api-key-env`, which the runner forwards as ventipus `--api-key-env`.
