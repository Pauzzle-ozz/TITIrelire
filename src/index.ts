/**
 * TITI'relire — a small, honest tool for your money.
 *
 * Public entry point of the library. The V1 scope is a transparent, local-first
 * tax simulator for French micro-entrepreneurs (see README and CLAUDE.md).
 *
 * Modules are added segment by segment; this file re-exports the stable surface.
 */

/** Canonical, human-facing project name. */
export const NAME = "TITI'relire" as const

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

// ── Additional fiscal profiles ────────────────────────────────────────────────
export type { TaxBracket } from './engine/bareme.js'
export { BAREME_IR_2026, impotBareme, impotMarginal } from './engine/bareme.js'

export type {
  ParticulierInput,
  ParticulierInputNormalized,
  ParticulierResult,
  PerComparison,
} from './engine/particulier.js'
export {
  simulateParticulier,
  comparePER,
  normalizeParticulier,
  perPlafond,
} from './engine/particulier.js'

export type {
  SocieteInput,
  SocieteInputNormalized,
  SocieteResult,
  DividendMode,
  DividendComparison,
} from './engine/societe.js'
export {
  impotSocietes,
  simulateSociete,
  compareDividendes,
  normalizeSociete,
} from './engine/societe.js'

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
export type { BridgeConfig } from './transactions/connectors/bridge.js'
export { BridgeConnector } from './transactions/connectors/bridge.js'
export type { ConnectorName, CliDeps } from './transactions/connectors/runner.js'
export {
  CONNECTORS,
  buildConnector,
  runConnector,
  configFromEnv,
  cliMain,
} from './transactions/connectors/runner.js'

export type { CsvMapping, CsvOptions, CsvPreset } from './transactions/import/csv.js'
export { importCsv, importCsvWithPreset, CSV_PRESETS } from './transactions/import/csv.js'

export { parseFacturX, importFacturX } from './transactions/import/facturx.js'

// ── Personal space (encrypted local vault) ────────────────────────────────────
export type { VaultState, VaultProfile, ProfileInputs } from './vault/types.js'
export { SCHEMA_VERSION, emptyVaultState, isVaultProfile } from './vault/types.js'
export type { CryptoDeps, Envelope } from './vault/crypto.js'
export {
  encryptString,
  decryptString,
  encryptJson,
  decryptJson,
  defaultCryptoDeps,
} from './vault/crypto.js'
export type { VaultStorage, WebStorageLike } from './vault/storage.js'
export {
  MemoryVaultStorage,
  WebVaultStorage,
  DEFAULT_STORAGE_KEY,
} from './vault/storage.js'
export { Vault, migrate } from './vault/vault.js'
