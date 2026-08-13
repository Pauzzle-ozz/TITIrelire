/**
 * Canonical transaction model.
 *
 * Every data source — CSV export, payment provider (Stripe…), bank feed, CRM — is
 * normalized into this one shape. The tax engine and the aggregation layer only ever
 * see `Transaction[]`, never a provider-specific format. This is the seam that lets us
 * add connectors without touching the fiscal code.
 *
 * Amounts are **signed**, matching how banks and payment providers report them:
 * a positive amount is money in (income / turnover), a negative amount is money out
 * (expense / refund). This avoids sign ambiguity across sources.
 */

/** A single normalized financial movement. */
export interface Transaction {
  /** Stable, source-unique identifier (used for de-duplication). */
  id: string
  /** ISO date, `YYYY-MM-DD` (a datetime is accepted and truncated to the day). */
  date: string
  /** Signed amount in `currency` units: > 0 money in, < 0 money out. */
  amount: number
  /** ISO 4217 currency code, uppercase (e.g. `EUR`). */
  currency: string
  /** Human-readable description. */
  label: string
  /** Other party (client, merchant…), when known. */
  counterparty?: string
  /** Free category/tag, when known. */
  category?: string
  /** Origin of the record (e.g. `stripe`, `csv`, `bank`). */
  source: string
  /**
   * Original provider record, kept for auditability. Opt-in only (importers/connectors
   * omit it by default) since it holds the untrimmed upstream payload — strip it before
   * sharing/exporting transactions (data minimization).
   */
  raw?: unknown
}

/** A raw, partially-typed transaction as produced by a connector before validation. */
export type RawTransaction = Omit<Partial<Transaction>, 'amount'> & { amount?: number | string }

/** Direction of a transaction, derived from the sign of its amount. */
export type TransactionDirection = 'income' | 'expense'

/** Returns whether a transaction is money in (income) or out (expense). */
export function direction(transaction: Transaction): TransactionDirection {
  return transaction.amount >= 0 ? 'income' : 'expense'
}

/** How turnover is aggregated from transactions. */
export interface AggregateOptions {
  /** Keep only transactions of this calendar year (from the ISO date). */
  year?: number
  /** Currency to aggregate; others are ignored and reported. Default `EUR`. */
  currency?: string
}

/** Result of aggregating transactions into a turnover figure. */
export interface TurnoverSummary {
  /** Sum of income (amount >= 0), rounded to the cent — feeds the tax engine as `revenue`. */
  revenue: number
  /** Sum of the absolute value of expenses (amount < 0), rounded to the cent. */
  expenses: number
  /** Currency the figures are expressed in. */
  currency: string
  /** Total transactions considered (after currency/period filtering). */
  transactionCount: number
  /** Number of income transactions counted into `revenue`. */
  incomeCount: number
  /** Year filter applied, if any. */
  year?: number
  /** Currencies present in the input but skipped (not equal to `currency`). */
  ignoredCurrencies: string[]
}
