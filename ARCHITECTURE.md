# Architecture & roadmap

This document describes how TITI'relire is built and where it is going. It is the map that
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
- **Personal spaces (vault)** — an optional, encrypted local store (`src/vault`) so the user
  keeps their data across sessions without re-typing. A **space** is a named, password-protected
  vault; **several can coexist** (perso, activité…), each an independent AES-256-GCM blob under
  its own key, listed by a non-secret `SpaceRegistry` (id + name). The state (saved form inputs
  per fiscal profile + imported transactions + learned categories) is serialized and encrypted,
  the key derived from that space's **master password** (PBKDF2-SHA256). Nothing secret is
  stored and nothing leaves the device. A small `VaultStorage` port (in-memory / `localStorage`
  today, IndexedDB or a Tauri/OS-keychain store tomorrow) holds each blob; `Vault.open/save` +
  `migrate()` (schema-versioned) tie it together. The UI panel is **opt-in**: no `#vault`
  container → the simulator runs stateless and secret-free.
- **Accounting & projection** — `src/accounting/ledger.ts` turns pro-classified transactions
  into a compte de résultat (produits/charges/résultat); `src/engine/reel.ts` simulates the
  régime réel (BIC/BNC) and compares micro-vs-réel money-in-pocket (TNS contributions are a
  flagged estimate); `src/engine/tva.ts` derives the VAT régime (exact) with a flagged amount
  estimate; `src/advice/projection.ts` projects the optimisation gains over 1…X years. The
  income-tax barème now models the décote and the quotient-familial plafonnement (couple flag).
  Honest by construction: estimated parts are labelled, nothing is invented.
- **Classification (pro vs perso)** — `src/classify` tags each transaction so the engine only
  counts professional income. A first-match cascade (learned corrections → deterministic FR
  rules → heuristics → `unknown`) yields an explainable verdict (category + confidence +
  source + French reason); `aggregateByCategory`/`proRevenue` turn tagged transactions into
  the correct CA. It reads the canonical `Transaction` and stays independent of the engine.
- **App shell** — a multi-page UI: a backend-free hash router (`src/ui/router.ts`) shows one
  `[data-page]` at a time (accueil/espace/situation/transactions/résultats) with a sidebar nav
  and a home dashboard (`dashboard-render.ts`). It is **gated**: until a space is unlocked the
  router forces the connection screen and hides the other nav (`.app.locked`); unlocking a
  space opens the app, locking/switching re-gates it. **No invented data** — the form ships
  empty and the app computes nothing (honest empty state) until the user enters their real
  headline figure. Progressive enhancement: without JS the pages stack; the router (opt-in on
  `#app-shell`) enhances them into an SPA. Every panel id is preserved.
- **UI** — a local-first web app (Vite). A pure view-model + `render.ts` turn engine results
  into the transparent, line-by-line view; the DOM wiring lives in `main.ts`. The **pixel-art
  rabbit** (`src/ui/sprite`) — pixelated from the owner's own photo — is the logo, favicon and
  loading animation (a CSS hop, disabled under reduced motion), drawn by a pure SVG renderer. The
  browser imports the engine directly, so connectors (and their secrets) can never ship to the
  client — enforced by a boundary test that scans every `src/ui` module.

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

1. **Indépendants / libéraux** — ✅ micro-entrepreneur simulator. Next: régime réel
   (BNC/BIC réel), TVA (franchise → réel simplifié/normal), CFE.
2. **Particulier** — ✅ salary income tax (10 % / frais réels) + **PER optimisation**
   (`simulateParticulier` / `comparePER`). Next: déficit foncier, dons, garde d'enfants.
3. **Société unipersonnelle** — ✅ SASU corporate tax (IS 15/25 %) + dividend taxation,
   **PFU vs barème** (`simulateSociete` / `compareDividendes`). Next: EURL gérant-majoritaire
   (dividends > 10 % of capital → TNS), salaire-vs-dividende arbitrage (needs a payroll model).
4. **TPE < 10 salariés** — light payroll cost (super-gross → net), IS, VAT.
5. **Light bookkeeping** — recettes/dépenses ledger (needed for réel régimes), fed directly
   by the data-connection layer.

Each profile is a typed `simulate*`/`compare*` entry point over the shared 2026 barème
(`src/engine/bareme.ts`). The micro module is expressed in publicodes; the newer profiles are
plain TypeScript — unifying both on publicodes is a roadmap item. Parameters are dated and
sourced (see [`docs/parameters-2026.md`](./docs/parameters-2026.md)).

### Track B — Data connection

1. **Canonical model + aggregation** — ✅ done.
2. **CSV import + presets** — ✅ done (generic, Stripe, Qonto, PayPal, bank FR, Shopify,
   SumUp). Add more presets (common CRMs) — each is just a mapping.
3. **Reference live connector (Stripe)** — ✅ done. `TransactionSource` port generalized.
4. **Bank / Open Banking (DSP2)** via an aggregator — ✅ reference connector done
   (`BridgeConnector`, self-hosted). Add Powens and others behind the same port.
5. **Self-hosted connector runner (CLI)** — ✅ done (`buildConnector` / `runConnector` /
   `cliMain`): fetch a connector's transactions outside the browser → canonical JSON.
6. **Factur-X import** — ✅ done (`parseFacturX` / `importFacturX`, CII XML). Strategic given
   the mandate (reception 2026-09, emission VSE/SME 2027-09). Next: extract the XML from the
   PDF/A-3 container; emission.
7. **More payment/CRM connectors** — Powens, Dolibarr, HubSpot… behind the same port.
8. **Optional hosted connector service** — managed OAuth for live sync, kept optional.

### Track C — Personal space & intelligence

The move from a stateless simulator to a fiscal copilot, on top of Tracks A & B:

1. **Encrypted local vault** — ✅ done (`src/vault`): master-password AES-GCM store, opt-in
   UI panel with prefill + autosave. The foundation the rest of this track writes into.
2. **Data entry & review UX** — ✅ a transactions panel (`src/ui/tx-*`) that imports a CSV
   statement (preset-based) **or the canonical JSON produced by the self-hosted connector
   runner** (Stripe, DSP2 bank), shows each movement classified with its reason, lets the user
   correct a category in one click (learned + persisted), and feeds the professional-only CA
   into the engine. **Real one-click bank OAuth belongs to the desktop app**: only a local
   process (the Tauri Rust core) can run the loopback OAuth flow and hold tokens in the OS
   keychain without shipping a secret to the browser — see the desktop-app roadmap item.
3. **Income/expense classification (pro vs perso)** — ✅ engine done (`src/classify`): a
   transparent cascade (learned corrections → deterministic FR rules → heuristics → unknown),
   each verdict carrying a confidence, source and French reason. `aggregateByCategory` /
   `proRevenue` split totals so only professional income feeds the engine; corrections are
   remembered in the vault (schema v2). Next: the transactions UI to view/correct, and
   richer rules. The "smart" core.
4. **Advice engine** — ✅ all three profiles (`src/advice`): each advisor reuses the exact
   engine to value levers in euros — micro (régime choice, ACRE, threshold alerts),
   particulier (PER deduction + unused ceiling, frais-réels vs forfait), société (dividend
   PFU/barème, reduced-IS-rate) — with honest unquantified notes where a model is missing
   (micro-vs-réel, salaire-vs-dividende). Each advice is traced (`ruleRef`) and shown in an
   escaped `#advice` card with an indicative total and an expert-comptable disclaimer. Next: a
   régime-réel model (with sourced TNS parameters) to quantify the micro-vs-réel arbitrage; a
   payroll model for salaire-vs-dividende. Posture: information & transparent simulation.
5. **Desktop app (Tauri)** — package the whole thing as a one-click installer; connectors and
   their secrets move into the Rust layer, resolving the local-first vs live-secrets tension.
   This is also where **real one-click bank OAuth** lives: the Rust core opens the aggregator's
   consent page, catches the redirect on a `localhost` loopback, exchanges the code for tokens
   locally, and stores them in the OS keychain — no hosted server, no secret in the web layer.
   The only case still needing a tiny hosted token-broker is an aggregator that mandates a
   confidential client (a secret that cannot ship in a distributed binary).

## Testing & workflow

Test-first (Vitest), each parameter/edge case pinned by a unit test. See
[`CLAUDE.md`](./CLAUDE.md) for the mandatory working rules.
