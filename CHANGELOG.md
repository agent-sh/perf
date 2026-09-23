# Changelog

## [Unreleased]

## [1.1.0] - 2026-09-24

### Changed

- The `/perf` phase handler moved out of the command prompt into `scripts/perf-phase.js`. The command was a 1,800-word JavaScript program the model had to execute by hand; as written it could not run (missing `path` import, a top-level `await`, and `@agentsys/lib` imports that only resolve when that package is installed). The script runs one phase per call with the same flags, state files and log format.
- Rewrote the command, agent, skill and hook-doc prompts for current models: goal, rules with their reasons, and output contracts instead of "MUST" lists repeated in every file. The rules are stated once in the command. Every prompt pointed at `docs/perf-requirements.md` as the canonical contract, but that file does not exist in this repo; those references are gone. Prompt size went from 4,682 to 3,344 words.
- Model pins: the orchestrator, theory gatherer, theory tester and analyzer inherit the session model instead of pinning opus. The code-paths agent stays on sonnet, and the logger moves to haiku.
- The orchestrator agent no longer lists `Task`, which a subagent cannot use. It runs the perf skills inline and returns `blocked` with the question when a phase needs the user.

### Fixed

- Checkpoint commits no longer risk committing the user's unrelated work. `lib/perf/checkpoint.js` falls back to `git add -A` when the perf state dir cannot be staged, for example when it is gitignored. The phase script now checkpoints only when every pending change is under `<stateDir>/perf/`, and otherwise skips with a message.
- The theory tester stops instead of stashing when the tree is not clean, since uncommitted changes are the user's work.
- A call without `--resume` no longer silently replaces an investigation in progress. The script refuses and points at `--resume` or `--id <new-id>`, because the model now chains phases and a missing flag would have wiped the collected results.
- The optimization phase measures the change. The tester gates it behind `PERF_EXPERIMENT=1`, and the phase runs with `PERF_ALLOW_DIRTY=1`. The runner compares `PERF_EXPERIMENT=0` against `=1` on one tree, so a change reverted before the phase ran would have been benchmarked against itself.

### Added

- `tests/perf-phase.test.js`: setup and baseline in a temporary git repo, the checkpoint-skip guard, and missing-input errors. `npm test` runs it.

## [1.0.1] - 2026-04-26

### Fixed

- command-parser error message "invalid null byte" corrected to "invalid whitespace after tokenization" (cosmetic; the logic was always correct).
- Surface `repoIntelContext` to investigator stdout in perf setup phase - was built but never printed, so the LLM never received it ([#12](https://github.com/agent-sh/perf/pull/12))
- Pre-fetch repo-intel painspots in perf setup phase for data-backed investigation starting points

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
