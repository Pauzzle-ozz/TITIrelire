/**
 * Domain types for the micro-entrepreneur simulator (V1).
 *
 * The public API is intentionally small and typed so the calculation engine can
 * evolve (or swap its internals) without breaking callers. All monetary values
 * are in euros; rates are ratios (e.g. 0.123 for 12.3 %).
 */

/**
 * Fiscal category of the activity. This drives every rate in the model
 * (social contributions, income-tax allowance, flat-tax option, CFP, thresholds).
 *
 * - `vente_marchandises`  — sale of goods / accommodation (BIC).
 * - `prestations_bic`     — commercial or artisanal services (BIC).
 * - `prestations_bnc`     — non-commercial services, affiliated to the SSI (BNC).
 * - `liberal_cipav`       — regulated liberal professions affiliated to the CIPAV (BNC).
 */
export type ActivityType =
  | 'vente_marchandises'
  | 'prestations_bic'
  | 'prestations_bnc'
  | 'liberal_cipav'

/** How income tax is settled. */
export type IncomeTaxMode = 'versement_liberatoire' | 'bareme'

/** Severity of a message surfaced to the user. */
export type WarningLevel = 'info' | 'warning'

/** A single, human-readable message about the situation (never a hard failure). */
export interface Warning {
  /** Stable machine code, safe to switch on. */
  code: string
  level: WarningLevel
  /** French, user-facing explanation. */
  message: string
}

/** One transparent line of the computation ("show the maths, not just the result"). */
export interface LineItem {
  /** Stable machine key. */
  key: string
  /** French, user-facing label. */
  label: string
  /** Amount in euros, rounded to the cent. */
  amount: number
  /** Base the rate was applied to, in euros, when relevant. */
  base?: number
  /** Rate applied, as a ratio (0.123 = 12.3 %), when relevant. */
  rate?: number
  /** Plain-language explanation of how `amount` was obtained. */
  detail: string
}

/** Raw input as provided by a caller; optional fields have sensible defaults. */
export interface SimulationInput {
  activity: ActivityType
  /** Annual turnover (chiffre d'affaires) in euros, excl. VAT. Must be ≥ 0. */
  revenue: number
  /** Opt into the flat-rate income-tax payment (versement libératoire). Default false. */
  versementLiberatoire?: boolean
  /** First-year ACRE social-contribution relief. Default false. */
  acre?: boolean
  /**
   * Reduced ACRE rate (25 % instead of 50 %) for businesses created on or after
   * 2026-07-01. Ignored when `acre` is false. Default false.
   */
  acreReducedRate?: boolean
  /** Tax-household parts (quotient familial) for the progressive scale. Default 1. */
  parts?: number
  /**
   * Other net taxable household income added before the progressive scale, so the
   * income-tax figure reflects the real marginal cost of the activity.
   * Ignored under versement libératoire. Default 0.
   */
  otherHouseholdTaxableIncome?: number
}

/** Input with every field resolved to a concrete value. */
export interface NormalizedInput {
  activity: ActivityType
  revenue: number
  versementLiberatoire: boolean
  acre: boolean
  acreReducedRate: boolean
  parts: number
  otherHouseholdTaxableIncome: number
}

/** Full, transparent result of a simulation. */
export interface SimulationResult {
  /** The normalized input the result was computed from. */
  input: NormalizedInput
  /** Turnover, echoed for convenience (euros). */
  revenue: number
  /** How income tax was settled. */
  incomeTaxMode: IncomeTaxMode
  /** Social contributions (URSSAF), after any ACRE relief. */
  socialContributions: LineItem
  /** Contribution to professional training (CFP). */
  trainingContribution: LineItem
  /** Income tax attributable to the activity. */
  incomeTax: LineItem
  /** Ordered breakdown for display: [social, CFP, income tax]. */
  breakdown: LineItem[]
  /** Taxable income from the activity under the standard régime (euros). */
  taxableIncome: number
  /** Sum of all levies (euros). */
  totalLevies: number
  /** Turnover minus all levies (euros). */
  netIncome: number
  /** totalLevies / revenue, as a ratio (0 when revenue is 0). */
  effectiveLevyRate: number
  /** Non-blocking messages (threshold crossings, eligibility caveats, scope notes). */
  warnings: Warning[]
}
