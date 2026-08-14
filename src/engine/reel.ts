/**
 * Régime réel (BIC/BNC) simulation, and the micro-vs-réel comparison.
 *
 * The **structure is exact**: résultat = produits − charges déductibles, then social
 * contributions (deductible), then income tax on the remaining professional income, then the
 * net kept. The **one estimated part is the TNS social-contribution rate**: the precise 2026
 * barème (post social-assiette reform) is complex and in flux, so it is modelled as a single
 * documented effective rate, clearly surfaced as an *estimation* — never as a firm figure.
 *
 * This unlocks the answer to "micro or réel?": when real charges exceed the micro abattement,
 * the réel régime can keep more — {@link compareMicroReel} quantifies it.
 */
import { impotMarginal, round2 } from './bareme.js'
import { compare, type CompareInput } from './compare.js'
import type { ActivityType, LineItem, Warning } from './types.js'

/**
 * Estimated effective TNS social-contribution rate on the net professional result (réel),
 * order of magnitude for artisans/commerçants/libéraux non réglementés. **Estimate**, pending
 * the exact 2026 barème (URSSAF social-assiette reform). Isolated here so it is easy to refine.
 */
export const ESTIMATED_TNS_RATE = 0.45

export interface ReelInput {
  /** Professional income (recettes / CA). */
  produits: number
  /** Deductible business charges (excluding social contributions). */
  charges: number
  /** Activity (for labelling; the estimated TNS rate is currently activity-agnostic). */
  activity?: ActivityType
  /** Tax-household parts. Default 1. */
  parts?: number
  /** Couple (joint filing) — base parts 2 for décote/plafonnement. Default false. */
  couple?: boolean
  /** Other household taxable income, added before the scale. Default 0. */
  autresRevenus?: number
}

export interface ReelResult {
  produits: number
  charges: number
  /** produits − charges (before social contributions). */
  resultatAvantCotisations: number
  /** Estimated TNS social contributions (deductible). */
  cotisationsSociales: LineItem
  /** Professional income subject to income tax (result − deductible contributions). */
  revenuImposable: number
  /** Income tax attributable to that professional income. */
  incomeTax: number
  /** Net kept: result − contributions − income tax. */
  net: number
  breakdown: LineItem[]
  warnings: Warning[]
}

function eur(amount: number): string {
  return `${round2(amount).toLocaleString('fr-FR')} €`
}

/** Simulates the régime réel for a professional income and its real charges. */
export function simulateReel(input: ReelInput): ReelResult {
  const parts = input.parts ?? 1
  if (!Number.isFinite(input.produits) || input.produits < 0) throw new RangeError('produits must be >= 0')
  if (!Number.isFinite(input.charges) || input.charges < 0) throw new RangeError('charges must be >= 0')
  if (!Number.isFinite(parts) || parts < 1) throw new RangeError('parts must be >= 1')
  const autresRevenus = input.autresRevenus ?? 0

  const resultatAvantCotisations = round2(input.produits - input.charges)
  const base = Math.max(0, resultatAvantCotisations)
  const cotisationsAmount = round2(base * ESTIMATED_TNS_RATE)
  const cotisationsSociales: LineItem = {
    key: 'cotisations_sociales',
    label: 'Cotisations sociales TNS (estimation)',
    amount: cotisationsAmount,
    base,
    rate: ESTIMATED_TNS_RATE,
    detail:
      `Estimation : ${eur(base)} × ${(ESTIMATED_TNS_RATE * 100).toFixed(0)} % — taux effectif ` +
      `approximatif (barème 2026 exact non figé, réforme de l'assiette sociale).`,
  }

  const revenuImposable = round2(Math.max(0, resultatAvantCotisations - cotisationsAmount))
  const incomeTax = impotMarginal(autresRevenus, revenuImposable, parts, input.couple ? 2 : 1)
  const net = round2(resultatAvantCotisations - cotisationsAmount - incomeTax)

  const incomeTaxLine: LineItem = {
    key: 'impot_revenu',
    label: 'Impôt sur le revenu (barème progressif)',
    amount: incomeTax,
    base: revenuImposable,
    detail: `Barème 2026 sur ${eur(revenuImposable)} de revenu professionnel (${parts} part(s))`,
  }

  return {
    produits: round2(input.produits),
    charges: round2(input.charges),
    resultatAvantCotisations,
    cotisationsSociales,
    revenuImposable,
    incomeTax,
    net,
    breakdown: [cotisationsSociales, incomeTaxLine],
    warnings: [
      {
        code: 'tns_estimation',
        level: 'info',
        message:
          'Les cotisations TNS au réel sont estimées (taux effectif). La réforme 2026 de ' +
          "l'assiette sociale peut modifier le montant exact — à confirmer avec l'URSSAF.",
      },
    ],
  }
}

/** How micro compares to réel: which régime keeps more, and by how much. */
export interface MicroReelComparison {
  /** Best micro net (versement libératoire vs barème, whichever wins). */
  microNet: number
  /** Réel net (with estimated TNS contributions). */
  reelNet: number
  /** 'micro' | 'reel' — the one keeping the most net (ties go to micro for its simplicity). */
  recommended: 'micro' | 'reel'
  /** Net advantage of the recommended régime (euros, ≥ 0). */
  netGain: number
  reel: ReelResult
  explanation: string
}

/**
 * Compares micro (flat abattement) with réel (real charges), returning the régime that keeps
 * the most net. Uses {@link compare} for the best micro option and {@link simulateReel} for
 * réel (TNS estimated). `charges` are the real deductible charges — when they exceed the micro
 * abattement, réel usually wins.
 */
export function compareMicroReel(
  microInput: CompareInput,
  charges: number,
): MicroReelComparison {
  const microComparison = compare(microInput)
  const microGrossNet =
    microComparison.recommended === 'versement_liberatoire'
      ? microComparison.versementLiberatoire.netIncome
      : microComparison.bareme.netIncome
  // Fair "money in pocket" comparison: a micro-entrepreneur cannot deduct charges but still
  // pays them, so subtract the real charges from the micro net. Réel net is already net of them.
  const microNet = round2(microGrossNet - charges)

  const reel = simulateReel({
    produits: microInput.revenue,
    charges,
    ...(microInput.activity !== undefined ? { activity: microInput.activity } : {}),
    ...(microInput.parts !== undefined ? { parts: microInput.parts } : {}),
    ...(microInput.otherHouseholdTaxableIncome !== undefined
      ? { autresRevenus: microInput.otherHouseholdTaxableIncome }
      : {}),
  })

  const reelWins = reel.net > microNet
  const recommended = reelWins ? 'reel' : 'micro'
  const netGain = round2(Math.abs(reel.net - microNet))
  const explanation = reelWins
    ? `Avec ${eur(charges)} de charges réelles, le régime réel garderait ${eur(netGain)} de plus ` +
      `que le micro (cotisations TNS estimées).`
    : `Le régime micro reste plus avantageux (${eur(netGain)} de plus) : vos charges réelles ` +
      `(${eur(charges)}) ne dépassent pas assez l'abattement forfaitaire.`

  return { microNet: round2(microNet), reelNet: reel.net, recommended, netGain, reel, explanation }
}
