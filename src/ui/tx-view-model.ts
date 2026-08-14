/**
 * Pure view-model for the transactions table.
 *
 * Turns classified transactions into display-ready rows and totals — no DOM, no side
 * effects — so the presentation is fully unit-testable. The euro/percent formatting and the
 * French category labels live here; {@link ./tx-render.js} only stitches strings.
 */
import { aggregateByCategory, proRevenue, type ClassifiedSummary } from '../classify/aggregate.js'
import type { ClassifiedTransaction, TxCategory } from '../classify/types.js'
import { direction, type AggregateOptions } from '../transactions/types.js'

/** French label for a category, as shown in the table and the correction control. */
export function categoryLabel(category: TxCategory): string {
  return category === 'pro' ? 'Pro' : category === 'perso' ? 'Perso' : 'À classer'
}

const EURO = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** Formats a signed euro amount (e.g. `1 200,00 €`, `-60,00 €`). */
export function formatEuro(amount: number): string {
  return EURO.format(amount)
}

/** One display row for a classified transaction. */
export interface TxRow {
  id: string
  date: string
  label: string
  amountLabel: string
  direction: 'income' | 'expense'
  category: TxCategory
  categoryLabel: string
  reason: string
  /** Confidence as a 0–100 integer, for display. */
  confidencePct: number
}

/** The whole table: rows, per-category totals, and the CA the engine should use. */
export interface TxTableViewModel {
  rows: TxRow[]
  summary: ClassifiedSummary
  /** Professional income only — the CA to feed the fiscal engine. */
  proRevenue: number
  proRevenueLabel: string
  /** Count of income transactions still `unknown` (money in that may belong in the CA). */
  unknownIncomeCount: number
}

/** Builds the table view-model from classified transactions. */
export function toTxTableViewModel(
  classified: ClassifiedTransaction[],
  options: AggregateOptions = {},
): TxTableViewModel {
  const rows: TxRow[] = classified.map(({ transaction, classification }) => ({
    id: transaction.id,
    date: transaction.date,
    label: transaction.label,
    amountLabel: formatEuro(transaction.amount),
    direction: direction(transaction),
    category: classification.category,
    categoryLabel: categoryLabel(classification.category),
    reason: classification.reason,
    confidencePct: Math.round(classification.confidence * 100),
  }))

  const summary = aggregateByCategory(classified, options)
  const unknownIncomeCount = rows.filter(
    (r) => r.category === 'unknown' && r.direction === 'income',
  ).length

  return {
    rows,
    summary,
    proRevenue: proRevenue(summary),
    proRevenueLabel: formatEuro(proRevenue(summary)),
    unknownIncomeCount,
  }
}
