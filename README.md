# perf

Structured performance investigation with baselines, profiling, and evidence-backed decisions - run by AI agents inside your editor.

## Why

Performance work without structure leads to random micro-optimizations, unmeasured changes, and wasted time. `/perf` enforces a rigorous 10-phase methodology - derived from recorded real investigation sessions - that ensures every optimization is baselined, isolated, measured, and documented.

Use cases:

- Investigating a reported performance regression
- Establishing baselines before and after a refactor
- Finding breaking points under load
- Profiling CPU and memory hotspots with language-native tools
- Making evidence-backed continue/stop decisions on optimization efforts

## Installation

```bash
agentsys install perf
```

Requires [agentsys](https://github.com/agent-sh/agentsys) to be set up in your project.

## Quick Start

```
/perf --phase setup --scenario "API response time regression" --command "npm run bench" --version v1.2.0
```

This initializes an investigation, records the scenario, and prepares for baselining. The orchestrator walks you through each phase sequentially, checkpointing progress after every step.

To resume an in-progress investigation:

```
/perf --resume
```

## How It Works

Every investigation follows 10 phases in order. The orchestrator enforces strict rules: sequential benchmarks only, 60-second minimum run durations, one change per experiment, and checkpoint commits after each phase.

1. **Setup** - Confirm the scenario, success criteria, and benchmark command. The benchmark must emit metrics between `PERF_METRICS_START` / `PERF_METRICS_END` markers.

2. **Baseline** - Run the benchmark for 60+ seconds with a 10-second warmup. Results are stored as `baselines/<version>.json`. This is the reference point for all comparisons.

3. **Breaking point** - Binary search across a parameterized range to find the threshold where performance degrades. Uses 30-second runs (the only exception to the 60-second rule).

4. **Constraints** - Run the benchmark under CPU and memory limits (default: 1 CPU, 1GB RAM). Compare against the unconstrained baseline to identify resource sensitivity.

5. **Hypotheses** - Generate up to 5 hypotheses about the root cause, each backed by evidence from git history and code analysis. No guessing - every hypothesis needs a file path or commit reference.

6. **Code paths** - Use repo-intel to identify entry points, hot files, and call chains relevant to the scenario. Narrows the search space before profiling.

7. **Profiling** - Run language-specific profilers: `--cpu-prof` for Node.js, JFR for Java, cProfile for Python, pprof for Go. Capture file:line hotspots and flame graphs.

8. **Optimization** - Apply one change at a time. Validate with 2+ benchmark runs. Revert between experiments to keep the baseline clean.

9. **Decision** - Based on measured improvement, decide whether to continue optimizing or stop. The verdict and rationale are recorded in the investigation log.

10. **Consolidation** - Write the final baseline, close the evidence log, and mark the investigation complete.

## Usage

```bash
/perf --phase setup --scenario "startup time" --command "node bench.js" --version v2.0.0
/perf --resume                                          # continue where you left off
/perf --resume --phase profiling                        # jump to a specific phase
/perf --resume --phase baseline --runs 5 --aggregate median
/perf --resume --phase optimization --change "replaced O(n^2) loop with hash lookup"
/perf --resume --phase decision --verdict continue --rationale "20% improvement"
```

### Key Flags

| Flag | Description |
|------|-------------|
| `--resume` | Continue the active investigation |
| `--phase <name>` | Target a specific phase |
| `--command <cmd>` | Benchmark command (must emit PERF_METRICS markers) |
| `--version <ver>` | Baseline version label |
| `--duration <sec>` | Override benchmark duration (default 60s) |
| `--runs <n>` | Number of runs for multi-run benchmarks |
| `--aggregate <method>` | median, mean, min, or max (default median) |
| `--change <summary>` | Description of the optimization being tested |
| `--verdict <v>` | continue or stop |

### Investigation Artifacts

State is persisted under `{state-dir}/perf/`: `investigation.json` (active state), `investigations/<id>.md` (evidence log), and `baselines/<version>.json` (metrics per version).

## Architecture

| Component | Type | Model | Role |
|-----------|------|-------|------|
| `perf-orchestrator` | agent | opus | Coordinates all phases, enforces rules |
| `perf-theory-gatherer` | agent | sonnet | Generates hypotheses from git history and code |
| `perf-theory-tester` | agent | sonnet | Runs controlled experiments for hypotheses |
| `perf-analyzer` | agent | sonnet | Synthesizes findings into recommendations |
| `perf-code-paths` | agent | sonnet | Identifies hot files and entry points |
| `perf-investigation-logger` | agent | sonnet | Writes structured evidence log entries |
| `perf-baseline-manager` | skill | - | Baseline storage, one JSON per version |
| `perf-benchmarker` | skill | - | Sequential benchmark execution |
| `perf-profiler` | skill | - | Language-specific profiling (CPU, memory, flame graphs) |
| `perf-analyzer` | skill | - | Synthesis patterns and recommendation templates |
| `perf-code-paths` | skill | - | Entry-point and hot-file identification patterns |
| `perf-investigation-logger` | skill | - | Structured evidence log formatting |
| `perf-theory-gatherer` | skill | - | Hypothesis generation backed by git/code evidence |
| `perf-theory-tester` | skill | - | Controlled experiment execution patterns |

## Requirements

- [agentsys](https://github.com/agent-sh/agentsys) runtime
- A benchmark command that emits `PERF_METRICS_START` / `PERF_METRICS_END` markers
- Language-specific profiler tools installed for the profiling phase (e.g., Node.js `--cpu-prof`, Java JFR, Python cProfile)

## Related Plugins

- [repo-intel](https://github.com/agent-sh/repo-intel) - Unified static analysis: AST symbols, git history, and doc-code sync, used during the code-paths phase
- [enhance](https://github.com/agent-sh/enhance) - Code analysis that can complement perf findings

## License

MIT
