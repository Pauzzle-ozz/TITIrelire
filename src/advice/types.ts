/**
 * Advice model — the transparent "optimisation" layer.
 *
 * Posture: **information and transparent simulation, not prescriptive advice**. Every piece
 * of {@link Advice} is either quantified in euros (traced to a real simulation) or clearly an
 * alert/informational note — never a vague tip. A `ruleRef` points at the rule/parameter
 * behind the figure so the user can audit it.
 */

/** The nature of a piece of advice. */
export type AdviceKind =
  /** A quantified opportunity to keep more money. */
  | 'optimisation'
  /** A threshold or risk the user should be aware of. */
  | 'alerte'
  /** Neutral, contextual information (no euro figure). */
  | 'info'

/** One transparent recommendation. */
export interface Advice {
  /** Stable identifier. */
  id: string
  kind: AdviceKind
  /** Short French headline. */
  title: string
  /** French explanation, traceable to a calculation or rule. */
  detail: string
  /** Estimated yearly gain in euros, when quantifiable (optimisations only). */
  estimatedGain?: number
  /** The rule/parameter the figure comes from, for auditability. */
  ruleRef?: string
}
