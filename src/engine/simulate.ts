/**
 * Simulation engine: turns a {@link SimulationInput} into a transparent
 * {@link SimulationResult}, using the publicodes rule base in `rules.ts`.
 *
 * The engine is instantiated once and reused; each call fully re-sets the
 * situation, so results never leak between calls.
 */
import Engine from 'publicodes'
import { parse } from 'yaml'

import { RULES_YAML } from './rules.js'
import type {
  ActivityType,
  LineItem,
  NormalizedInput,
  SimulationInput,
  SimulationResult,
  Warning,
} from './types.js'

/** Maps the public activity keys to the internal publicodes enumeration values. */
const ACTIVITE_PUBLICODES: Record<ActivityType, string> = {
  vente_marchandises: "'vente'",
  prestations_bic: "'service BIC'",
  prestations_bnc: "'service BNC'",
  liberal_cipav: "'libéral CIPAV'",
}

const VALID_ACTIVITIES: ReadonlySet<string> = new Set<ActivityType>([
  'vente_marchandises',
  'prestations_bic',
  'prestations_bnc',
  'liberal_cipav',
])

// A single silent engine instance shared across simulations. publicodes logs
// evaluation notes to its logger; we keep it quiet since we surface our own,
// user-facing warnings instead.
const engine = new Engine(parse(RULES_YAML) as ConstructorParameters<typeof Engine>[0], {
  logger: { log: () => {}, warn: () => {}, error: () => {} },
})

/** Rounds to the cent, avoiding binary-float artefacts (e.g. 6149.999999). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Evaluates a rule and returns its numeric value (0 for null/undefined). */
function evNumber(rule: string): number {
  const value = engine.evaluate(rule).nodeValue
  return typeof value === 'number' ? value : 0
}

/** Evaluates a rule and returns its boolean value. */
function evBool(rule: string): boolean {
  return engine.evaluate(rule).nodeValue === true
}

/** Validates and fills in defaults; throws on nonsensical input. */
export function normalize(raw: SimulationInput): NormalizedInput {
  if (!VALID_ACTIVITIES.has(raw.activity)) {
    throw new RangeError(`Unknown activity: ${String(raw.activity)}`)
  }
  if (!Number.isFinite(raw.revenue) || raw.revenue < 0) {
    throw new RangeError('revenue must be a finite number ≥ 0')
  }
  const parts = raw.parts ?? 1
  if (!Number.isFinite(parts) || parts < 1) {
    throw new RangeError('parts must be a finite number ≥ 1')
  }
  const otherIncome = raw.otherHouseholdTaxableIncome ?? 0
  if (!Number.isFinite(otherIncome) || otherIncome < 0) {
    throw new RangeError('otherHouseholdTaxableIncome must be a finite number ≥ 0')
  }
  return {
    activity: raw.activity,
    revenue: raw.revenue,
    versementLiberatoire: raw.versementLiberatoire ?? false,
    acre: raw.acre ?? false,
    acreReducedRate: raw.acreReducedRate ?? false,
    parts,
    otherHouseholdTaxableIncome: otherIncome,
  }
}

/**
 * Evaluates a rate rule and returns it as a *ratio* (0.123), not a percentage.
 *
 * publicodes stores rates in percent units, so `taux cotisations` evaluates to
 * 12.3, `taux CFP` to 0.1, etc. Dividing by 100 restores the ratio contract used
 * throughout the API (see {@link LineItem.rate}) and expected by {@link pct}.
 */
function evRate(rule: string): number {
  // Round to 6 decimals to keep the ratio clean (rates never need more precision)
  // and free of binary-float noise (e.g. 0.022000000000000002).
  return Math.round((evNumber(rule) / 100) * 1e6) / 1e6
}

/** Formats a ratio as a French percentage string (e.g. 0.212 → "21,2 %"). */
function pct(ratio: number): string {
  const rounded = Math.round(ratio * 10000) / 100
  return `${String(rounded).replace('.', ',')} %`
}

/** Formats an amount as a plain euro string (e.g. 6150 → "6150 €"). */
function eur(amount: number): string {
  return `${round2(amount).toString().replace('.', ',')} €`
}

function buildWarnings(input: NormalizedInput): Warning[] {
  const warnings: Warning[] = []

  if (evBool('micro . seuils . dépassement plafond')) {
    const plafond = evNumber('micro . seuils . plafond micro')
    warnings.push({
      code: 'depassement_plafond_micro',
      level: 'warning',
      message:
        `Le chiffre d'affaires dépasse le plafond du régime micro (${eur(plafond)}). ` +
        'Au-delà, le régime micro-entrepreneur peut ne plus s’appliquer.',
    })
  }

  if (evBool('micro . seuils . dépassement franchise TVA')) {
    const seuil = evNumber('micro . seuils . franchise TVA')
    warnings.push({
      code: 'depassement_franchise_tva',
      level: 'warning',
      message:
        `Le chiffre d'affaires dépasse le seuil de franchise en base de TVA (${eur(seuil)}). ` +
        'La TVA devient probablement applicable ; ce simulateur la suppose non due.',
    })
  }

  if (input.versementLiberatoire) {
    warnings.push({
      code: 'vl_eligibilite_rfr',
      level: 'info',
      message:
        'Le versement libératoire suppose un revenu fiscal de référence 2024 ' +
        '≤ 29 315 € par part de quotient familial. Cette condition n’est pas vérifiée ici.',
    })
  }

  warnings.push({
    code: 'cfe_non_incluse',
    level: 'info',
    message:
      'La cotisation foncière des entreprises (CFE) n’est pas incluse : elle dépend ' +
      'de votre commune et de votre situation, et peut faire l’objet d’une exonération la 1re année.',
  })

  return warnings
}

/**
 * Runs a full micro-entrepreneur simulation for the 2026 parameters.
 *
 * @throws RangeError on invalid input (see {@link normalize}).
 */
export function simulate(raw: SimulationInput): SimulationResult {
  const input = normalize(raw)

  engine.setSituation({
    'micro . CA': input.revenue,
    'micro . activité': ACTIVITE_PUBLICODES[input.activity],
    'micro . versement libératoire': input.versementLiberatoire ? 'oui' : 'non',
    'micro . ACRE': input.acre ? 'oui' : 'non',
    'micro . ACRE réduit': input.acreReducedRate ? 'oui' : 'non',
    'micro . foyer . parts': input.parts,
    'micro . foyer . autres revenus imposables': input.otherHouseholdTaxableIncome,
  })

  const socialRate = evRate('micro . taux cotisations effectif')
  const socialAmount = round2(evNumber('micro . cotisations sociales'))
  const acreNote = input.acre
    ? ` (ACRE : réduction de ${pct(evRate('micro . réduction ACRE'))} sur les cotisations)`
    : ''
  const socialContributions: LineItem = {
    key: 'cotisations_sociales',
    label: 'Cotisations sociales',
    amount: socialAmount,
    base: input.revenue,
    rate: socialRate,
    detail: `${eur(input.revenue)} × ${pct(socialRate)}${acreNote}`,
  }

  const cfpRate = evRate('micro . taux CFP')
  // For BIC services the artisanal CFP rate (0,3 %) is assumed; flag the caveat
  // inline so the line-item stays honest (see docs/parameters-2026.md).
  const cfpCaveat =
    input.activity === 'prestations_bic'
      ? ' — taux artisanal supposé (0,1 % pour une activité purement commerciale)'
      : ''
  const trainingContribution: LineItem = {
    key: 'cfp',
    label: 'Contribution à la formation professionnelle (CFP)',
    amount: round2(evNumber('micro . CFP')),
    base: input.revenue,
    rate: cfpRate,
    detail: `${eur(input.revenue)} × ${pct(cfpRate)}${cfpCaveat}`,
  }

  const taxableIncome = round2(evNumber('micro . revenu imposable'))
  const incomeTaxMode = input.versementLiberatoire ? 'versement_liberatoire' : 'bareme'
  // Single source of truth: the amount comes from `impôt sur le revenu`, the same
  // rule the `prélèvements totaux` aggregate uses. We only branch for presentation.
  const incomeTaxAmount = round2(evNumber('micro . impôt sur le revenu'))
  let incomeTax: LineItem
  if (input.versementLiberatoire) {
    const vlRate = evRate('micro . taux versement libératoire')
    incomeTax = {
      key: 'impot_revenu',
      label: 'Impôt sur le revenu (versement libératoire)',
      amount: incomeTaxAmount,
      base: input.revenue,
      rate: vlRate,
      detail: `${eur(input.revenue)} × ${pct(vlRate)}`,
    }
  } else {
    const abatementRate = evRate('micro . taux abattement')
    const abatementAmount = round2(evNumber('micro . abattement'))
    // The flat allowance has a 305 € floor (capped at turnover): when it wins over
    // the percentage, explain the actual euro allowance rather than a misleading %.
    const floorApplies = input.revenue * abatementRate < Math.min(305, input.revenue)
    const abatementText = floorApplies
      ? `Abattement forfaitaire de ${eur(abatementAmount)} (minimum 305 €)`
      : `Abattement de ${pct(abatementRate)}`
    incomeTax = {
      key: 'impot_revenu',
      label: 'Impôt sur le revenu (barème progressif)',
      amount: incomeTaxAmount,
      base: taxableIncome,
      detail:
        `${abatementText} → revenu imposable ${eur(taxableIncome)}, ` +
        `puis barème progressif 2026 sur le foyer (${input.parts} part(s)).`,
    }
  }

  const breakdown = [socialContributions, trainingContribution, incomeTax]
  const totalLevies = round2(evNumber('micro . prélèvements totaux'))
  const netIncome = round2(evNumber('micro . revenu net'))
  const effectiveLevyRate =
    input.revenue > 0 ? Math.round((totalLevies / input.revenue) * 10000) / 10000 : 0

  return {
    input,
    revenue: input.revenue,
    incomeTaxMode,
    socialContributions,
    trainingContribution,
    incomeTax,
    breakdown,
    taxableIncome,
    totalLevies,
    netIncome,
    effectiveLevyRate,
    warnings: buildWarnings(input),
  }
}

/** The micro-régime turnover ceilings for an activity (euros, 2026 parameters). */
export interface MicroThresholds {
  /** Turnover ceiling above which the micro régime no longer applies. */
  plafondMicro: number
  /** Base VAT-franchise threshold (below it, no VAT is charged). */
  franchiseTVA: number
  /** Higher tolerance VAT threshold: above it, the franchise stops mid-year. */
  franchiseTVAMajoree: number
}

/**
 * Reads the micro-régime ceilings for an activity from the rule base — the single source of
 * truth, so a finance-act change updates advice automatically. These depend only on the
 * activity category, so no other situation input is needed.
 *
 * @throws RangeError on an unknown activity.
 */
export function microThresholds(activity: ActivityType): MicroThresholds {
  if (!VALID_ACTIVITIES.has(activity)) {
    throw new RangeError(`Unknown activity: ${String(activity)}`)
  }
  engine.setSituation({ 'micro . activité': ACTIVITE_PUBLICODES[activity] })
  return {
    plafondMicro: round2(evNumber('micro . seuils . plafond micro')),
    franchiseTVA: round2(evNumber('micro . seuils . franchise TVA')),
    franchiseTVAMajoree: round2(evNumber('micro . seuils . franchise TVA majorée')),
  }
}
