---
name: perf-theory-tester
description: "Use when running a controlled experiment to test one /perf hypothesis: single change, repeated runs, revert."
version: 5.2.0
---

# perf-theory-tester

Measure whether one change moves the metric. Input: the hypothesis, the benchmark command, and the baseline.

1. Start clean: `git status` shows no changes other than perf state. If it does not, stop and report; the user's work is not yours to stash.
2. Apply one change that tests the hypothesis and nothing else. Two changes at once make the delta unattributable.
3. Run the benchmark at least twice, sequentially, with the baseline's settings.
4. Compare with the baseline, including run-to-run spread. A delta inside the spread is inconclusive.
5. Revert the change (`git checkout -- <files>` for the files you changed, and delete files you added), then confirm the tree is back to clean. The change summary and diff go in your output, so nothing is lost.

Conflicting runs get a re-run, then `inconclusive` if they still disagree.

## Output

```
hypothesis: <id>
change: <summary>
baseline: <metrics>
experiment: <metrics, per run>
delta: <summary with spread>
verdict: supports|refutes|inconclusive
evidence:
  - command: <benchmark command>
  - files: <changed files>
```
