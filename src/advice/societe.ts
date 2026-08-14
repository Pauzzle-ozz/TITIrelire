/**
 * Advisor for the single-shareholder company (SASU) profile.
 *
 * Reuses the exact engine (`compareDividendes` / `impotSocietes`) to value the dividend
 * taxation choice (PFU vs barème) and the reduced-IS-rate opportunity in euros. The
 * salaire/dividende arbitrage needs a payroll model, so it is surfaced honestly as info,
 * never faked.
 */
import { compareDividendes, impotSocietes, type SocieteInput } from '../engine/societe.js'
import { eur, round2, sortAdvice } from './shared.js'
import type { Advice } from './types.js'

/** First-profit slice taxed at the reduced IS rate (2026), for the advice wording. */
const IS_REDUCED_LIMIT = 42500

function modeLabel(mode: 'pfu' | 'bareme'): string {
  return mode === 'pfu' ? 'la flat tax (PFU 30 %)' : 'le barème progressif'
}

/** Produces transparent advice for a SASU. @throws on invalid input. */
export function adviseSociete(input: SocieteInput): Advice[] {
  const advice: Advice[] = []
  const comparison = compareDividendes(input)

  // ── Dividend taxation choice ─────────────────────────────────────────────────
  if (comparison.netGain > 0) {
    advice.push({
      id: 'dividendes-mode',
      kind: 'optimisation',
      title: `Imposer les dividendes via ${modeLabel(comparison.recommended)}`,
      detail: comparison.explanation,
      estimatedGain: round2(comparison.netGain),
      ruleRef: 'société . dividendes',
    })
  }

  // ── Reduced IS rate (15 %) opportunity ───────────────────────────────────────
  if (input.reducedRateEligible === false && input.benefice > 0) {
    const gain = round2(impotSocietes(input.benefice, false) - impotSocietes(input.benefice, true))
    if (gain > 0) {
      advice.push({
        id: 'is-taux-reduit',
        kind: 'optimisation',
        title: "Taux réduit d'IS à 15 % (si éligible)",
        detail:
          `Si votre société remplit les conditions (capital entièrement libéré, CA < 10 M€, ` +
          `≥ 75 % détenu par des personnes physiques), les premiers ${eur(IS_REDUCED_LIMIT)} de ` +
          `bénéfice sont imposés à 15 % au lieu de 25 % — soit ${eur(gain)} d'économie.`,
        estimatedGain: gain,
        ruleRef: 'société . IS . taux réduit',
      })
    }
  }

  // ── Salaire vs dividende — honest, unquantified pointer ──────────────────────
  advice.push({
    id: 'salaire-dividende-info',
    kind: 'info',
    title: 'Salaire ou dividendes ?',
    detail:
      `L'arbitrage entre se verser un salaire (charges sociales, mais droits sociaux et ` +
      `déductible de l'IS) et des dividendes n'est pas encore simulé ici (il demande un modèle de paie).`,
    ruleRef: 'société . dividendes',
  })

  return sortAdvice(advice)
}
