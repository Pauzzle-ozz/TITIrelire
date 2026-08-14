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

/** Cap on the quotient-familial advantage, per extra half-part (2026, revenus 2025). */
export const QF_PLAFOND_DEMI_PART_2026 = 1807

/** Décote parameters (2026, revenus 2025): tax = IR − max(0, plafond − rate × IR). */
export const DECOTE_2026 = { plafondSeul: 897, plafondCouple: 1483, taux: 0.4525 } as const

/** Raw scale tax for a household of `parts` (quotient familial division), before décote/cap. */
function scaleTax(taxableIncome: number, parts: number): number {
  const quotient = Math.max(0, taxableIncome) / parts
  let taxPerPart = 0
  let lower = 0
  for (const { upTo, rate } of BAREME_IR_2026) {
    if (quotient > lower) taxPerPart += (Math.min(quotient, upTo) - lower) * rate
    lower = upTo
    if (quotient <= upTo) break
  }
  return taxPerPart * parts
}

/**
 * Progressive income tax on `taxableIncome` for a household of `parts`, modelling the full
 * 2026 chain: quotient familial, its **plafonnement** (the QF advantage above `baseParts` is
 * capped at {@link QF_PLAFOND_DEMI_PART_2026} per extra half-part), then the **décote** for
 * low taxes ({@link DECOTE_2026}). `baseParts` is 1 for a single filer, 2 for a couple —
 * it also selects the décote ceiling. Negative/zero income yields 0.
 *
 * Out of scope (honest limits): the parent-isolé enhanced first-part cap and other special
 * QF cases; reductions/credits.
 */
export function impotBareme(taxableIncome: number, parts = 1, baseParts = 1): number {
  if (!Number.isFinite(taxableIncome)) throw new RangeError('taxableIncome must be finite')
  if (!Number.isFinite(parts) || parts < 1) throw new RangeError('parts must be a finite number >= 1')
  if (baseParts !== 1 && baseParts !== 2) throw new RangeError('baseParts must be 1 or 2')

  const income = Math.max(0, taxableIncome)
  const taxWithQf = scaleTax(income, parts)

  // Plafonnement du quotient familial: cap the advantage of the half-parts above baseParts.
  let taxAfterCap = taxWithQf
  if (parts > baseParts) {
    const taxAtBase = scaleTax(income, baseParts)
    const advantage = taxAtBase - taxWithQf // ≥ 0 (more parts → less tax)
    const cap = QF_PLAFOND_DEMI_PART_2026 * ((parts - baseParts) / 0.5)
    if (advantage > cap) taxAfterCap = taxAtBase - cap
  }

  // Décote for low taxes.
  const plafond = baseParts === 2 ? DECOTE_2026.plafondCouple : DECOTE_2026.plafondSeul
  const decote = Math.max(0, plafond - DECOTE_2026.taux * taxAfterCap)
  return round2(Math.max(0, taxAfterCap - decote))
}

/**
 * Marginal income tax attributable to adding `extra` taxable income on top of `base`, for a
 * household of `parts` (and `baseParts` single/couple) — i.e. `IR(base + extra) − IR(base)`,
 * so décote and plafonnement transitions are reflected in the attributable amount.
 */
export function impotMarginal(base: number, extra: number, parts = 1, baseParts = 1): number {
  return round2(impotBareme(base + extra, parts, baseParts) - impotBareme(base, parts, baseParts))
}
