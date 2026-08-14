/**
 * Multi-year projection of the identified optimisations.
 *
 * The advisors quantify each optimisation as a **yearly** euro gain. This projects the top
 * scenarios over a horizon (1…X years) so the user sees the cumulative effect — "this lever
 * saves X per year → Y over 5 years". The model is deliberately simple and honest: a constant
 * yearly gain, repeated (no assumed growth or discounting), so the figure stays a transparent
 * "à conditions constantes" estimate rather than a false forecast.
 */
import { round2 } from './shared.js'
import type { Advice } from './types.js'

/** One optimisation projected over the horizon. */
export interface ProjectedScenario {
  id: string
  title: string
  /** Annual gain (from the advice's estimatedGain). */
  yearlyGain: number
  /** Cumulative gain at the end of each year: index 0 = year 1, etc. */
  cumulative: number[]
  /** Cumulative gain over the whole horizon. */
  totalOverHorizon: number
}

export interface Projection {
  horizonYears: number
  /** Milestone years to highlight (within the horizon), e.g. [1, 3, 5]. */
  milestones: number[]
  scenarios: ProjectedScenario[]
  /** Combined cumulative gain across all scenarios, per year. */
  combinedCumulative: number[]
  /** Combined gain over the whole horizon. */
  combinedTotal: number
}

/** Default milestone years, clamped to the horizon. */
function milestonesFor(horizon: number): number[] {
  return [1, 3, 5].filter((y) => y <= horizon)
}

/**
 * Projects the top optimisations (by yearly gain) over `horizonYears`.
 *
 * @param advice        the advice list (only `optimisation` items with a positive gain are used)
 * @param horizonYears  number of years to project (default 5, clamped to ≥ 1)
 * @param topN          how many scenarios to keep (default 4)
 */
export function projectAdvice(advice: Advice[], horizonYears = 5, topN = 4): Projection {
  const horizon = Math.max(1, Math.floor(horizonYears))
  const scenarios: ProjectedScenario[] = advice
    .filter((a) => a.kind === 'optimisation' && (a.estimatedGain ?? 0) > 0)
    .sort((a, b) => (b.estimatedGain ?? 0) - (a.estimatedGain ?? 0))
    .slice(0, topN)
    .map((a) => {
      const yearlyGain = round2(a.estimatedGain ?? 0)
      const cumulative = Array.from({ length: horizon }, (_, i) => round2(yearlyGain * (i + 1)))
      return {
        id: a.id,
        title: a.title,
        yearlyGain,
        cumulative,
        totalOverHorizon: cumulative[horizon - 1] ?? 0,
      }
    })

  const combinedCumulative = Array.from({ length: horizon }, (_, i) =>
    round2(scenarios.reduce((sum, s) => sum + (s.cumulative[i] ?? 0), 0)),
  )

  return {
    horizonYears: horizon,
    milestones: milestonesFor(horizon),
    scenarios,
    combinedCumulative,
    combinedTotal: combinedCumulative[horizon - 1] ?? 0,
  }
}
