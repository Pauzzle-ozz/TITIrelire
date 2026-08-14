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

- **Data connection layer** (`src/transactions`): a canonical `Transaction` model with
  validation/de-dup, `aggregateTurnover()` (transactions → CA), and
  `simulateFromTransactions()` / `compareFromTransactions()` chaining straight into the
  engine.
- **Universal CSV importer** with a robust parser (quoted fields, `,`/`;`/tab, FR/EN
  amounts, multiple date formats), column mapping (single amount or debit/credit) and
  presets (generic, Stripe, Qonto).
- **Stripe connector** as the reference live-API `TransactionSource` (cursor pagination,
  injectable HTTP, runs server-side/self-hosted).
- **Bridge connector** for bank / Open Banking (DSP2) aggregation: `next_uri` pagination,
  signed bank amounts, deleted-tombstone skipping, page-cap truncation guard, self-hosted.
- Additional CSV presets: PayPal, generic FR bank (débit/crédit), Shopify and SumUp exports.
- **Factur-X (CII XML) invoice import** (`parseFacturX` / `importFacturX`) — strategic given
  the French e-invoicing mandate — with defensive parsing (malformed-XML rejection, repeated
  elements, date format-102, strict amount, credit-note rejection).
- **Self-hosted connector runner** (`buildConnector` / `runConnector` / `cliMain`): fetch a
  connector's transactions outside the browser and emit canonical JSON (secrets from the env).
- **Salaried-individual profile** (`simulateParticulier` / `comparePER`): income tax with the
  10 % deduction (or frais réels) and a PER optimisation (tax saving + real net cost).
- **Single-shareholder company profile** (`impotSocietes` / `simulateSociete` /
  `compareDividendes`): SASU corporate tax (15 %/25 %) and dividend taxation, PFU vs barème.
- Shared 2026 income-tax scale (`impotBareme` / `impotMarginal`) reused across profiles.
- **Local UI now covers all three profiles** via a profile selector (micro-entrepreneur,
  salaried individual, SASU), each with its transparent breakdown and optimisation comparison.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): design principles, the local-first vs
  live-connectors stance, and the roadmap for both workstreams (fiscal coverage + data
  connection).

### Fixed
- Breakdown `detail` strings and `LineItem.rate` now use true ratios: publicodes returns
  rates in percent units, so explanations previously showed rates ×100 (e.g. "1230 %"). The
  computed amounts were always correct; only the explanations were wrong.
- The income-tax line amount now reads the single `impôt sur le revenu` rule (same source as
  the totals), and the allowance detail reflects the 305 € floor when it applies.
- Completed `escape()` (single quote), capitalized the recommendation title, clarified the
  CFP artisanal assumption inline, and corrected README/docs over-claims (library import,
  per-figure sourcing, VAT tolerance column).
- Data layer (adversarial review): CSV ids are now derived from content + occurrence
  (stable across re-imports, genuine duplicates preserved); delimiter detection is
  quote-aware; `parseDate` requires a 4-digit year and exactly three parts; date validation
  rejects impossible calendar days (e.g. 2026-02-31); `aggregateTurnover` matches currencies
  case-insensitively and treats a zero amount as income; the Stripe connector throws instead
  of silently truncating at the page cap, validates the fetch range, treats `includeTypes: []`
  as no filter, and bounds error bodies.
- Privacy/boundary hardening: raw provider payloads are opt-in (`keepRaw`, default off); the
  UI imports the engine directly so connectors can never enter the browser bundle (guarded by
  a test); low-level CSV parser helpers are no longer part of the public API.
- Connector hardening (DSP2 review): shared range validation (reject inverted `since`/`until`)
  and positive-integer page limits for both Stripe and Bridge; Bridge detects a stalled
  `next_uri`; CSV header matching is accent-insensitive; `parseAmount` normalizes non-breaking
  spaces.
