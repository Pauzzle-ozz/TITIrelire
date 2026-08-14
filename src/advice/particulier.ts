/**
 * Advisor for the salaried-individual profile.
 *
 * Reuses the exact engine (`simulateParticulier` / `comparePER` / `perPlafond`) to value two
 * levers in euros — the PER deduction (including the unused ceiling) and the frais-réels vs
 * 10 %-forfait choice — and surfaces the engine's own warnings as alerts. No parallel maths.
 */
import {
  comparePER,
  perPlafond,
  simulateParticulier,
  type ParticulierInput,
} from '../engine/particulier.js'
import { eur, round2, sortAdvice } from './shared.js'
import type { Advice } from './types.js'

/** Produces transparent advice for a salaried individual. @throws on invalid input. */
export function adviseParticulier(input: ParticulierInput): Advice[] {
  const advice: Advice[] = []
  const result = simulateParticulier(input)
  const current = comparePER(input)
  const plafond = perPlafond(result.taxableSalary)

  // ── PER lever ───────────────────────────────────────────────────────────────
  if (result.perDeductible === 0) {
    // No PER yet: value the full ceiling.
    if (plafond > 0) {
      const atMax = comparePER({ ...input, perContribution: plafond })
      if (atMax.taxSaving > 0) {
        advice.push({
          id: 'per-ouvrir',
          kind: 'optimisation',
          title: 'Ouvrir un PER (épargne déductible)',
          detail:
            `Verser jusqu'à ${eur(plafond)} sur un PER réduirait votre impôt de ${eur(atMax.taxSaving)}. ` +
            `L'épargne reste bloquée jusqu'à la retraite (sauf cas de déblocage).`,
          estimatedGain: atMax.taxSaving,
          ruleRef: 'PER . plafond',
        })
      }
    }
  } else {
    if (current.taxSaving > 0) {
      advice.push({
        id: 'per-actuel',
        kind: 'optimisation',
        title: 'Votre versement PER',
        detail: current.explanation,
        estimatedGain: current.taxSaving,
        ruleRef: 'PER',
      })
    }
    // Unused ceiling still available.
    const remaining = round2(plafond - result.perDeductible)
    if (remaining > 1) {
      const atMax = comparePER({ ...input, perContribution: plafond })
      const extra = round2(atMax.taxSaving - current.taxSaving)
      if (extra > 0) {
        advice.push({
          id: 'per-marge',
          kind: 'optimisation',
          title: 'Marge PER restante',
          detail:
            `Il vous reste ${eur(remaining)} de plafond déductible ; les utiliser économiserait ` +
            `${eur(extra)} d'impôt de plus.`,
          estimatedGain: extra,
          ruleRef: 'PER . plafond',
        })
      }
    }
  }

  // ── Frais réels vs 10 % forfait ──────────────────────────────────────────────
  if (input.fraisReels === undefined) {
    advice.push({
      id: 'frais-reels-info',
      kind: 'info',
      title: 'Frais réels ?',
      detail:
        `Vous bénéficiez de l'abattement forfaitaire de 10 % (${eur(result.abattement.amount)}). ` +
        `Si vos frais professionnels réels le dépassent, les déclarer au réel réduit votre impôt.`,
      ruleRef: 'particulier . abattement',
    })
  } else {
    // Frais réels chosen: check the 10 % forfait is not actually better.
    const { fraisReels: _dropped, ...withoutFrais } = input
    const forfait = simulateParticulier(withoutFrais)
    const gain = round2(result.incomeTax - forfait.incomeTax)
    if (gain > 0) {
      advice.push({
        id: 'frais-reels-defavorable',
        kind: 'optimisation',
        title: "Repasser à l'abattement de 10 %",
        detail:
          `Vos frais réels (${eur(input.fraisReels)}) sont inférieurs à l'abattement de 10 % ` +
          `(${eur(forfait.abattement.amount)}) : y renoncer baisserait votre impôt de ${eur(gain)}.`,
        estimatedGain: gain,
        ruleRef: 'particulier . abattement',
      })
    }
  }

  // ── Engine warnings → alerts ─────────────────────────────────────────────────
  for (const warning of current.warnings) {
    if (warning.level === 'info') continue
    advice.push({
      id: `alerte-${warning.code}`,
      kind: 'alerte',
      title: warning.code === 'per_plafond_depasse' ? 'Versement PER au-delà du plafond' : 'À vérifier',
      detail: warning.message,
      ruleRef: 'PER . plafond',
    })
  }

  return sortAdvice(advice)
}
