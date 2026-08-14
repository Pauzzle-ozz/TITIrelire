/**
 * Company profile (SASU / single-shareholder): corporate income tax (IS) and the taxation
 * of distributed dividends — flat tax (PFU) vs the progressive scale.
 *
 * Scope: the SASU case, where the president is assimilé salarié and dividends bear no
 * social contributions (only the PFU / prélèvements sociaux). The EURL gérant-majoritaire
 * case (dividends above 10 % of capital reclassified as TNS contributions) and the
 * salaire-vs-dividende arbitrage (needs a payroll model) are roadmap items. Figures are
 * 2026; see docs/parameters-2026.md. Not tax advice.
 */
import { impotMarginal, round2 } from './bareme.js'
import type { LineItem, Warning } from './types.js'

/** 2026 parameters. */
const IS_REDUCED_RATE = 0.15
const IS_REDUCED_LIMIT = 42500
const IS_NORMAL_RATE = 0.25
const PFU_IR = 0.128
const PFU_PS = 0.172
const PFU_TOTAL = PFU_IR + PFU_PS // 0.30
const DIVIDEND_ABATTEMENT = 0.4
const CSG_DEDUCTIBLE = 0.068 // part of the 17,2 % PS deductible from taxable income (barème option)

function eur(amount: number): string {
  return `${round2(amount).toString().replace('.', ',')} €`
}

/** Corporate income tax on a taxable profit. 15 % up to 42 500 € (if eligible), else 25 %. */
export function impotSocietes(benefice: number, reducedRateEligible = true): number {
  if (!Number.isFinite(benefice) || benefice < 0) {
    throw new RangeError('benefice must be a finite number >= 0')
  }
  if (!reducedRateEligible) return round2(benefice * IS_NORMAL_RATE)
  if (benefice <= IS_REDUCED_LIMIT) return round2(benefice * IS_REDUCED_RATE)
  return round2(IS_REDUCED_LIMIT * IS_REDUCED_RATE + (benefice - IS_REDUCED_LIMIT) * IS_NORMAL_RATE)
}

export interface SocieteInput {
  /** Taxable profit (résultat fiscal) before IS. */
  benefice: number
  /** Eligible for the 15 % reduced rate (CA < 10 M€, capital libéré, 75 % personnes physiques). Default true. */
  reducedRateEligible?: boolean
  /** Gross dividend to distribute. Default: the whole after-IS result. */
  dividendes?: number
  /** Tax-household parts, for the barème option. Default 1. */
  parts?: number
  /** Other net taxable household income, for the barème option. Default 0. */
  autresRevenus?: number
  /** Couple (joint filing) — base parts 2 for décote/plafonnement in the barème option. Default false. */
  couple?: boolean
}

export interface SocieteInputNormalized {
  benefice: number
  reducedRateEligible: boolean
  dividendes: number
  parts: number
  autresRevenus: number
  couple: boolean
}

export interface SocieteResult {
  input: SocieteInputNormalized
  /** Corporate income tax. */
  is: LineItem
  /** After-IS distributable result. */
  resultatNet: number
  /** Gross dividend distributed. */
  dividende: number
  /** Flat-tax (PFU) levies on the dividend. */
  pfu: LineItem
  /** Net dividend in the shareholder's pocket (PFU path). */
  netDividende: number
  /** Overall net from profit to pocket (netDividende, when the full result is distributed). */
  breakdown: LineItem[]
  warnings: Warning[]
}

export function normalizeSociete(raw: SocieteInput): SocieteInputNormalized {
  if (!Number.isFinite(raw.benefice) || raw.benefice < 0) {
    throw new RangeError('benefice must be a finite number >= 0')
  }
  const parts = raw.parts ?? 1
  if (!Number.isFinite(parts) || parts < 1) throw new RangeError('parts must be >= 1')
  const autres = raw.autresRevenus ?? 0
  if (!Number.isFinite(autres) || autres < 0) throw new RangeError('autresRevenus must be >= 0')
  const reducedRateEligible = raw.reducedRateEligible ?? true
  const is = impotSocietes(raw.benefice, reducedRateEligible)
  const resultatNet = round2(raw.benefice - is)
  const dividende = raw.dividendes ?? Math.max(0, resultatNet)
  if (!Number.isFinite(dividende) || dividende < 0) throw new RangeError('dividendes must be >= 0')
  return {
    benefice: raw.benefice,
    reducedRateEligible,
    dividendes: dividende,
    parts,
    autresRevenus: autres,
    couple: raw.couple ?? false,
  }
}

/** Runs an IS + dividend (PFU) simulation for a SASU. */
export function simulateSociete(raw: SocieteInput): SocieteResult {
  const input = normalizeSociete(raw)
  const isAmount = impotSocietes(input.benefice, input.reducedRateEligible)
  const resultatNet = round2(input.benefice - isAmount)
  const dividende = input.dividendes

  const pfuAmount = round2(dividende * PFU_TOTAL)
  const netDividende = round2(dividende - pfuAmount)

  const is: LineItem = {
    key: 'is',
    label: "Impôt sur les sociétés",
    amount: isAmount,
    base: input.benefice,
    detail: input.reducedRateEligible
      ? `15 % jusqu'à ${eur(IS_REDUCED_LIMIT)} puis 25 % au-delà`
      : `25 % sur ${eur(input.benefice)}`,
  }
  const pfu: LineItem = {
    key: 'pfu',
    label: 'Prélèvement forfaitaire unique (flat tax)',
    amount: pfuAmount,
    base: dividende,
    rate: PFU_TOTAL,
    detail: `30 % du dividende (12,8 % IR + 17,2 % prélèvements sociaux)`,
  }

  const warnings: Warning[] = []
  if (input.reducedRateEligible) {
    warnings.push({
      code: 'is_taux_reduit_conditions',
      level: 'info',
      message:
        'Taux réduit d’IS à 15 % supposé applicable (CA < 10 M€, capital entièrement libéré, ' +
        'détenu à 75 % au moins par des personnes physiques).',
    })
  }
  if (input.dividendes > resultatNet) {
    warnings.push({
      code: 'dividende_superieur_resultat',
      level: 'warning',
      message: `Le dividende (${eur(input.dividendes)}) dépasse le résultat net après IS (${eur(resultatNet)}) ; il puiserait dans les réserves.`,
    })
  }
  warnings.push({
    code: 'pfu_ps_2026',
    level: 'info',
    message:
      'Prélèvements sociaux retenus à 17,2 % (PFU 30 %). Certaines sources indiquent une ' +
      'hausse à 18,6 % (PFU 31,4 %) en 2026 — à confirmer selon la loi de finances applicable.',
  })

  return {
    input,
    is,
    resultatNet,
    dividende,
    pfu,
    netDividende,
    breakdown: [is, pfu],
    warnings,
  }
}

export type DividendMode = 'pfu' | 'bareme'

export interface DividendComparison {
  input: SocieteInputNormalized
  dividende: number
  /** Net dividend under the flat tax (PFU). */
  netPfu: number
  /** Net dividend under the progressive scale (40 % allowance + barème + 17,2 % PS). */
  netBareme: number
  /** The mode that keeps the most net (ties go to PFU). */
  recommended: DividendMode
  /** Net gain of the recommended mode vs the other (euros, >= 0). */
  netGain: number
  /** Levy breakdown under the PFU (IS + flat tax) — sums to benefice − netPfu. */
  pfuBreakdown: LineItem[]
  /** Levy breakdown under the barème (IS + PS + IR) — sums to benefice − netBareme. */
  baremeBreakdown: LineItem[]
  explanation: string
  warnings: Warning[]
}

/**
 * Compares the flat tax (PFU) against the progressive scale for a dividend, and recommends
 * the cheaper one. The barème is worth it only at low marginal rates (0 / 11 %).
 */
export function compareDividendes(raw: SocieteInput): DividendComparison {
  const base = simulateSociete(raw)
  const dividende = base.dividende

  // Reuse the same net as simulateSociete so the two never disagree by a rounding cent.
  const netPfu = base.netDividende

  const ps = round2(dividende * PFU_PS)
  // 40 % allowance, less the 6,8 % CSG déductible (approximation: technically deductible the
  // following year — surfaced as an info warning).
  const csgDeductible = round2(dividende * CSG_DEDUCTIBLE)
  const baseImposable = round2(dividende * (1 - DIVIDEND_ABATTEMENT) - csgDeductible)
  const irBareme = impotMarginal(base.input.autresRevenus, baseImposable, base.input.parts, base.input.couple ? 2 : 1)
  const netBareme = round2(dividende - ps - irBareme)

  // Levy breakdowns per option, so the UI can show one that reconciles with its net.
  const pfuBreakdown = base.breakdown // [IS, PFU]
  const baremeBreakdown: LineItem[] = [
    base.is,
    {
      key: 'ps',
      label: 'Prélèvements sociaux',
      amount: ps,
      base: dividende,
      rate: PFU_PS,
      detail: `17,2 % du dividende`,
    },
    {
      key: 'ir_dividendes',
      label: 'Impôt sur le revenu (barème)',
      amount: irBareme,
      base: baseImposable,
      detail: `Barème sur le dividende après abattement 40 % et CSG déductible (6,8 %)`,
    },
  ]

  const baremeWins = netBareme > netPfu
  const recommended: DividendMode = baremeWins ? 'bareme' : 'pfu'
  const netGain = round2(Math.abs(netBareme - netPfu))
  const explanation =
    netGain === 0
      ? `Les deux options donnent le même net (${eur(netPfu)}). Le PFU est retenu par défaut.`
      : baremeWins
        ? `Le barème progressif est plus avantageux : ${eur(netBareme)} nets contre ${eur(netPfu)} au PFU ` +
          `(gain ${eur(netGain)}), grâce à l'abattement de 40 % et à votre taux marginal.`
        : `Le PFU (flat tax) est plus avantageux : ${eur(netPfu)} nets contre ${eur(netBareme)} au barème ` +
          `(gain ${eur(netGain)}).`

  return {
    input: base.input,
    dividende,
    netPfu,
    netBareme,
    recommended,
    netGain,
    pfuBreakdown,
    baremeBreakdown,
    explanation,
    warnings: [
      ...base.warnings,
      {
        code: 'csg_deductible_approx',
        level: 'info',
        message:
          'Option barème : la CSG déductible (6,8 % du dividende) est appliquée l’année même ' +
          'par simplification ; elle est en réalité déductible du revenu de l’année suivante.',
      },
    ],
  }
}
