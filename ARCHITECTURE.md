# Architecture & roadmap

This document describes how TI'TIrelire is built and where it is going. It is the map that
keeps the two parallel workstreams — **broader fiscal coverage** and **data connection** —
from drifting apart.

## Principles

1. **Local-first.** The user's financial data stays on their device by default. The web app
   runs the whole simulation in the browser; nothing is sent anywhere.
2. **Transparent.** Every euro is traceable to a rule. Fiscal parameters live declaratively
   in [publicodes](https://publi.codes) ([`src/engine/rules.ts`](./src/engine/rules.ts)),
   separate from the application code, so a finance-act change is a data change.
3. **Rules as data, sources as ports.** The fiscal engine only ever sees a turnover figure;
   the data layer only ever produces a canonical `Transaction[]`. Neither knows about the
   other's internals, so we can add tax profiles and data connectors independently.
4. **Honest about limits.** Out-of-scope items are surfaced to the user, not hidden.

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  UI (src/ui)  — local-first web app, DOM + pure view-model │
└───────────────┬───────────────────────────┬──────────────┘
                │                           │
      ┌─────────▼─────────┐       ┌─────────▼──────────────┐
      │ Fiscal engine     │       │ Data connection        │
      │ (src/engine)      │       │ (src/transactions)     │
      │ • rules (publicodes)      │ • canonical model      │
      │ • simulate()      │◄──────┤ • aggregate → turnover │
      │ • compare()       │  CA   │ • importers (CSV…)     │
      └───────────────────┘       │ • connectors (Stripe…) │
                                  └────────────────────────┘
```

- **Fiscal engine** — `simulate()` produces a line-by-line result; `compare()` recommends
  the cheaper income-tax option. Input is a turnover figure and a few options.
- **Data connection** — a canonical [`Transaction`](./src/transactions/types.ts) model that
  every source normalizes into; `aggregateTurnover()` turns transactions into the CA that
  feeds the engine (`simulateFromTransactions` / `compareFromTransactions`).
  - **Importers** parse files/exports (CSV done — universal, local-first).
  - **Connectors** (`TransactionSource`) pull from live APIs (Stripe done, as the reference).

## The local-first vs live-connectors tension

Live connectors need API secrets (Stripe secret keys, bank/DSP2 tokens). **Secrets must
never reach the browser.** So the design is:

- The **browser app stays local**: file import + simulation, no secrets, no backend.
- **Live connectors run outside the browser** — a Node CLI or a small **self-hosted
  connector service** the user runs themselves. It fetches transactions, writes a canonical
  `Transaction[]` (JSON), which the local app consumes.
- A hosted connector backend (managed OAuth) is possible later, but stays **optional** and
  is not required to use the tool. This preserves the trust promise.

This is why `StripeConnector` takes an injectable HTTP client and is documented as
server-side: the pattern generalizes to every future live connector.

## Roadmap

### Track A — Fiscal coverage (from `particulier` to `TPE < 10`)

Target audience order (large/medium companies are explicitly out of scope for now):

1. **Indépendants / libéraux** — ✅ micro-entrepreneur simulator (done). Next: régime réel
   (BNC/BIC réel), TVA (franchise → réel simplifié/normal), CFE.
2. **Particulier** — income tax on salaries + household optimisation (PER, déficit foncier,
   dons, garde d'enfants…). Reuses the barème already modelled.
3. **Société unipersonnelle (EURL/SASU)** — dirigeant remuneration, IS vs IR, dividends +
   flat tax (PFU), the salary/dividend trade-off.
4. **TPE < 10 salariés** — light payroll cost (super-gross → net), IS, VAT.
5. **Light bookkeeping** — recettes/dépenses ledger (needed for réel régimes), fed directly
   by the data-connection layer.

Each profile is a new set of publicodes rules + a typed `simulate*`/`compare*` entry point,
following the micro-entrepreneur module as the template. Parameters are dated and sourced
(see [`docs/parameters-2026.md`](./docs/parameters-2026.md)).

### Track B — Data connection

1. **Canonical model + aggregation** — ✅ done.
2. **CSV import + presets** — ✅ done (generic, Stripe, Qonto). Add more presets (bank
   exports, PayPal, Shopify, common CRMs) — each is just a mapping.
3. **Reference live connector (Stripe)** — ✅ done. Generalize the `TransactionSource` port.
4. **Bank / Open Banking (DSP2)** via an aggregator (Powens/Bridge…) — self-hosted connector.
5. **More payment/CRM connectors** — PayPal, SumUp, Shopify, Dolibarr, HubSpot…
6. **Factur-X import** — e-invoicing is mandatory in France (reception 2026-09, emission for
   VSE/SME 2027-09); ingesting Factur-X is a strategic, well-timed source.
7. **Optional self-hosted connector service** — manages OAuth for live sync, kept optional.

## Testing & workflow

Test-first (Vitest), each parameter/edge case pinned by a unit test. See
[`CLAUDE.md`](./CLAUDE.md) for the mandatory working rules.
