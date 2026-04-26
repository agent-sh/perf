# Changelog

## [Unreleased]

## [1.0.1] - 2026-04-26

### Fixed

- command-parser error message "invalid null byte" corrected to "invalid whitespace after tokenization" (cosmetic; the logic was always correct).
- Surface `repoIntelContext` to investigator stdout in perf setup phase - was built but never printed, so the LLM never received it ([#12](https://github.com/agent-sh/perf/pull/12))
- Pre-fetch repo-intel painspots in perf setup phase for data-backed investigation starting points

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
