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

/** Formats a ratio as a French percentage string (e.g. 0.212 → "21,2 %"). */
function pct(ratio: number): string {
  const rounded = Math.round(ratio * 1000) / 10
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

  const socialRate = evNumber('micro . taux cotisations effectif')
  const socialAmount = round2(evNumber('micro . cotisations sociales'))
  const acreNote = input.acre
    ? ` (ACRE : réduction de ${pct(evNumber('micro . réduction ACRE'))} sur les cotisations)`
    : ''
  const socialContributions: LineItem = {
    key: 'cotisations_sociales',
    label: 'Cotisations sociales',
    amount: socialAmount,
    base: input.revenue,
    rate: socialRate,
    detail: `${eur(input.revenue)} × ${pct(socialRate)}${acreNote}`,
  }

  const cfpRate = evNumber('micro . taux CFP')
  const trainingContribution: LineItem = {
    key: 'cfp',
    label: 'Contribution à la formation professionnelle (CFP)',
    amount: round2(evNumber('micro . CFP')),
    base: input.revenue,
    rate: cfpRate,
    detail: `${eur(input.revenue)} × ${pct(cfpRate)}`,
  }

  const taxableIncome = round2(evNumber('micro . revenu imposable'))
  const incomeTaxMode = input.versementLiberatoire ? 'versement_liberatoire' : 'bareme'
  let incomeTax: LineItem
  if (input.versementLiberatoire) {
    const vlRate = evNumber('micro . taux versement libératoire')
    incomeTax = {
      key: 'impot_revenu',
      label: 'Impôt sur le revenu (versement libératoire)',
      amount: round2(evNumber('micro . montant versement libératoire')),
      base: input.revenue,
      rate: vlRate,
      detail: `${eur(input.revenue)} × ${pct(vlRate)}`,
    }
  } else {
    const abatement = evNumber('micro . taux abattement')
    incomeTax = {
      key: 'impot_revenu',
      label: 'Impôt sur le revenu (barème progressif)',
      amount: round2(evNumber('micro . impôt barème')),
      base: taxableIncome,
      detail:
        `Abattement de ${pct(abatement)} → revenu imposable ${eur(taxableIncome)}, ` +
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
