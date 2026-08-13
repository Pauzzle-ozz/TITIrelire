/**
 * Salaried-individual profile: income tax on salary, with the 10 % deduction (or frais
 * réels) and a PER (retirement savings) optimisation.
 *
 * All figures are 2026 (revenus 2025); see docs/parameters-2026.md. Not tax advice.
 * Out of scope (like the micro module): décote, plafonnement du quotient familial,
 * specific credits/réductions.
 */
import { impotBareme, round2 } from './bareme.js'
import type { LineItem, Warning } from './types.js'

/** 2026 parameters for salaried income tax. */
const ABATTEMENT_TAUX = 0.1
const ABATTEMENT_MIN = 499
const ABATTEMENT_PLAFOND = 14556
const PER_FLOOR = 4710
const PER_CEILING = 37680

export interface ParticulierInput {
  /** Annual net taxable salary (salaire net imposable), before the 10 % deduction. */
  salaireNetImposable: number
  /** Tax-household parts (quotient familial). Default 1. */
  parts?: number
  /** Actual professional expenses (frais réels); when set, replaces the 10 % forfait. */
  fraisReels?: number
  /** PER contribution to deduct this year. Default 0. */
  perContribution?: number
  /** Other net taxable household income added before the scale. Default 0. */
  autresRevenus?: number
}

export interface ParticulierInputNormalized {
  salaireNetImposable: number
  parts: number
  fraisReels: number | undefined
  perContribution: number
  autresRevenus: number
}

export interface ParticulierResult {
  input: ParticulierInputNormalized
  /** Professional-expenses deduction (10 % forfait or frais réels). */
  abattement: LineItem
  /** Taxable salary after the deduction. */
  taxableSalary: number
  /** PER amount actually deductible (capped by the ceiling). */
  perDeductible: number
  /** Household taxable income used for the scale. */
  taxableIncome: number
  /** Income tax. */
  incomeTax: number
  /** Salary minus income tax. */
  netAfterTax: number
  /** incomeTax / salary (0 when salary is 0). */
  effectiveRate: number
  breakdown: LineItem[]
  warnings: Warning[]
}

function eur(amount: number): string {
  return `${round2(amount).toString().replace('.', ',')} €`
}

function pct(ratio: number): string {
  return `${(Math.round(ratio * 10000) / 100).toString().replace('.', ',')} %`
}

export function normalizeParticulier(raw: ParticulierInput): ParticulierInputNormalized {
  if (!Number.isFinite(raw.salaireNetImposable) || raw.salaireNetImposable < 0) {
    throw new RangeError('salaireNetImposable must be a finite number >= 0')
  }
  const parts = raw.parts ?? 1
  if (!Number.isFinite(parts) || parts < 1) throw new RangeError('parts must be >= 1')
  const per = raw.perContribution ?? 0
  const autres = raw.autresRevenus ?? 0
  if (!Number.isFinite(per) || per < 0) throw new RangeError('perContribution must be >= 0')
  if (!Number.isFinite(autres) || autres < 0) throw new RangeError('autresRevenus must be >= 0')
  if (raw.fraisReels !== undefined && (!Number.isFinite(raw.fraisReels) || raw.fraisReels < 0)) {
    throw new RangeError('fraisReels must be >= 0')
  }
  return {
    salaireNetImposable: raw.salaireNetImposable,
    parts,
    fraisReels: raw.fraisReels,
    perContribution: per,
    autresRevenus: autres,
  }
}

/** PER deduction ceiling for a given taxable salary (10 %, clamped to floor/ceiling). */
export function perPlafond(taxableSalary: number): number {
  return Math.min(Math.max(taxableSalary * ABATTEMENT_TAUX, PER_FLOOR), PER_CEILING)
}

/** Runs a salaried income-tax simulation for 2026. */
export function simulateParticulier(raw: ParticulierInput): ParticulierResult {
  const input = normalizeParticulier(raw)
  const salaire = input.salaireNetImposable

  const forfait = Math.min(Math.max(salaire * ABATTEMENT_TAUX, ABATTEMENT_MIN), ABATTEMENT_PLAFOND)
  const usesFraisReels = input.fraisReels !== undefined
  const abattementAmount = Math.min(usesFraisReels ? input.fraisReels! : forfait, salaire)
  const abattement: LineItem = {
    key: 'abattement',
    label: usesFraisReels ? 'Frais réels' : 'Déduction forfaitaire de 10 %',
    amount: round2(abattementAmount),
    base: salaire,
    ...(usesFraisReels ? {} : { rate: ABATTEMENT_TAUX }),
    detail: usesFraisReels
      ? `Frais réels déclarés : ${eur(abattementAmount)}`
      : `10 % de ${eur(salaire)} (min ${eur(ABATTEMENT_MIN)}, plafond ${eur(ABATTEMENT_PLAFOND)})`,
  }

  const taxableSalary = round2(salaire - abattementAmount)
  const plafond = perPlafond(taxableSalary)
  const perDeductible = round2(Math.min(input.perContribution, plafond))
  const taxableIncome = round2(Math.max(0, input.autresRevenus + taxableSalary - perDeductible))
  const incomeTax = impotBareme(taxableIncome, input.parts)
  const netAfterTax = round2(salaire - incomeTax)
  const effectiveRate = salaire > 0 ? Math.round((incomeTax / salaire) * 10000) / 10000 : 0

  const breakdown: LineItem[] = [abattement]
  if (input.perContribution > 0) {
    breakdown.push({
      key: 'per',
      label: 'Déduction PER',
      amount: perDeductible,
      detail: `Versement PER déductible (plafond ${eur(plafond)})`,
    })
  }
  breakdown.push({
    key: 'impot_revenu',
    label: 'Impôt sur le revenu',
    amount: incomeTax,
    base: taxableIncome,
    detail: `Barème progressif 2026 sur ${eur(taxableIncome)} (${input.parts} part(s))`,
  })

  const warnings: Warning[] = []
  if (input.perContribution > plafond) {
    warnings.push({
      code: 'per_plafond_depasse',
      level: 'warning',
      message: `Le versement PER (${eur(input.perContribution)}) dépasse le plafond déductible (${eur(plafond)}) ; l'excédent n'est pas déduit.`,
    })
  }

  return {
    input,
    abattement,
    taxableSalary,
    perDeductible,
    taxableIncome,
    incomeTax,
    netAfterTax,
    effectiveRate,
    breakdown,
    warnings,
  }
}

export interface PerComparison {
  input: ParticulierInputNormalized
  /** PER amount actually deductible. */
  deductible: number
  /** Income tax without the PER contribution. */
  taxWithout: number
  /** Income tax with the PER contribution. */
  taxWith: number
  /** Income tax saved by the contribution (euros, >= 0). */
  taxSaving: number
  /** Real cost of the contribution: deductible − taxSaving. */
  netCost: number
  explanation: string
  warnings: Warning[]
}

/**
 * Quantifies the PER optimisation: how much income tax a contribution saves, and its
 * real net cost. (Contributing to a PER lowers taxable income at the marginal rate.)
 */
export function comparePER(raw: ParticulierInput): PerComparison {
  const withPer = simulateParticulier(raw)
  const withoutPer = simulateParticulier({ ...raw, perContribution: 0 })
  const taxSaving = round2(withoutPer.incomeTax - withPer.incomeTax)
  const deductible = withPer.perDeductible
  const netCost = round2(deductible - taxSaving)
  const explanation =
    deductible === 0
      ? "Aucun versement PER : pas d'économie d'impôt à ce titre."
      : `Verser ${eur(deductible)} sur un PER réduit votre impôt de ${eur(taxSaving)} ` +
        `(coût net réel ${eur(netCost)}). Cette épargne reste bloquée jusqu'à la retraite (sauf cas de déblocage).`

  return {
    input: withPer.input,
    deductible,
    taxWithout: withoutPer.incomeTax,
    taxWith: withPer.incomeTax,
    taxSaving,
    netCost,
    explanation,
    warnings: withPer.warnings,
  }
}
