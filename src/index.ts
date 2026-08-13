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
