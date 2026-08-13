/**
 * The end-to-end payoff: feed transactions in, get the tax result out.
 *
 * These helpers aggregate transactions into a turnover figure and run the existing
 * simulator / optimizer on it — so a user who connected their data never types a CA.
 */
import { compare } from '../engine/compare.js'
import type { CompareInput, Comparison } from '../engine/compare.js'
import { simulate } from '../engine/simulate.js'
import type { SimulationInput, SimulationResult } from '../engine/types.js'

import { aggregateTurnover } from './aggregate.js'
import type { AggregateOptions, Transaction, TurnoverSummary } from './types.js'

/** Options for {@link simulateFromTransactions}: a simulation input without `revenue`, plus how to aggregate. */
export type SimulateFromTransactionsOptions = Omit<SimulationInput, 'revenue'> & AggregateOptions

/** Options for {@link compareFromTransactions}: a comparison input without `revenue`, plus how to aggregate. */
export type CompareFromTransactionsOptions = Omit<CompareInput, 'revenue'> & AggregateOptions

export interface SimulateFromTransactionsResult {
  /** How the turnover was derived from the transactions (transparency). */
  summary: TurnoverSummary
  /** The simulation run on that turnover. */
  simulation: SimulationResult
}

export interface CompareFromTransactionsResult {
  summary: TurnoverSummary
  comparison: Comparison
}

/** Aggregates transactions into a CA, then runs {@link simulate}. */
export function simulateFromTransactions(
  transactions: Transaction[],
  options: SimulateFromTransactionsOptions,
): SimulateFromTransactionsResult {
  const { year, currency, ...simInput } = options
  const summary = aggregateTurnover(transactions, { ...(year !== undefined ? { year } : {}), ...(currency !== undefined ? { currency } : {}) })
  const simulation = simulate({ ...simInput, revenue: summary.revenue })
  return { summary, simulation }
}

/** Aggregates transactions into a CA, then runs {@link compare}. */
export function compareFromTransactions(
  transactions: Transaction[],
  options: CompareFromTransactionsOptions,
): CompareFromTransactionsResult {
  const { year, currency, ...compareInput } = options
  const summary = aggregateTurnover(transactions, { ...(year !== undefined ? { year } : {}), ...(currency !== undefined ? { currency } : {}) })
  const comparison = compare({ ...compareInput, revenue: summary.revenue })
  return { summary, comparison }
}
