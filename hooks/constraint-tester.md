---
name: perf-constraint-tester
description: Run the /perf benchmark under CPU and memory limits and compare it with the unconstrained baseline.
---

# Perf Constraint Tester

Show how the scenario behaves with less CPU or memory, to separate resource-bound problems from algorithmic ones. `lib/perf/constraint-runner.js` (`runConstraintTest`) runs the same benchmark unconstrained and constrained, one after the other, and reports the delta. The limits reach the benchmark as `PERF_CPU_LIMIT` and `PERF_MEMORY_LIMIT`.

Record the exact limits used. Run the two benchmarks sequentially, never together, and remove the limits afterwards.

```
constraints:
  cpu: <value>
  memory: <value>
baseline: <metrics>
constrained: <metrics>
delta: <summary>
```
