# perf

> Rigorous performance investigation workflow with baselines, profiling, and evidence-backed decisions

## Overview

An agentsys plugin: Markdown prompts in `commands/`, `agents/`, `skills/` and `hooks/`, `scripts/perf-phase.js` (runs one /perf phase per call), and the benchmark, profiling and state runners in `lib/perf/`. Plain CommonJS, no build step, tests use `node:test`. `lib/` is synced from [agent-core](https://github.com/agent-sh/agent-core), so change shared code there, including `lib/perf/`: a local edit is overwritten by the next sync PR.

## Conventions

- Output is plain text with the status markers `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`, and no emojis or ASCII art. People read it in terminals and other plugins parse it; spend tokens on content, not decoration.
- In prose, write a spaced single dash (` - `), not ` -- ` or an em dash.
- Put summaries, plans and audit notes in the PR or issue, not in committed files: committed notes go stale.
- Changes reach main through a PR. A feature or fix is done when tests that cover it pass.
- Keep git hooks on. `scripts/setup-hooks.sh` installs a pre-push hook that runs `npm test`.
- When a script or tool fails, report the failure before working around it, so the tool gets fixed.
- When goals conflict, rank them: plugin users' experience, automation that needs no babysitting, token cost, output quality, simplicity.

## Agents

- perf-analyzer
- perf-code-paths
- perf-investigation-logger
- perf-orchestrator
- perf-theory-gatherer
- perf-theory-tester

## Skills

- perf-analyzer
- perf-baseline-manager
- perf-benchmarker
- perf-code-paths
- perf-investigation-logger
- perf-profiler
- perf-theory-gatherer
- perf-theory-tester

## Commands

- perf

## Dev commands

```bash
npm test                        # loads lib/, then the node:test suite
npm run validate                # loads lib/ only
agnix --config .agnix.toml .    # agent config lint, also run in CI
```

## References

- Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem
- https://agentskills.io
