<div align="center">

# TI'TIrelire

**A small, honest tool for your money.** 🐷

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

---

## What is TI'TIrelire?

TI'TIrelire ("tirelire" is French for *piggy bank*) is an open-source tool to make personal
and business taxes **simple and transparent — from what you enter to the result**. Instead of
a black box, it shows the maths line by line, and tells you how to keep more of your money.

**Three profiles today.** Pick your situation and see exactly what you owe, every line
explained, plus **which option is best for you** and how many euros it saves:
- **Micro-entrepreneur** — URSSAF contributions + income tax; barème vs *versement libératoire*.
- **Salaried individual** — income tax (10 % / frais réels) + a **PER** optimisation.
- **Company (SASU)** — corporate tax (IS) + dividends; **PFU vs the progressive scale**.

It is **local-first**: every calculation runs in your browser. No account, no server, no data
leaves your device.

> ⚠️ **Not tax advice.** TI'TIrelire is a decision-aid built on public rules; always confirm
> with an accountant or the official services for your situation.

## Features

- 🔍 **Transparent** — a full, line-by-line breakdown of contributions and tax, with the rate
  and reasoning behind every euro.
- 💡 **Optimisation** — compares the *versement libératoire* against the progressive scale and
  recommends the cheaper one, in euros.
- 🧮 **Accurate & auditable** — 2026 parameters, checked against public sources and
  documented in [`docs/parameters-2026.md`](./docs/parameters-2026.md).
- 🔒 **Local-first** — runs entirely in the browser; nothing is sent anywhere.
- 👥 **Multiple profiles** — micro-entrepreneur, salaried individual (income tax + PER
  optimisation), and single-shareholder company (SASU: IS + dividends, PFU vs barème).
- 🧩 **publicodes for the micro rules** — the micro-entrepreneur module uses
  [publicodes](https://publi.codes) (the open, explainable rule language maintained by the
  French state / URSSAF), so its legal rules stay separate from the code. The other profiles
  are plain TypeScript for now — unifying them on publicodes is on the roadmap.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the local app (http://localhost:5173)
npm run build    # build the static app into dist/
```

The engine is also usable programmatically (TypeScript). A published npm package is on the
roadmap; for now, import it from the source within the repo (as the tests do):

```ts
import { compare, simulate } from './src/index.js'

const result = simulate({ activity: 'prestations_bnc', revenue: 40000 })
console.log(result.netIncome, result.breakdown)

const advice = compare({ activity: 'prestations_bnc', revenue: 40000 })
console.log(advice.recommended, advice.netGain, advice.explanation)
```

## Connecting your data (early)

To avoid retyping your turnover, TI'TIrelire can ingest your transactions and compute the
CA for you. It normalizes any source into one canonical `Transaction` model, then feeds the
engine:

```ts
import { importCsvWithPreset, compareFromTransactions } from './src/index.js'

const txs = importCsvWithPreset(csvText, 'stripe') // or 'qonto', 'generic', a custom mapping
const { summary, comparison } = compareFromTransactions(txs, { activity: 'prestations_bnc', year: 2026 })
console.log(summary.revenue, comparison.recommended)
```

- **File import** (CSV/exports) runs locally, no secrets — presets for generic, Stripe,
  Qonto, PayPal and FR bank exports, or pass a custom column mapping.
- **Live connectors** use API secrets, so they run **server-side / self-hosted**, never in the
  browser: `StripeConnector` (payments) and `BridgeConnector` (bank / Open Banking DSP2). See
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and the full roadmap (more connectors,
  Factur-X, and broader fiscal profiles).

## Development

This project follows a strict, test-first workflow. If you use an AI agent (e.g. Claude
Code), read [`CLAUDE.md`](./CLAUDE.md) — it defines the mandatory working rules: audit before
assuming, plan before coding, finish each step 100%, prove everything with unit tests, push
per completed segment, and summarize at the end.

```bash
npm test           # run the unit tests
npm run typecheck  # type-check the project
```

**Layout**

| Path | Role |
|------|------|
| `src/engine/rules.ts` | publicodes rule base (2026 fiscal parameters) |
| `src/engine/simulate.ts` | `simulate()` — transparent, explained result |
| `src/engine/compare.ts` | `compare()` — the optimisation recommendation |
| `src/ui/` | local-first web UI (view-model + DOM wiring) |
| `docs/parameters-2026.md` | sourced reference for every figure |

## Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and our
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) before opening an issue or a pull request.

## Security

Found a vulnerability? Please follow the responsible-disclosure process in
[`SECURITY.md`](./SECURITY.md).

## License

Licensed under the [Apache License 2.0](./LICENSE). Copyright 2026 TITI'relire.
