/**
 * Shared 2026 progressive income-tax scale (barème de l'impôt sur le revenu).
 *
 * Used by the salaried-individual and company profiles. The micro-entrepreneur module
 * expresses the same scale in publicodes; unifying both on one representation is a
 * roadmap item (see ARCHITECTURE.md). Figures are sourced in docs/parameters-2026.md.
 */

/** One bracket: applies `rate` to income up to `upTo` (per household part). */
export interface TaxBracket {
  upTo: number
  rate: number
}

/** Barème 2026 (revenus 2025), per household part. */
export const BAREME_IR_2026: readonly TaxBracket[] = [
  { upTo: 11600, rate: 0 },
  { upTo: 29579, rate: 0.11 },
  { upTo: 84577, rate: 0.3 },
  { upTo: 181917, rate: 0.41 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45 },
]

/** Rounds to the cent, avoiding binary-float artefacts. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Progressive income tax on `taxableIncome` for a household of `parts`, applying the
 * quotient familial (tax computed per part, then multiplied back). Négative/zero income
 * yields 0. Does not model the décote or the plafonnement du quotient familial (noted as
 * out of scope, like the micro module).
 */
export function impotBareme(taxableIncome: number, parts = 1): number {
  if (!Number.isFinite(taxableIncome)) throw new RangeError('taxableIncome must be finite')
  if (!Number.isFinite(parts) || parts < 1) throw new RangeError('parts must be a finite number >= 1')

  const quotient = Math.max(0, taxableIncome) / parts
  let taxPerPart = 0
  let lower = 0
  for (const { upTo, rate } of BAREME_IR_2026) {
    if (quotient > lower) {
      taxPerPart += (Math.min(quotient, upTo) - lower) * rate
    }
    lower = upTo
    if (quotient <= upTo) break
  }
  return round2(taxPerPart * parts)
}

/**
 * Marginal income tax attributable to adding `extra` taxable income on top of `base`,
 * for a household of `parts` — i.e. `IR(base + extra) − IR(base)`.
 */
export function impotMarginal(base: number, extra: number, parts = 1): number {
  return round2(impotBareme(base + extra, parts) - impotBareme(base, parts))
}
