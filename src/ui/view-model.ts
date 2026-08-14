/**
 * Pure view-models for the UI.
 *
 * Each fiscal profile (micro-entrepreneur, salaried individual, company) is turned into
 * the same DOM-free {@link ViewModel} shape, so `main.ts` renders them uniformly. Keeping
 * this pure makes the display logic unit-testable.
 */
import type { Comparison } from '../engine/compare.js'
import type { DividendComparison, SocieteResult } from '../engine/societe.js'
import type { ParticulierResult, PerComparison } from '../engine/particulier.js'
import type { IncomeTaxMode, LineItem, WarningLevel } from '../engine/types.js'

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })

/** Formats an amount as euros, French style (e.g. "43 481,00 €"). */
export function formatEUR(amount: number): string {
  return EUR.format(amount)
}

/** Formats a ratio as a French percentage (e.g. 0.1304 → "13,0 %"). */
export function formatPct(ratio: number): string {
  return PCT.format(ratio)
}

/** Human label for a micro income-tax mode. */
export function modeLabel(mode: IncomeTaxMode): string {
  return mode === 'bareme' ? 'le barème progressif' : 'le versement libératoire'
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1)
}

export interface ViewRow {
  label: string
  amount: string
  detail: string
}

/** A generic 2-option comparison table. `rows[i].label` is the first ("Option") column. */
export interface ViewComparison {
  title: string
  columns: string[]
  rows: { label: string; cells: string[]; recommended: boolean }[]
}

export interface ViewWarning {
  level: WarningLevel
  message: string
}

export interface ViewModel {
  recommendationTitle: string
  recommendationDetail: string
  /** Formatted headline figure (net income / net dividend…). */
  netHighlight: string
  /** Caption under the headline (e.g. "revenu net estimé"). */
  netLabel: string
  /** Formatted effective rate, when relevant. */
  effectiveRate?: string
  /** Optional 2-option comparison. */
  comparison?: ViewComparison
  /** Line-by-line breakdown. */
  breakdown: ViewRow[]
  warnings: ViewWarning[]
}

function rowFromLine(line: LineItem): ViewRow {
  return { label: line.label, amount: formatEUR(line.amount), detail: line.detail }
}

/** Micro-entrepreneur: barème vs versement libératoire. */
export function toMicroViewModel(comparison: Comparison): ViewModel {
  const recommended =
    comparison.recommended === 'bareme' ? comparison.bareme : comparison.versementLiberatoire
  const options = [comparison.bareme, comparison.versementLiberatoire]

  return {
    recommendationTitle: `Recommandation : ${capitalize(modeLabel(comparison.recommended))}`,
    recommendationDetail: comparison.explanation,
    netHighlight: formatEUR(recommended.netIncome),
    netLabel: 'revenu net estimé',
    effectiveRate: formatPct(recommended.result.effectiveLevyRate),
    comparison: {
      title: 'Barème vs versement libératoire',
      columns: ['Option', 'Impôt', 'Prélèvements', 'Revenu net'],
      rows: options.map((o) => ({
        label: capitalize(modeLabel(o.mode)),
        cells: [formatEUR(o.incomeTax), formatEUR(o.totalLevies), formatEUR(o.netIncome)],
        recommended: o.mode === comparison.recommended,
      })),
    },
    breakdown: recommended.result.breakdown.map(rowFromLine),
    warnings: comparison.warnings.map((w) => ({ level: w.level, message: w.message })),
  }
}

/** Salaried individual: income tax, with the PER optimisation when a contribution is set. */
export function toParticulierViewModel(result: ParticulierResult, per: PerComparison): ViewModel {
  const hasPer = per.deductible > 0
  const salaire = result.input.salaireNetImposable

  return {
    recommendationTitle: hasPer
      ? `PER : ${formatEUR(per.taxSaving)} d'impôt en moins`
      : 'Impôt sur le revenu',
    recommendationDetail: per.explanation,
    netHighlight: formatEUR(result.netAfterTax),
    netLabel: 'revenu net après impôt',
    effectiveRate: formatPct(result.effectiveRate),
    ...(hasPer
      ? {
          comparison: {
            title: 'Sans PER vs avec PER',
            columns: ['Option', 'Impôt', 'Revenu net'],
            rows: [
              {
                label: 'Sans PER',
                cells: [formatEUR(per.taxWithout), formatEUR(salaire - per.taxWithout)],
                recommended: false,
              },
              {
                label: `Avec PER (${formatEUR(per.deductible)})`,
                cells: [formatEUR(per.taxWith), formatEUR(salaire - per.taxWith)],
                recommended: per.taxSaving > 0,
              },
            ],
          },
        }
      : {}),
    breakdown: result.breakdown.map(rowFromLine),
    warnings: result.warnings.map((w) => ({ level: w.level, message: w.message })),
  }
}

/** Company (SASU): IS then dividends, PFU vs barème. */
export function toSocieteViewModel(result: SocieteResult, comparison: DividendComparison): ViewModel {
  const recommendedNet = comparison.recommended === 'pfu' ? comparison.netPfu : comparison.netBareme
  const label = comparison.recommended === 'pfu' ? 'le PFU (flat tax)' : 'le barème progressif'
  const benefice = result.input.benefice
  const overallRate = benefice > 0 ? 1 - recommendedNet / benefice : 0

  return {
    recommendationTitle: `Recommandation : ${capitalize(label)}`,
    recommendationDetail: comparison.explanation,
    netHighlight: formatEUR(recommendedNet),
    netLabel: 'net dividende (associé)',
    effectiveRate: formatPct(overallRate),
    comparison: {
      title: 'PFU vs barème (dividende)',
      columns: ['Option', 'Net dividende'],
      rows: [
        {
          label: 'PFU (flat tax)',
          cells: [formatEUR(comparison.netPfu)],
          recommended: comparison.recommended === 'pfu',
        },
        {
          label: 'Barème progressif',
          cells: [formatEUR(comparison.netBareme)],
          recommended: comparison.recommended === 'bareme',
        },
      ],
    },
    breakdown: result.breakdown.map(rowFromLine),
    warnings: comparison.warnings.map((w) => ({ level: w.level, message: w.message })),
  }
}
