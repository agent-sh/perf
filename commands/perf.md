---
description: Structured performance investigation with baselines, profiling, and evidence-backed decisions
codex-description: 'Use when user asks to "run perf", "performance investigation", "benchmark regression", "profiling workflow", "baseline performance". Runs structured perf investigations with baselines, profiling, hypotheses, and decisions.'
argument-hint: "[--resume] [--phase setup|baseline|breaking-point|constraints|hypotheses|code-paths|profiling|optimization|decision|consolidation] [--id [id]] [--scenario [text]] [--command [cmd]] [--version [ver]] [--duration [seconds]] [--runs [n]] [--aggregate <median|mean|min|max>] [--quote [text]] [--hypotheses-file [path]] [--param-env [name]] [--param-min [n]] [--param-max [n]] [--cpu [limit]] [--memory [limit]] [--change [summary]] [--verdict <continue|stop>] [--rationale [text]]"
allowed-tools: Read, Write, Edit, Task, Bash(git:*), Bash(node:*), Bash(npm:*), Bash(pnpm:*), Bash(yarn:*), Bash(cargo:*), Bash(go:*), Bash(pytest:*), Bash(mvn:*), Bash(gradle:*)
---

# /perf

Find out why something is slow, or prove it is not, with measurements you can trust. Every claim in the result traces to a baseline, a profile, or an experiment recorded in the investigation log. An investigation that ends with "no change is worth making" is a valid result.

## Arguments

`$ARGUMENTS` holds the flags in the argument hint. The ones that shape a run:

- `--resume`: continue the investigation in `<stateDir>/perf/investigation.json`. `--phase <name>` with it jumps to that phase.
- `--scenario`, `--command`, `--version`: what is slow, the benchmark command, and the baseline label. Setup needs all three.
- `--duration <s>` (default 60), `--runs <n>`, `--aggregate median|mean|min|max`: how the benchmark runs. `--runs` switches to one-shot runs aggregated across `n` executions, for start-to-end benchmarks.
- `--param-env`, `--param-min`, `--param-max`: the breaking-point search range, passed to the benchmark through an env var (default `PERF_PARAM_VALUE`, 1 to 500).
- `--cpu`, `--memory`: constraint limits (default 1 CPU, 1GB).
- `--hypotheses-file`, `--change`, `--verdict`, `--rationale`, `--quote`: inputs for the later phases, and a user quote to record verbatim in the log.

The benchmark command prints its metrics as JSON between `PERF_METRICS_START` and `PERF_METRICS_END` lines, for example `{"latency_ms": 120}` or `{"scenarios": {"low": {...}, "high": {...}}}`.

## Running a phase

Each phase is deterministic, so a script runs it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/perf-phase.js" "<the /perf arguments>"
```

The first call creates the investigation. Every later call passes `--resume` (plus `--phase` only to jump): without it the script refuses to touch an investigation in progress, so it never starts over by accident. It runs the phase with the runners in `lib/perf/`, stores results in `<stateDir>/perf/` (`investigation.json`, `investigations/<id>.md`, `baselines/<version>.json`), advances to the next phase, and makes a checkpoint commit when the only pending changes are perf state. It prints the phase results as JSON and the next phase. A failure prints `[ERROR]` with the missing flag or the runner's error.

Your part is the judgment between phases: clarify the scenario, pick the next phase's inputs, interpret results, and talk to the user. Keep going from phase to phase while you have what the next one needs. Stop and ask when it needs the user: a missing scenario or command, a scope expansion, or the continue/stop decision.

## Phases

1. **setup**: pin down the scenario with the user before measuring anything. "Slow" can mean latency, throughput, memory, or startup; settle which, the success criterion, and the benchmark command. If a repo-intel map exists, the script prints the top pain spots as starting points.
2. **baseline**: the reference every later number is compared against.
3. **breaking-point**: binary search over the parameter range for where performance falls off.
4. **constraints**: the same benchmark under CPU and memory limits, compared to baseline.
5. **hypotheses**: spawn `perf:perf-theory-gatherer` with the scenario, baseline, breaking point and constraint deltas. Write its hypotheses to `<stateDir>/perf/hypotheses-<id>.json` and run the phase with `--hypotheses-file` pointing at it.
6. **code-paths**: the script maps scenario keywords to files through the repo map. For more depth, spawn `perf:perf-code-paths`.
7. **profiling**: the script picks the runtime's profiler. For a different tool or a closer look at hotspots, use the `perf-profiler` skill.
8. **optimization**: spawn `perf:perf-theory-tester` to apply one change for the strongest hypothesis, gated so it only takes effect when `PERF_EXPERIMENT=1`. Then run the phase with `PERF_ALLOW_DIRTY=1` and `--change "<summary>"`: the runner benchmarks `PERF_EXPERIMENT=0` against `PERF_EXPERIMENT=1` on the same tree, so the gate is what makes the two arms differ. The tester reverts the change afterwards. A change that cannot be gated (a dependency bump, a build flag) is measured by the tester itself, and its result goes in the log instead. Repeat per hypothesis worth testing.
9. **decision**: spawn `perf:perf-analyzer` to synthesize the evidence, present its recommendation, and ask the user to continue or stop. Run the phase with `--verdict` and `--rationale`.
10. **consolidation**: writes the final baseline for the version and marks the investigation complete.

Without a `Task` tool, follow each agent's skill inline (`perf-theory-gatherer`, `perf-code-paths`, `perf-theory-tester`, `perf-analyzer`). Without AskUserQuestion, ask in plain text.

## Rules

- Run benchmarks one at a time, never in parallel. Concurrent runs compete for CPU, memory and cache, and the numbers stop meaning anything.
- Keep the default durations: 60s per run, 30s inside the breaking-point search. Short runs are noise-dominated. Use `--runs` for start-to-end benchmarks, and go shorter only for micro-benchmarks, saying so in the log.
- One change per experiment, reverted before the next. Two changes at once make the delta unattributable.
- Re-run a result that looks anomalous before building on it, and report variance, not only the aggregate.
- Read recent git history before forming hypotheses. A recent change is the most likely cause of a regression.
- Stay on the scenario the user described. Widening scope (more endpoints, more services, a rewrite) needs their approval.
- Use the smallest workload that shows the problem, and ask before runs that will saturate the machine for a long time. It is usually the user's working machine.

## Report

After each phase, and at the end:

```
phase: <phase>
status: in_progress|blocked|complete
baseline: <version or n/a>
findings:
  - <measured fact with its source: baseline, profile, experiment id>
next: <next phase, or the input needed from the user>
```

The final report adds the decision with its rationale and the path to the investigation log.
