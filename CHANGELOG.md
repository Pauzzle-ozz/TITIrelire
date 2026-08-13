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
- 50 unit tests covering the engine, comparator, view-model and UI wiring.

### Fixed
- Breakdown `detail` strings and `LineItem.rate` now use true ratios: publicodes returns
  rates in percent units, so explanations previously showed rates ×100 (e.g. "1230 %"). The
  computed amounts were always correct; only the explanations were wrong.
- The income-tax line amount now reads the single `impôt sur le revenu` rule (same source as
  the totals), and the allowance detail reflects the 305 € floor when it applies.
- Completed `escape()` (single quote), capitalized the recommendation title, clarified the
  CFP artisanal assumption inline, and corrected README/docs over-claims (library import,
  per-figure sourcing, VAT tolerance column).
