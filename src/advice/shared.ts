/**
 * Shared helpers for the per-profile advisors (micro, particulier, société).
 *
 * Keeps euro formatting, ordering and the indicative total in one place so every advisor
 * produces a consistent {@link Advice} list. Advisors themselves reuse the fiscal engine for
 * the actual figures — nothing here recomputes tax.
 */
import type { Advice } from './types.js'

/** Rounds to the cent, avoiding binary-float artefacts. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Formats an amount as a French euro string (e.g. `1 234,5 €`). */
export function eur(amount: number): string {
  return `${round2(amount).toLocaleString('fr-FR')} €`
}

const KIND_RANK: Record<Advice['kind'], number> = { optimisation: 0, alerte: 1, info: 2 }

/** Orders optimisations → alertes → info, then by decreasing euro gain within a kind. */
export function sortAdvice(advice: Advice[]): Advice[] {
  return [...advice].sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind]
    if (byKind !== 0) return byKind
    return (b.estimatedGain ?? 0) - (a.estimatedGain ?? 0)
  })
}

/**
 * Indicative sum of the identified optimisation gains (euros/year). Levers can overlap, so
 * this is an upper-bound headline, not a guaranteed cumulative total — the UI frames it as
 * "jusqu'à".
 */
export function totalEstimatedGain(advice: Advice[]): number {
  return round2(
    advice
      .filter((a) => a.kind === 'optimisation')
      .reduce((sum, a) => sum + (a.estimatedGain ?? 0), 0),
  )
}
