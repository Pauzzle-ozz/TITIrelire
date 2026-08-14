/**
 * Learned overrides — the memory that makes classification personal.
 *
 * When the user corrects a transaction's category, we remember it keyed by a stable
 * signature of that transaction, so the next similar movement is classified the same way
 * without asking again. Learned rules outrank every seed rule in the cascade.
 *
 * The strongest key is the **counterparty** (a client, a merchant); when it is missing we
 * fall back to a **label signature** (the label, accent-normalized, with digits and
 * punctuation stripped) — fuzzier, but still useful. Everything here is pure JSON so it
 * persists inside the vault; {@link coerceLearnedRules} validates it on the way back in.
 */
import { normalizeText } from './rules.js'
import type { Classification, TxCategory } from './types.js'
import type { Transaction } from '../transactions/types.js'

/** One remembered correction. */
export interface LearnedRule {
  category: TxCategory
  /** ISO datetime of the correction (injected — no hidden clock). */
  updatedAt: string
}

/** All remembered corrections, keyed by transaction signature. */
export type LearnedRules = Record<string, LearnedRule>

/** Reduces a label to a stable signature: letters and spaces only, collapsed. */
function labelSignature(label: string): string {
  return normalizeText(label)
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Derives the learning key for a transaction: `cp:<counterparty>` when a counterparty is
 * known, else `label:<signature>`. Returns `null` when neither yields anything meaningful
 * (nothing to remember).
 */
export function learningKey(tx: Transaction): string | null {
  const cp = normalizeText(tx.counterparty ?? '')
  if (cp !== '') return `cp:${cp}`
  const sig = labelSignature(tx.label)
  return sig !== '' ? `label:${sig}` : null
}

/**
 * Records a correction, returning a **new** map (immutable). If the transaction has no
 * derivable key, the map is returned unchanged (the correction cannot be generalized).
 */
export function recordCorrection(
  learned: LearnedRules,
  tx: Transaction,
  category: TxCategory,
  now: string,
): LearnedRules {
  const key = learningKey(tx)
  if (key === null) return learned
  return { ...learned, [key]: { category, updatedAt: now } }
}

/** Removes any learned rule matching this transaction, returning a new map. */
export function forgetCorrection(learned: LearnedRules, tx: Transaction): LearnedRules {
  const key = learningKey(tx)
  if (key === null || !(key in learned)) return learned
  const next = { ...learned }
  delete next[key]
  return next
}

/** Looks up a learned rule for a transaction, if any. */
export function lookupLearned(learned: LearnedRules, tx: Transaction): LearnedRule | undefined {
  const key = learningKey(tx)
  return key === null ? undefined : learned[key]
}

/**
 * Returns the classification implied by a learned rule (confidence 1, `source: 'learned'`),
 * or `null` when nothing was remembered for this transaction.
 */
export function applyLearned(learned: LearnedRules, tx: Transaction): Classification | null {
  const hit = lookupLearned(learned, tx)
  if (hit === undefined) return null
  return {
    category: hit.category,
    confidence: 1,
    source: 'learned',
    ruleId: 'learned',
    reason: 'Votre choix mémorisé',
  }
}

const CATEGORIES: ReadonlySet<string> = new Set<TxCategory>(['pro', 'perso', 'unknown'])

/**
 * Validates untrusted learned rules loaded from the vault, keeping only well-formed entries.
 * Unknown keys, bad categories or missing timestamps are dropped rather than trusted.
 */
export function coerceLearnedRules(value: unknown): LearnedRules {
  if (typeof value !== 'object' || value === null) return {}
  const out: LearnedRules = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const { category, updatedAt } = raw as Partial<LearnedRule>
    if (typeof category === 'string' && CATEGORIES.has(category) && typeof updatedAt === 'string') {
      out[key] = { category: category as TxCategory, updatedAt }
    }
  }
  return out
}
