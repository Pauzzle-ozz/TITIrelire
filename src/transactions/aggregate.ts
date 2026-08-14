/**
 * Aggregation: turns a list of canonical transactions into a turnover figure that
 * feeds the tax engine. This is the bridge between the "data connection" layer and
 * the "simulation" layer — the payoff of importing transactions instead of typing a CA.
 */
import { direction, type AggregateOptions, type Transaction, type TurnoverSummary } from './types.js'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Sums income (amount > 0) into `revenue` and expenses (amount < 0) into `expenses`,
 * after optional year and currency filtering.
 *
 * Turnover for the micro régime is gross income (encaissements), i.e. the sum of
 * positive amounts. Expenses are reported too (useful for the régime réel later).
 * Transactions in a currency other than the requested one are ignored and listed in
 * `ignoredCurrencies`, so nothing is silently mixed.
 */
export function aggregateTurnover(
  transactions: Transaction[],
  options: AggregateOptions = {},
): TurnoverSummary {
  const currency = (options.currency ?? 'EUR').toUpperCase()
  const { year } = options

  let revenue = 0
  let expenses = 0
  let transactionCount = 0
  let incomeCount = 0
  const ignored = new Set<string>()

  for (const tx of transactions) {
    if (year !== undefined && Number(tx.date.slice(0, 4)) !== year) continue
    const txCurrency = tx.currency.toUpperCase()
    if (txCurrency !== currency) {
      ignored.add(txCurrency)
      continue
    }
    transactionCount += 1
    // Sign convention lives in exactly one place: direction() (amount >= 0 → income).
    if (direction(tx) === 'income') {
      revenue += tx.amount
      incomeCount += 1
    } else {
      expenses += -tx.amount
    }
  }

  return {
    revenue: round2(revenue),
    expenses: round2(expenses),
    currency,
    transactionCount,
    incomeCount,
    ...(year !== undefined ? { year } : {}),
    ignoredCurrencies: [...ignored].sort(),
  }
}
