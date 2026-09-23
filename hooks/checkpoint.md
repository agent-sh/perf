---
name: perf-checkpoint
description: Commit /perf investigation state after each phase, and only that state.
---

# Perf Checkpoint

After each phase, commit the investigation state so an interrupted investigation can resume and every result has a commit to point at. `scripts/perf-phase.js` does this automatically through `lib/perf/checkpoint.js`.

Commit message: `perf: phase <phase-name> [<id>] baseline=<version> delta=<summary>`

- One commit per phase. Batching phases loses the point at which each result was recorded.
- Only perf state goes in the commit (`<stateDir>/perf/`). If anything else in the tree has changed, skip the checkpoint and say so: the other changes are the user's work, or an experiment that should have been reverted.
- No checkpoint while a benchmark is still running.
