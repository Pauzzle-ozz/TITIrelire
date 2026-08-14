/**
 * Category-aware aggregation — the payoff of classification.
 *
 * A micro-entrepreneur's turnover (CA) is **professional income only**. When a mixed
 * personal/business account is imported, summing every credit overstates the CA and the tax.
 * {@link aggregateByCategory} splits the totals by {@link TxCategory}, and
 * {@link proRevenue} returns the figure that should feed the fiscal engine — while `unknown`
 * income stays visible so the user knows what still needs a decision.
 */
import type { ClassifiedTransaction, TxCategory } from './types.js'
import { direction, type AggregateOptions } from '../transactions/types.js'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Income/expense totals for one category. */
export interface CategoryTotals {
  /** Sum of income (amount ≥ 0), rounded to the cent. */
  revenue: number
  /** Sum of the absolute value of expenses (amount < 0), rounded to the cent. */
  expenses: number
  /** Count of income transactions. */
  incomeCount: number
  /** Count of expense transactions. */
  expenseCount: number
}

/** Totals split by category, plus the same period/currency transparency as the turnover summary. */
export interface ClassifiedSummary {
  pro: CategoryTotals
  perso: CategoryTotals
  unknown: CategoryTotals
  currency: string
  transactionCount: number
  year?: number
  ignoredCurrencies: string[]
}

function emptyTotals(): CategoryTotals {
  return { revenue: 0, expenses: 0, incomeCount: 0, expenseCount: 0 }
}

/**
 * Aggregates classified transactions into per-category income/expense totals, after optional
 * year and currency filtering (non-matching currencies are reported, never mixed in).
 */
export function aggregateByCategory(
  classified: ClassifiedTransaction[],
  options: AggregateOptions = {},
): ClassifiedSummary {
  const currency = (options.currency ?? 'EUR').toUpperCase()
  const { year } = options
  const totals: Record<TxCategory, CategoryTotals> = {
    pro: emptyTotals(),
    perso: emptyTotals(),
    unknown: emptyTotals(),
  }
  let transactionCount = 0
  const ignored = new Set<string>()

  for (const { transaction, classification } of classified) {
    if (year !== undefined && Number(transaction.date.slice(0, 4)) !== year) continue
    const txCurrency = transaction.currency.toUpperCase()
    if (txCurrency !== currency) {
      ignored.add(txCurrency)
      continue
    }
    transactionCount += 1
    const bucket = totals[classification.category]
    if (direction(transaction) === 'income') {
      bucket.revenue += transaction.amount
      bucket.incomeCount += 1
    } else {
      bucket.expenses += -transaction.amount
      bucket.expenseCount += 1
    }
  }

  for (const bucket of Object.values(totals)) {
    bucket.revenue = round2(bucket.revenue)
    bucket.expenses = round2(bucket.expenses)
  }

  return {
    pro: totals.pro,
    perso: totals.perso,
    unknown: totals.unknown,
    currency,
    transactionCount,
    ...(year !== undefined ? { year } : {}),
    ignoredCurrencies: [...ignored].sort(),
  }
}

/** The turnover to feed the fiscal engine: professional income only. */
export function proRevenue(summary: ClassifiedSummary): number {
  return summary.pro.revenue
}
