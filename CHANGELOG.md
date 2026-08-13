# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source project scaffold: license (Apache 2.0), README, contribution guide,
  code of conduct, security policy, and GitHub issue/PR templates.
- `CLAUDE.md` defining the mandatory test-first working rules for the project.
- TypeScript + Vitest toolchain (local-first, ESM).
- **Micro-entrepreneur tax simulator (2026)** built on publicodes: social contributions,
  ACRE relief, CFP, flat income-tax allowance, progressive scale with quotient familial,
  versement libératoire, and régime/VAT thresholds — behind a typed `simulate()` API that
  returns a line-by-line, explained breakdown.
- **Optimisation comparator** `compare()`: recommends *versement libératoire* vs progressive
  scale and quantifies the euro gain, with a plain-French explanation.
- **Local-first web UI** (Vite): a live form → transparent, unfolded result, running entirely
  in the browser.
- Sourced parameter reference in `docs/parameters-2026.md`.
- 38 unit tests covering the engine, comparator, view-model and UI wiring.
