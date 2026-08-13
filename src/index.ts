/**
 * TI'TIrelire — a small, honest tool for your money.
 *
 * Public entry point of the library. The V1 scope is a transparent, local-first
 * tax simulator for French micro-entrepreneurs (see README and CLAUDE.md).
 *
 * Modules are added segment by segment; this file re-exports the stable surface.
 */

/** Canonical, human-facing project name. */
export const NAME = "TI'TIrelire" as const

/** Library version, kept in sync with package.json. */
export const VERSION = '0.1.0' as const

export type {
  ActivityType,
  IncomeTaxMode,
  LineItem,
  NormalizedInput,
  SimulationInput,
  SimulationResult,
  Warning,
  WarningLevel,
} from './engine/types.js'

export { normalize, simulate } from './engine/simulate.js'

export type {
  Comparison,
  ComparisonOption,
  CompareInput,
} from './engine/compare.js'

export { compare } from './engine/compare.js'

// ── Data connection layer ─────────────────────────────────────────────────────
export type {
  Transaction,
  RawTransaction,
  TransactionDirection,
  AggregateOptions,
  TurnoverSummary,
} from './transactions/types.js'

export { direction } from './transactions/types.js'
export { normalizeTransaction, normalizeAll } from './transactions/normalize.js'
export { aggregateTurnover } from './transactions/aggregate.js'

export type {
  SimulateFromTransactionsOptions,
  CompareFromTransactionsOptions,
  SimulateFromTransactionsResult,
  CompareFromTransactionsResult,
} from './transactions/from-transactions.js'

export {
  simulateFromTransactions,
  compareFromTransactions,
} from './transactions/from-transactions.js'

export type {
  FetchRange,
  HttpClient,
  HttpResponse,
  TransactionSource,
} from './transactions/connectors/types.js'
export { defaultHttpClient } from './transactions/connectors/types.js'
export type { StripeConfig } from './transactions/connectors/stripe.js'
export { StripeConnector } from './transactions/connectors/stripe.js'

export type { CsvMapping, CsvOptions, CsvPreset } from './transactions/import/csv.js'
export { importCsv, importCsvWithPreset, CSV_PRESETS } from './transactions/import/csv.js'
