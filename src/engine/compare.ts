/**
 * Optimisation comparator — the "advice" layer.
 *
 * The single most valuable question a micro-entrepreneur asks is: *should I opt
 * for the versement libératoire, or stay on the progressive scale?* This module
 * answers it transparently: it runs the exact same situation both ways, compares
 * the net income, and explains — in euros — which one wins and why.
 */
import { simulate } from './simulate.js'
import type {
  IncomeTaxMode,
  NormalizedInput,
  SimulationInput,
  SimulationResult,
  Warning,
} from './types.js'

/** Input for a comparison: a simulation input with the tax mode left open. */
export type CompareInput = Omit<SimulationInput, 'versementLiberatoire'>

/** One side of the comparison, with its headline figures and full detail. */
export interface ComparisonOption {
  mode: IncomeTaxMode
  /** Income tax under this mode (euros). */
  incomeTax: number
  /** All levies under this mode (euros). */
  totalLevies: number
  /** Net income under this mode (euros). */
  netIncome: number
  /** The full, transparent simulation behind these figures. */
  result: SimulationResult
}

/** Result of comparing the two income-tax modes. */
export interface Comparison {
  input: NormalizedInput
  bareme: ComparisonOption
  versementLiberatoire: ComparisonOption
  /** The mode that maximises net income (ties go to the barème). */
  recommended: IncomeTaxMode
  /** How much more net income the recommended mode keeps vs the other (euros, ≥ 0). */
  netGain: number
  /** French, user-facing explanation of the recommendation. */
  explanation: string
  /** Caveats to weigh alongside the recommendation. */
  warnings: Warning[]
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function eur(amount: number): string {
  return `${round2(amount).toString().replace('.', ',')} €`
}

function toOption(result: SimulationResult): ComparisonOption {
  return {
    mode: result.incomeTaxMode,
    incomeTax: result.incomeTax.amount,
    totalLevies: result.totalLevies,
    netIncome: result.netIncome,
    result,
  }
}

/**
 * Compares the versement libératoire against the progressive scale for the same
 * situation, and recommends the mode that keeps the most net income.
 *
 * @throws RangeError on invalid input (see {@link simulate}).
 */
export function compare(raw: CompareInput): Comparison {
  const baremeResult = simulate({ ...raw, versementLiberatoire: false })
  const vlResult = simulate({ ...raw, versementLiberatoire: true })

  const bareme = toOption(baremeResult)
  const versementLiberatoire = toOption(vlResult)

  const vlWins = versementLiberatoire.netIncome > bareme.netIncome
  const recommended: IncomeTaxMode = vlWins ? 'versement_liberatoire' : 'bareme'
  const netGain = round2(Math.abs(versementLiberatoire.netIncome - bareme.netIncome))

  const winner = vlWins ? versementLiberatoire : bareme
  const loser = vlWins ? bareme : versementLiberatoire
  const winnerLabel = vlWins ? 'le versement libératoire' : 'le barème progressif'
  const loserLabel = vlWins ? 'le barème progressif' : 'le versement libératoire'

  const explanation =
    netGain === 0
      ? `Les deux options donnent le même revenu net (${eur(winner.netIncome)}). ` +
        'Le barème progressif est retenu par défaut, car il ne requiert pas de condition d’éligibilité.'
      : `Avec ${winnerLabel}, vous conservez ${eur(netGain)} de plus qu’avec ${loserLabel} ` +
        `(impôt sur le revenu : ${eur(winner.incomeTax)} contre ${eur(loser.incomeTax)}).`

  // Both options are displayed, so surface every option's caveats (deduped by code) —
  // e.g. the VL eligibility condition must show even when the barème is recommended.
  const seen = new Set<string>()
  const warnings = [...baremeResult.warnings, ...vlResult.warnings].filter((w) =>
    seen.has(w.code) ? false : (seen.add(w.code), true),
  )

  return {
    input: baremeResult.input,
    bareme,
    versementLiberatoire,
    recommended,
    netGain,
    explanation,
    warnings,
  }
}
