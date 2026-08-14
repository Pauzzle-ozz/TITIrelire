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

export { normalize, simulate, microThresholds } from './engine/simulate.js'
export type { MicroThresholds } from './engine/simulate.js'

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

// ── Pro/perso classification ──────────────────────────────────────────────────
export type {
  TxCategory,
  ClassificationSource,
  Classification,
  ClassifiedTransaction,
} from './classify/types.js'
export { UNCLASSIFIED } from './classify/types.js'
export type { ClassificationRule, RuleContext } from './classify/rules.js'
export { RULES, normalizeText, ruleContext } from './classify/rules.js'
export type { LearnedRule, LearnedRules } from './classify/learned.js'
export {
  learningKey,
  recordCorrection,
  forgetCorrection,
  lookupLearned,
  applyLearned,
  coerceLearnedRules,
} from './classify/learned.js'
export { classifyTransaction, classifyAll } from './classify/classify.js'
export type { CategoryTotals, ClassifiedSummary } from './classify/aggregate.js'
export { aggregateByCategory, proRevenue } from './classify/aggregate.js'

// ── TVA (régime + estimate) ───────────────────────────────────────────────────
export type { TvaInput, TvaStatus, TvaRegime } from './engine/tva.js'
export { tvaStatus, TVA_TAUX_NORMAL } from './engine/tva.js'

// ── Régime réel (BIC/BNC) + micro-vs-réel ─────────────────────────────────────
export type { ReelInput, ReelResult, MicroReelComparison } from './engine/reel.js'
export { simulateReel, compareMicroReel, ESTIMATED_TNS_RATE } from './engine/reel.js'

// ── Accounting (ledger / compte de résultat) ──────────────────────────────────
export type { ChargeCategory, ProduitCategory, LedgerLine, Ledger } from './accounting/ledger.js'
export {
  buildLedger,
  chargeCategory,
  produitCategory,
  CHARGE_LABELS,
  PRODUIT_LABELS,
} from './accounting/ledger.js'

// ── Advice engine (transparent optimisation) ──────────────────────────────────
export type { Advice, AdviceKind } from './advice/types.js'
export { totalEstimatedGain } from './advice/shared.js'
export { adviseMicro } from './advice/micro.js'
export { adviseParticulier } from './advice/particulier.js'
export { adviseSociete } from './advice/societe.js'
export type { Projection, ProjectedScenario } from './advice/projection.js'
export { projectAdvice } from './advice/projection.js'
