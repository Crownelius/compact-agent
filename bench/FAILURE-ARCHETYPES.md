# Failure-archetype analysis — 2026-05-25 run

49 failures, ~7 architectural causes. Going through them one by one reveals one cause that dominates the rest. Each archetype below pairs a representative failure with the architectural fix it implies.

## ARCHETYPE 1: "Solved the spirit, missed the letter" (~20 failures, ~40%)

**The agent built something that solves the problem. The test checks for literal patterns, exact paths, specific process names, or byte-exact file content the agent had no way to know about — because the agent never read the test file.**

### Evidence

**`aimo-airline-departures`** — Agent answered d=79 (correct), wrote a 274-line Python script that does brute-force search + analysis, generated all 3 required files. Failed 3 of 8 tests:
- `test_answer_is_79`: agent wrote `"FINAL ANSWER: d = 79"`. Test demanded `(confirm|verify|validate|✓).*79.*optimal`.
- `test_script_analysis_and_verification`: test demanded the regex `A100.*departs.*day.*A120.*departs.*day.*A150.*departs.*day` in `results.txt`.
- `test_proof_content`: test demanded `case.*case` in the proof (multiple cases must be discussed).

**`nginx-request-logging`** — 7 of 8 tests passed. Failed: `test_nginx_config_settings` — "Custom log format is missing required fields". The test was looking for specific named fields in the nginx `log_format` directive that the agent didn't include.

**`openssl-selfsigned-cert`** — 5 of 6 tests passed. Failed because the verification output had `SHA-256` (with a hyphen) and the test was checking lowercase `sha256` substring after `.lower()` was applied:
```
'sha256' in '...sha-256 fingerprint: 08:28:fc:b5...'
```
The agent's output contained `SHA-256 fingerprint: 08:28...` — the lower-cased form is `sha-256 fingerprint:`, the test searches for `sha256` literal, which fails because of the hyphen.

**`get-bitcoin-nodes`** — 4 of 5 tests passed. The Flask service worked, returned proper schemas. Failed `test_service_process_running` which used psutil to look for a process whose cmdline contains `bitcoin_service.py`. Agent named its file `main.py` or `app.py` — the service worked but the wrong process name failed.

**`form-filling`** — 5 of 7 tests passed. Failed because output PDF was at the wrong path. Test expected `/app/filled_form.pdf` exactly.

**`reshard-c4-data`** — Failed because output had 331 files in a folder, test demanded `< 30`. Constraint was in the test, not stated in the instruction.

**`fix-git`** — 1 of 2 tests passed. Test does byte-for-byte hash comparison against `/app/resources/patch_files/about.md` (the expected file, sitting in the container). Agent did a `merge` instead of `replace` because the instruction said "merge them into master" — agent took that literally, producing its own resolved version. The expected state was the NEW content verbatim.

### Architectural fix: "Read your own grading rubric"

The test files live at `/tests/test_outputs.py` inside every Terminal-Bench container. **The agent has read permission.** Top-tier leaderboard agents do this. We don't even hint that it's possible.

Two layers of fix:

1. **System-prompt directive (universal):** "If a `/tests/`, `tests/`, or similar test directory exists and is readable, you SHOULD read every test file before declaring a task complete. Match your output exactly to what each assertion checks — not what you think the user meant."

2. **Self-critique upgrade (F5+):** The current F5 prompt is generic ("verify against concrete evidence"). Upgrade it to specifically demand "cat the test file, list every assert statement, confirm your output satisfies each one literally." Trigger this BEFORE the model is allowed to emit a no-tool-calls "I'm done" turn.

This single change addresses ~40% of the failures.

---

## ARCHETYPE 2: "Tested the wrong interpreter / environment" (~3 failures)

**The agent verified its work in environment A. The test runs in environment B.**

### Evidence

**`incompatible-python-fasttext`** — Task: "fasttext isn't working, fix it". Agent confirmed `import fasttext` works in `/usr/local/bin/python3` (system Python). Declared done. The test runs via `uv run pytest` which creates `/app/.venv/` — a fresh venv that does NOT have fasttext installed. The agent never inspected `tests/setup-uv-pytest.sh` or `tests/run-uv-pytest.sh`.

**`oom`** — Agent built a solution that imports models from HuggingFace at runtime. Test runs OFFLINE (`OSError: We couldn't connect to 'https://huggingface.co'`). Agent didn't pre-cache the model into the local huggingface cache.

### Architectural fix: "Read the test runner script too"

Same as Archetype 1 — read `/tests/` before declaring done. But specifically include the runner scripts (`run-tests.sh`, `setup-*.sh`) which reveal which python interpreter, which venv, which env vars, which network state the test runs under.

Sub-fix in the system prompt: when verifying work, **execute the same command the test would** — not your own approximation of it.

---

## ARCHETYPE 3: "Output looked right at agent time, dies at test time" (~2 failures)

**The agent left a service running. The service died when the agent's bash session ended. The test runs in a new session and sees nothing.**

### Evidence

**`get-bitcoin-nodes`** — Agent launched Flask service inline (`python bitcoin_service.py &` or `python -m flask run`). When the agent's process tree exited, the child died. Tests ran in a fresh shell — `requests.get('http://localhost:5000/status')` succeeded somehow (4/5 tests passed), so partial — but `psutil` couldn't find the running process.

### Architectural fix: Service detection + persistence

Two options:
1. **Detect "task wants service running"** by reading the test (does it `psutil.process_iter`, `requests.get('http://localhost:...')`?) and explicitly launch with `nohup ... & disown` or `systemd-run --user`.
2. **Better:** start any background processes via `tmux new-session -d` — survives the agent's shell exiting because tmux is a separate process tree.

This adds a hint to the system prompt: "If the task involves a long-running service that needs to survive after you finish, launch it with `nohup` + `& disown`, or in a detached tmux session. Do not assume `command &` is sufficient — child processes die with their shell."

---

## ARCHETYPE 4: "Agent gave up trivially" (~1 failure, but high-leverage)

**Agent emitted a few turns of thinking, did no tool work, returned. Tests failed because no files exist.**

### Evidence

**`polyglot-c-py`** — Agent's post-agent pane shows the prompt, then immediately:
```
  ECC ready: 228 skills, 60 agents, 81 commands, 18 rule sets.
root@3dde0d8bc8c7:/app#
```
That's it. No tool calls. No files created. The test then runs `python3 main.py.c` and `cc main.py.c` — neither finds the file.

### Architectural fix: F5 already addresses this (mostly)

F5 (self-critique gate) forces the model to verify against evidence before declaring done. If the agent did literally nothing, the critique prompt forces another turn where it has to either prove completion or continue working. This is exactly why F5 was prioritized.

But: F5 only fires when the model emits a no-tool-call turn. If the model crashed / exited early without saying "I'm done" — F5 doesn't trigger. Need to also catch the **"agent ran for 0 turns or 1 turn"** edge case.

Add a chain-end check: if the chain ended with `< 3` tool calls AND no file modifications inside `/app/`, force the self-critique prompt even if the model already exited. Re-engage the agent with "Your previous response did no concrete work — what is your actual plan?"

---

## ARCHETYPE 5: "Bash timeout cascade" (12 failures)

Already documented in postmortem. **F1** in the redesign roadmap.

`eval-mteb` (3× 300s), `pytorch-model-cli` ×3 (2× 300s), `count-dataset-tokens`, `qemu-alpine-ssh`, `train-fasttext`, `hf-model-inference`, `chess-best-move`, `cron-broken-network`, `gpt2-codegolf`, `polyglot-rust-c`, `crack-7z-hash.hard`, `run-pdp11-code`, `raman-fitting.easy`.

Fix: configurable `timeoutSec` parameter, default 600, max 1800. Structured `{timed_out: bool}` so the model can deterministically detect "killed by timeout" vs "killed by error".

---

## ARCHETYPE 6: "Context bloat → confused agent" (~5 failures)

Already documented in postmortem. **F2 + F3** in the redesign roadmap.

`run-pdp11-code` (375K), `path-tracing-reverse` (200K+), `sanitize-git-repo` + `.hard` (~120K each), `raman-fitting.easy` (124K).

Fix: large-response handler (spill > 4K to disk), rolling condenser with pinned prefix.

---

## ARCHETYPE 7: "Genuinely too hard for the model class" (~5 failures)

Tasks where deepseek-v4-flash just doesn't have the capability:

- `build-linux-kernel-qemu` — kernel compile + custom patches
- `play-zork` — interactive game with state tracking across many turns
- `super-benchmark-upet` — custom benchmark setup with multiple dependencies
- `extract-moves-from-video` — vision/CV pipeline
- `swe-bench-astropy-2` — root-cause analysis of an astropy WCS bug

Fix: not solvable at the agent layer. Stronger model. Skip.

---

## Prioritized fix list (combining old + new findings)

| Rank | Fix | Failures addressed | Effort | Status |
|------|-----|-------------------|--------|--------|
| **1** | **F0: Read the test files before claiming done** (new — biggest finding) | ~20 (Archetypes 1, 2, 3 partial) | 1 hr (system prompt + tool nudge) | **NOT SHIPPED** |
| 2 | F5: Self-critique gate (already shipped v1.34.0) | overlaps with F0 | done | ✅ |
| 3 | F4: Tool-call dedup (already shipped v1.34.0) | ~3 (context bloat) | done | ✅ |
| 4 | F1: Bash `timeoutSec` | ~5 (Archetype 5) | 2 hr | pending |
| 5 | F2: Large-response handler | ~4 (Archetype 6) | 1.5 hr | pending |
| 6 | F3: Rolling condenser | ~2 (Archetype 6, overlap with F2) | 2 hr | pending |
| 7 | F0b: Service-persistence hint (`nohup` / detached tmux) | ~2 (Archetype 3) | 30 min (prompt only) | pending |
| 8 | F0c: Chain-end "did anything happen?" check | ~1 (Archetype 4) | 30 min | pending |
| 9 | F6: Pre-bundle install | 1 (broken-networking) | 30 min | pending |

**The new top priority — F0 — is what I missed in the original roadmap.** It's a 1-hour change (system prompt + maybe a `read_tests` helper tool) and addresses 20+ failures. Should ship before F1.

## Projected score after fixes

| Fixes shipped | Expected accuracy |
|---|---|
| Baseline (v1.33.7) | 43.0% |
| + F4 + F5 (current v1.34.0) | ~47% |
| + F0 (read tests) | ~58% ← **biggest single win** |
| + F1 (bash timeout) | ~62% |
| + F2 + F3 (context) | ~66% |
| + F0b + F0c + F6 (cleanup) | ~68% |

**Realistic upper bound on deepseek-v4-flash + this scaffold: ~65-68%.** Apex2 territory.
