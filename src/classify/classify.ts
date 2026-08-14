/**
 * The classification cascade — the single entry point that turns a transaction into an
 * explainable {@link ClassifiedTransaction}.
 *
 * Order of authority (first hit wins):
 *   1. **learned** — the user's own remembered corrections ({@link ./learned.js});
 *   2. **rules** — the ordered seed rule set ({@link ./rules.js}), deterministic then heuristic;
 *   3. **default** — {@link UNCLASSIFIED} (`unknown`) when nothing matched — honest over a guess.
 */
import { applyLearned, type LearnedRules } from './learned.js'
import { RULES, ruleContext } from './rules.js'
import { UNCLASSIFIED, type ClassifiedTransaction } from './types.js'
import type { Transaction } from '../transactions/types.js'

/** Classifies one transaction against the learned rules, then the seed rules. */
export function classifyTransaction(
  tx: Transaction,
  learned: LearnedRules = {},
): ClassifiedTransaction {
  const learnedVerdict = applyLearned(learned, tx)
  if (learnedVerdict !== null) return { transaction: tx, classification: learnedVerdict }

  const ctx = ruleContext(tx)
  for (const rule of RULES) {
    if (rule.match(ctx)) {
      return {
        transaction: tx,
        classification: {
          category: rule.category,
          confidence: rule.confidence,
          source: rule.source,
          ruleId: rule.id,
          reason: rule.reason,
        },
      }
    }
  }
  return { transaction: tx, classification: UNCLASSIFIED }
}

/** Classifies a batch, preserving order. */
export function classifyAll(
  transactions: Transaction[],
  learned: LearnedRules = {},
): ClassifiedTransaction[] {
  return transactions.map((tx) => classifyTransaction(tx, learned))
}
