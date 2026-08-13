# Micro-entrepreneur parameters — 2026

This is the sourced reference for every figure hard-coded in
[`src/engine/rules.ts`](../src/engine/rules.ts). Each value was checked against public
sources (see below) in August 2026. **This is not tax advice**; it is a best-effort,
transparent model. If you spot an error, please open an issue or a PR — the
whole point of TI'TIrelire is that the numbers are auditable.

> Scope of V1: the four main micro-entrepreneur categories, income tax (progressive scale
> *or* flat option), social contributions, CFP, and the main thresholds. Out of scope for
> now (documented as caveats in the app): CFE, per-tranche VAT mechanics beyond the
> threshold, meublés de tourisme special rates, and the détail of income-tax décote /
> plafonnement du quotient familial.

## Activity categories

| Key (code) | Category | Régime |
|---|---|---|
| `vente_marchandises` | Sale of goods / accommodation | BIC |
| `prestations_bic` | Commercial or artisanal services | BIC |
| `prestations_bnc` | Non-commercial services (SSI) | BNC |
| `liberal_cipav` | Regulated liberal professions (CIPAV) | BNC |

## Social contribution rates (2026, excl. CFP)

| Activity | Rate |
|---|---|
| Sale of goods (BIC) | **12.30 %** |
| Services BIC | **21.20 %** |
| Services BNC (SSI) | **25.60 %** |
| Liberal CIPAV (BNC) | **23.20 %** |

BNC rates rose progressively (24.6 % in 2025 → 25.6 % on 2026-01-01) to improve social
cover.

## ACRE (first-year relief)

- Created **before 2026-07-01** → **50 %** reduction of social contributions.
- Created **on/after 2026-07-01** → **25 %** reduction.
- Applies for the first 12 months, and **not** to the CFP.

## Flat income-tax allowance (abattement forfaitaire)

| Activity | Allowance | Minimum |
|---|---|---|
| Sale of goods | **71 %** | 305 € |
| Services BIC | **50 %** | 305 € |
| BNC / liberal | **34 %** | 305 € |

Taxable income = turnover − allowance (the allowance is at least 305 €, never more than
turnover).

## Versement libératoire (flat income-tax option)

| Activity | Rate |
|---|---|
| Sale of goods | **1.0 %** |
| Services BIC | **1.7 %** |
| BNC / liberal | **2.2 %** |

Eligibility: reference tax income (RFR) of 2024 ≤ **29 315 €** per household part. The
simulator surfaces this as a caveat rather than enforcing it (it does not know your RFR).

## CFP (contribution to professional training)

| Activity | Rate |
|---|---|
| Commerçant (sale of goods) | **0.10 %** |
| Artisan | **0.30 %** |
| Liberal / BNC | **0.20 %** |

Modelling note: `prestations_bic` uses the artisanal rate (0.30 %); purely commercial
services would be 0.10 %. This is surfaced in the line-item detail.

## Régime thresholds (2026)

| | Micro ceiling | VAT franchise (base) | VAT tolerance |
|---|---|---|---|
| Sale of goods / accommodation | **203 100 €** | **85 000 €** | 93 500 € |
| Services / liberal | **83 600 €** | **37 500 €** | 41 250 € |

Only the **micro ceiling** and the **VAT franchise base** are modelled in `rules.ts` (they
drive the threshold warnings). The **VAT tolerance** (seuil majoré) column is context only —
not modelled in V1 (see the scope note above).

The unified 25 000 € VAT threshold debated in 2025 was abandoned (loi n° 2025-1044 of
2025-11-03); the activity-based thresholds remain.

## Income-tax scale (barème 2026, on 2025 income)

Per household part, after the quotient familial:

| Bracket | Rate |
|---|---|
| up to 11 600 € | 0 % |
| 11 600 → 29 579 € | 11 % |
| 29 579 → 84 577 € | 30 % |
| 84 577 → 181 917 € | 41 % |
| beyond 181 917 € | 45 % |

Set by the loi de finances 2026, indexed +0.9 % on inflation.

## Salaried individual (income tax)

| Parameter | Value |
|---|---|
| Professional-expenses deduction | **10 %** (min **499 €**, ceiling **14 556 €**) |
| PER deduction floor / ceiling | **4 710 € / 37 680 €** (10 % of PASS 2025 / of 8× PASS 2025) |
| PASS 2026 | 48 060 € |

Frais réels may be used instead of the 10 % forfait (no ceiling). The abattement ceiling
figure varies slightly across sources (14 171–14 556 €) and rarely binds; it is isolated in
`particulier.ts`.

## Company — SASU (corporate tax & dividends)

| Parameter | Value |
|---|---|
| IS reduced rate | **15 %** up to **42 500 €** (CA < 10 M€, capital libéré, ≥ 75 % personnes physiques) |
| IS normal rate | **25 %** |
| PFU (flat tax) on dividends | **30 %** = 12,8 % IR + 17,2 % prélèvements sociaux |
| Dividend allowance (barème option) | **40 %** |
| CSG déductible (barème option) | **6,8 %** of the gross dividend |

⚠️ **2026 caveat:** several sources report prélèvements sociaux rising to **18,6 %** (PFU
**31,4 %**) in 2026. This model keeps the well-established **17,2 %** and surfaces the caveat;
the rate is a single constant in `societe.ts`. Out of scope: the EURL gérant-majoritaire case
(dividends above 10 % of capital reclassified as TNS contributions) and the salaire-vs-dividende
arbitrage (needs a payroll model).

## Sources

- URSSAF — auto-entrepreneur contribution rates:
  <https://www.urssaf.fr/accueil/actualites/taux-cotisations-autoentrepeneur.html>
- Le Coin des Entrepreneurs — 2026 rate table:
  <https://www.lecoindesentrepreneurs.fr/taux-cotisations-sociales-2026-micro-entrepreneur/>
- mon-entreprise (URSSAF / betagouv) — publicodes model:
  <https://github.com/betagouv/mon-entreprise>
- impots.gouv.fr — versement libératoire:
  <https://www.impots.gouv.fr/professionnel/le-versement-liberatoire>
- Service-Public — 2026 income-tax scale:
  <https://www.service-public.gouv.fr/particuliers/actualites/A18045>
- VAT franchise reform (loi n° 2025-1044): reported across professional press, Aug 2026.
