/**
 * Declarative rule set for pro/perso classification.
 *
 * Rules are ordered and **first-match-wins**. Two tiers:
 *  - **deterministic** (`source: 'rule'`, high confidence) — unambiguous French markers such
 *    as URSSAF contributions or a salary credit;
 *  - **heuristic** (`source: 'heuristic'`, lower confidence) — soft signals (a supermarket
 *    name) that are probably right but should be easy to override.
 *
 * This seed set is deliberately **small and honest, not exhaustive**: when nothing matches
 * the cascade returns `unknown` rather than guessing. Coverage grows two ways — by adding
 * rules here, and by the user's own corrections becoming {@link ./learned.js learned rules}
 * that outrank everything below.
 */
import { direction, type Transaction, type TransactionDirection } from '../transactions/types.js'
import type { TxCategory } from './types.js'

/** Lowercased, accent-stripped text used for matching (stable across "Éléctricité"/"electricite"). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** The normalized view a rule matches against. */
export interface RuleContext {
  /** `label` + `counterparty`, normalized and space-joined. */
  text: string
  /** Money in or out (some rules only make sense in one direction). */
  direction: TransactionDirection
  /** Signed amount, for amount-aware rules. */
  amount: number
}

/** Builds the {@link RuleContext} for a transaction. */
export function ruleContext(tx: Transaction): RuleContext {
  const text = normalizeText(`${tx.label} ${tx.counterparty ?? ''}`)
  return { text, direction: direction(tx), amount: tx.amount }
}

/** One classification rule. */
export interface ClassificationRule {
  id: string
  category: TxCategory
  confidence: number
  source: 'rule' | 'heuristic'
  /** Short French explanation shown to the user. */
  reason: string
  /** Whether this rule applies to the given context. */
  match(ctx: RuleContext): boolean
}

/** Confidence for unambiguous, deterministic markers. */
const DETERMINISTIC = 0.95
/** Confidence for soft heuristics (probably right, easy to override). */
const HEURISTIC = 0.6

/** Helper: a rule that fires when any of `keywords` appears in the normalized text. */
function keywordRule(
  id: string,
  category: TxCategory,
  source: 'rule' | 'heuristic',
  reason: string,
  keywords: readonly string[],
): ClassificationRule {
  const needles = keywords.map(normalizeText)
  return {
    id,
    category,
    source,
    confidence: source === 'rule' ? DETERMINISTIC : HEURISTIC,
    reason,
    match: (ctx) => needles.some((needle) => ctx.text.includes(needle)),
  }
}

/**
 * The ordered seed rules. Deterministic markers come first so they win over heuristics.
 * Each `reason` is user-facing French.
 */
export const RULES: readonly ClassificationRule[] = [
  // ── Deterministic: professional ────────────────────────────────────────────
  keywordRule('urssaf', 'pro', 'rule', 'Cotisations sociales (URSSAF)', ['urssaf']),
  keywordRule('social-retraite', 'pro', 'rule', 'Cotisation sociale/retraite (SSI/CIPAV)', [
    'cipav',
    'ssi',
    'rsi',
    'carpimko',
    'cotisation retraite',
  ]),
  keywordRule('tva', 'pro', 'rule', 'TVA', ['tva', 'acompte tva']),
  keywordRule('cfe', 'pro', 'rule', 'Cotisation foncière des entreprises (CFE)', ['cfe', 'cotisation fonciere']),

  // ── Deterministic: personal ────────────────────────────────────────────────
  keywordRule('salaire', 'perso', 'rule', 'Salaire', ['salaire', 'bulletin de paie', 'paie ', 'rem. salaire']),
  keywordRule('impot-revenu', 'perso', 'rule', 'Impôt sur le revenu / prélèvement à la source', [
    'impot sur le revenu',
    'prelevement a la source',
    'prlv sepa dgfip impot revenu',
  ]),
  keywordRule('prestation-sociale', 'perso', 'rule', 'Prestation sociale (CAF/allocations)', [
    'caf ',
    'allocation',
    'allocations familiales',
    'apl',
  ]),
  keywordRule('france-travail', 'perso', 'rule', 'Indemnités France Travail', ['pole emploi', 'france travail']),
  keywordRule('assurance-maladie', 'perso', 'rule', 'Remboursement assurance maladie', ['cpam', 'assurance maladie', 'ameli']),

  // ── Heuristic: probably personal ───────────────────────────────────────────
  keywordRule('supermarche', 'perso', 'heuristic', 'Achat en supermarché (probablement personnel)', [
    'carrefour',
    'leclerc',
    'auchan',
    'lidl',
    'intermarche',
    'monoprix',
    'franprix',
    'super u',
    'casino',
  ]),
  keywordRule('restauration', 'perso', 'heuristic', 'Restauration (probablement personnel)', [
    'uber eats',
    'deliveroo',
    'mcdonald',
    'restaurant',
  ]),
]
