/**
 * Pure view-model for the UI.
 *
 * Turns a {@link Comparison} into ready-to-render, locale-formatted strings.
 * Keeping this DOM-free makes the display logic unit-testable and keeps
 * `main.ts` a thin wiring layer.
 */
import type { Comparison } from '../engine/compare.js'
import type { IncomeTaxMode, WarningLevel } from '../engine/types.js'

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})
const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })

/** Formats an amount as euros, French style (e.g. "43 481,00 €"). */
export function formatEUR(amount: number): string {
  return EUR.format(amount)
}

/** Formats a ratio as a French percentage (e.g. 0.1304 → "13,0 %"). */
export function formatPct(ratio: number): string {
  return PCT.format(ratio)
}

/** Human label for an income-tax mode. */
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

export interface ViewOption {
  label: string
  mode: IncomeTaxMode
  incomeTax: string
  totalLevies: string
  netIncome: string
  recommended: boolean
}

export interface ViewWarning {
  level: WarningLevel
  message: string
}

export interface ViewModel {
  recommendationTitle: string
  recommendationDetail: string
  /** Formatted net income of the recommended option. */
  netHighlight: string
  /** Formatted effective levy rate of the recommended option. */
  effectiveRate: string
  /** Both options, barème first. */
  options: ViewOption[]
  /** Line-by-line breakdown of the recommended option. */
  breakdown: ViewRow[]
  warnings: ViewWarning[]
}

/** Builds the full view-model for a comparison. */
export function toViewModel(comparison: Comparison): ViewModel {
  const recommended =
    comparison.recommended === 'bareme' ? comparison.bareme : comparison.versementLiberatoire

  return {
    recommendationTitle: `Recommandation : ${capitalize(modeLabel(comparison.recommended))}`,
    recommendationDetail: comparison.explanation,
    netHighlight: formatEUR(recommended.netIncome),
    effectiveRate: formatPct(recommended.result.effectiveLevyRate),
    options: [comparison.bareme, comparison.versementLiberatoire].map((option) => ({
      label: capitalize(modeLabel(option.mode)),
      mode: option.mode,
      incomeTax: formatEUR(option.incomeTax),
      totalLevies: formatEUR(option.totalLevies),
      netIncome: formatEUR(option.netIncome),
      recommended: option.mode === comparison.recommended,
    })),
    breakdown: recommended.result.breakdown.map((line) => ({
      label: line.label,
      amount: formatEUR(line.amount),
      detail: line.detail,
    })),
    warnings: comparison.warnings.map((warning) => ({
      level: warning.level,
      message: warning.message,
    })),
  }
}
