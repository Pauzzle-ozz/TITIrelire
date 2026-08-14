/**
 * VAT (TVA) status and a transparent estimate.
 *
 * What is **exact**: the régime, derived from turnover against the 2026 franchise thresholds
 * (base and majoré) — franchise (no VAT), tolerance zone (franchise kept the current year), or
 * réel (VAT due). What is an **estimate**: the collected/deductible VAT amounts, because a
 * canonical transaction carries a total, not a VAT breakdown. So amounts are computed from a
 * standard rate applied to HT figures and clearly surfaced as an estimation — never invented.
 */
import { microThresholds } from './simulate.js'
import type { ActivityType } from './types.js'

/** Standard French VAT rate (taux normal). */
export const TVA_TAUX_NORMAL = 0.2

export type TvaRegime = 'franchise' | 'tolerance' | 'reel'

export interface TvaInput {
  /** Annual turnover (CA), assumed HT for the estimate. */
  ca: number
  activity: ActivityType
  /** Deductible-VAT base (business charges HT); optional, for the estimate. */
  charges?: number
  /** VAT rate to apply in the estimate. Default {@link TVA_TAUX_NORMAL}. */
  taux?: number
}

export interface TvaStatus {
  regime: TvaRegime
  /** Whether VAT is due (only in the réel régime). */
  assujetti: boolean
  franchiseTVA: number
  franchiseTVAMajoree: number
  /** Estimated collected VAT (réel only): CA × taux. */
  tvaCollecteeEstimee?: number
  /** Estimated deductible VAT (réel only): charges × taux. */
  tvaDeductibleEstimee?: number
  /** Estimated net VAT due (réel only): collectée − déductible. */
  tvaNetteEstimee?: number
  /** French explanation of the régime (and the estimate's assumptions). */
  explanation: string
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function eur(amount: number): string {
  return `${round2(amount).toLocaleString('fr-FR')} €`
}

/**
 * Determines the VAT régime for a turnover and, when VAT is due, adds a flagged estimate of
 * the collected/deductible/net amounts.
 */
export function tvaStatus(input: TvaInput): TvaStatus {
  if (!Number.isFinite(input.ca) || input.ca < 0) throw new RangeError('ca must be >= 0')
  const { franchiseTVA, franchiseTVAMajoree } = microThresholds(input.activity)
  const taux = input.taux ?? TVA_TAUX_NORMAL

  let regime: TvaRegime
  if (input.ca > franchiseTVAMajoree) regime = 'reel'
  else if (input.ca > franchiseTVA) regime = 'tolerance'
  else regime = 'franchise'

  const assujetti = regime === 'reel'
  const base = { regime, assujetti, franchiseTVA, franchiseTVAMajoree }

  if (!assujetti) {
    return {
      ...base,
      explanation:
        regime === 'franchise'
          ? `Franchise en base : sous ${eur(franchiseTVA)}, vous ne facturez pas la TVA.`
          : `Zone de tolérance : entre ${eur(franchiseTVA)} et ${eur(franchiseTVAMajoree)}, la ` +
            `franchise est conservée cette année.`,
    }
  }

  const collectee = round2(input.ca * taux)
  const deductible = round2((input.charges ?? 0) * taux)
  const nette = round2(collectee - deductible)
  return {
    ...base,
    tvaCollecteeEstimee: collectee,
    tvaDeductibleEstimee: deductible,
    tvaNetteEstimee: nette,
    explanation:
      `Au-delà de ${eur(franchiseTVAMajoree)}, la TVA est due. Estimation à ${(taux * 100).toFixed(0)} % ` +
      `(CA et charges supposés HT) : ${eur(collectee)} collectée − ${eur(deductible)} déductible = ` +
      `${eur(nette)} nette. Montants indicatifs — la TVA réelle dépend des taux par opération.`,
  }
}
