/**
 * Advisor for the micro-entrepreneur profile.
 *
 * It reuses the exact fiscal engine (no parallel maths): it runs {@link compare} to value the
 * income-tax régime choice and the ACRE lever in euros, and reads {@link microThresholds} to
 * warn about the VAT-franchise and micro-ceiling thresholds. Each result is a transparent
 * {@link Advice} — a number the user can trace, or a clearly-labelled alert/info.
 */
import { compare, type CompareInput, type Comparison } from '../engine/compare.js'
import { microThresholds } from '../engine/simulate.js'
import type { IncomeTaxMode } from '../engine/types.js'
import { eur, round2, sortAdvice } from './shared.js'
import type { Advice } from './types.js'

export { totalEstimatedGain } from './shared.js'

/** Turnover fraction of a threshold above which we proactively warn. */
const PROXIMITY = 0.9

/** Net income under the recommended régime of a comparison. */
function bestNet(c: Comparison): number {
  return c.recommended === 'versement_liberatoire' ? c.versementLiberatoire.netIncome : c.bareme.netIncome
}

function modeLabel(mode: IncomeTaxMode): string {
  return mode === 'versement_liberatoire' ? 'le versement libératoire' : 'le barème progressif'
}

/**
 * Produces transparent advice for a micro-entrepreneur situation, ordered
 * optimisations → alertes → info, and within a kind by decreasing euro gain.
 *
 * @throws RangeError on invalid input (delegated to {@link compare}).
 */
export function adviseMicro(input: CompareInput): Advice[] {
  const advice: Advice[] = []
  const comparison = compare(input)

  // 1. Income-tax régime choice — the headline lever, valued in euros.
  if (comparison.netGain > 0) {
    advice.push({
      id: 'regime-ir',
      kind: 'optimisation',
      title: `Choisir ${modeLabel(comparison.recommended)}`,
      detail: comparison.explanation,
      estimatedGain: round2(comparison.netGain),
      ruleRef: 'micro . impôt sur le revenu',
    })
  }

  // 2. ACRE — first-year contribution reduction (only if not already claimed).
  if (input.acre !== true) {
    const gain = round2(bestNet(compare({ ...input, acre: true })) - bestNet(comparison))
    if (gain > 0) {
      advice.push({
        id: 'acre',
        kind: 'optimisation',
        title: "Activer l'ACRE (si 1re année)",
        detail:
          `Si vous êtes en première année d'activité, l'ACRE réduit vos cotisations sociales. ` +
          `Gain estimé : ${eur(gain)} sur l'année.`,
        estimatedGain: gain,
        ruleRef: 'micro . réduction ACRE',
      })
    }
  }

  // 3 & 4. Threshold awareness (VAT franchise, micro ceiling).
  const { plafondMicro, franchiseTVA } = microThresholds(input.activity)
  const revenue = input.revenue

  if (revenue > franchiseTVA) {
    advice.push({
      id: 'tva-depassee',
      kind: 'alerte',
      title: 'Seuil de franchise en base de TVA dépassé',
      detail:
        `Votre chiffre d'affaires dépasse ${eur(franchiseTVA)} : la TVA devient probablement ` +
        `applicable. Ce simulateur la suppose non due — vérifiez votre situation.`,
      ruleRef: 'micro . seuils . franchise TVA',
    })
  } else if (revenue >= PROXIMITY * franchiseTVA) {
    advice.push({
      id: 'tva-proche',
      kind: 'alerte',
      title: 'Vous approchez le seuil de franchise TVA',
      detail:
        `À ${eur(franchiseTVA - revenue)} du seuil de ${eur(franchiseTVA)}. Au-delà, vous devrez ` +
        `facturer la TVA — anticipez.`,
      ruleRef: 'micro . seuils . franchise TVA',
    })
  }

  if (revenue > plafondMicro) {
    advice.push({
      id: 'plafond-depasse',
      kind: 'alerte',
      title: 'Plafond du régime micro dépassé',
      detail:
        `Votre chiffre d'affaires dépasse ${eur(plafondMicro)} : au-delà (et selon la durée), ` +
        `le régime micro ne s'applique plus et vous basculez au réel.`,
      ruleRef: 'micro . seuils . plafond micro',
    })
  } else if (revenue >= PROXIMITY * plafondMicro) {
    advice.push({
      id: 'plafond-proche',
      kind: 'alerte',
      title: 'Vous approchez le plafond du régime micro',
      detail: `À ${eur(plafondMicro - revenue)} du plafond de ${eur(plafondMicro)}. Surveillez votre CA.`,
      ruleRef: 'micro . seuils . plafond micro',
    })
  }

  // 5. Régime réel — honest, unquantified pointer (no réel model yet).
  advice.push({
    id: 'reel-info',
    kind: 'info',
    title: 'Micro ou réel ?',
    detail:
      `Le régime micro applique un abattement forfaitaire. Si vos charges réelles dépassent cet ` +
      `abattement, le régime réel pourrait réduire votre base imposable (non simulé ici).`,
    ruleRef: 'micro . abattement',
  })

  return sortAdvice(advice)
}
