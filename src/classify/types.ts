/**
 * Pro/perso classification model.
 *
 * Every canonical {@link Transaction} can be tagged as **professional** or **personal** (or
 * left **unknown**) so the fiscal engine only ever counts what belongs to the business — a
 * micro-entrepreneur's turnover is professional income, not the salary or refund that lands
 * on the same account.
 *
 * The tag is never a black box: each {@link Classification} carries a human-readable French
 * `reason` and the `ruleId` that produced it, so the user can see *why* and correct it. A
 * correction then becomes a {@link ../classify/learned.js learned rule} that wins next time.
 */
import type { Transaction } from '../transactions/types.js'

/** Whether a movement belongs to the business, the person, or is not yet decided. */
export type TxCategory = 'pro' | 'perso' | 'unknown'

/** Where a classification came from, in increasing authority. */
export type ClassificationSource = 'default' | 'heuristic' | 'rule' | 'learned'

/** The explainable verdict attached to a transaction. */
export interface Classification {
  /** The assigned category. */
  category: TxCategory
  /** Confidence in [0, 1] — 1 for a user correction, lower for a soft heuristic. */
  confidence: number
  /** Which layer decided (default < heuristic < rule < learned). */
  source: ClassificationSource
  /** Stable identifier of the rule/heuristic that fired (or `'none'`). */
  ruleId: string
  /** Short French explanation shown to the user (e.g. "Cotisations URSSAF"). */
  reason: string
}

/** A transaction with its (mutable-by-correction) classification. */
export interface ClassifiedTransaction {
  transaction: Transaction
  classification: Classification
}

/** The verdict used when nothing matched: unknown, zero confidence. */
export const UNCLASSIFIED: Classification = {
  category: 'unknown',
  confidence: 0,
  source: 'default',
  ruleId: 'none',
  reason: 'Non catégorisé',
}
