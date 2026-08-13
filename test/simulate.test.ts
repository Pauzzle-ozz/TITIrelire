import { describe, expect, it } from 'vitest'

import { simulate } from '../src/index.js'
import type { SimulationInput } from '../src/index.js'

/** Helper: does the result carry a warning with the given code? */
function hasWarning(codes: { code: string }[], code: string): boolean {
  return codes.some((w) => w.code === code)
}

describe('simulate — nominal cases (barème)', () => {
  it('vente, CA 50 000 €, no options', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 50000 })
    expect(r.socialContributions.amount).toBe(6150)
    expect(r.trainingContribution.amount).toBe(50)
    expect(r.taxableIncome).toBe(14500)
    expect(r.incomeTax.amount).toBe(319)
    expect(r.incomeTaxMode).toBe('bareme')
    expect(r.totalLevies).toBe(6519)
    expect(r.netIncome).toBe(43481)
    expect(r.effectiveLevyRate).toBe(0.1304)
  })

  it('prestations de services BIC, CA 30 000 €', () => {
    const r = simulate({ activity: 'prestations_bic', revenue: 30000 })
    expect(r.socialContributions.amount).toBe(6360)
    expect(r.trainingContribution.amount).toBe(90)
    expect(r.taxableIncome).toBe(15000)
    expect(r.incomeTax.amount).toBe(374)
    expect(r.netIncome).toBe(23176)
  })

  it('prestations de services BNC, CA 40 000 €', () => {
    const r = simulate({ activity: 'prestations_bnc', revenue: 40000 })
    expect(r.socialContributions.amount).toBe(10240)
    expect(r.trainingContribution.amount).toBe(80)
    expect(r.taxableIncome).toBe(26400)
    expect(r.incomeTax.amount).toBe(1628)
    expect(r.netIncome).toBe(28052)
  })

  it('libéral CIPAV, CA 60 000 € (spans the 0/11/30 % brackets)', () => {
    const r = simulate({ activity: 'liberal_cipav', revenue: 60000 })
    expect(r.socialContributions.amount).toBe(13920)
    expect(r.trainingContribution.amount).toBe(120)
    expect(r.taxableIncome).toBe(39600)
    // 17979 × 11 % + 10021 × 30 % = 1977.69 + 3006.30 = 4983.99
    expect(r.incomeTax.amount).toBe(4983.99)
    expect(r.netIncome).toBe(40976.01)
  })
})

describe('simulate — versement libératoire', () => {
  it('vente, CA 50 000 € (barème would be cheaper here)', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 50000, versementLiberatoire: true })
    expect(r.incomeTaxMode).toBe('versement_liberatoire')
    expect(r.incomeTax.amount).toBe(500) // 50 000 × 1 %
    expect(r.totalLevies).toBe(6700)
    expect(r.netIncome).toBe(43300)
    expect(hasWarning(r.warnings, 'vl_eligibilite_rfr')).toBe(true)
  })

  it('BNC, CA 40 000 € (versement libératoire is cheaper here)', () => {
    const r = simulate({ activity: 'prestations_bnc', revenue: 40000, versementLiberatoire: true })
    expect(r.incomeTax.amount).toBe(880) // 40 000 × 2,2 %
    expect(r.netIncome).toBe(28800)
  })
})

describe('simulate — ACRE relief', () => {
  it('50 % relief (created before 2026-07-01)', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 50000, acre: true })
    expect(r.socialContributions.amount).toBe(3075) // 50 000 × 6,15 %
    expect(r.trainingContribution.amount).toBe(50) // CFP unaffected by ACRE
    expect(r.netIncome).toBe(46556)
  })

  it('25 % reduced relief (created on/after 2026-07-01)', () => {
    const r = simulate({
      activity: 'vente_marchandises',
      revenue: 50000,
      acre: true,
      acreReducedRate: true,
    })
    expect(r.socialContributions.amount).toBe(4612.5) // 50 000 × 9,225 %
    expect(r.netIncome).toBe(45018.5)
  })

  it('acreReducedRate without acre has no effect', () => {
    const withoutAcre = simulate({ activity: 'vente_marchandises', revenue: 50000, acreReducedRate: true })
    expect(withoutAcre.socialContributions.amount).toBe(6150)
  })
})

describe('simulate — household (quotient familial)', () => {
  it('2 parts and 20 000 € other income shifts the marginal tax', () => {
    const r = simulate({
      activity: 'vente_marchandises',
      revenue: 50000,
      parts: 2,
      otherHouseholdTaxableIncome: 20000,
    })
    // IR(34 500 @ 2 parts) − IR(20 000 @ 2 parts) = 1243 − 0
    expect(r.incomeTax.amount).toBe(1243)
    expect(r.totalLevies).toBe(7443)
    expect(r.netIncome).toBe(42557)
  })
})

describe('simulate — thresholds and warnings', () => {
  it('flags TVA franchise crossing but not the micro ceiling (vente 90 000 €)', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 90000 })
    expect(hasWarning(r.warnings, 'depassement_franchise_tva')).toBe(true)
    expect(hasWarning(r.warnings, 'depassement_plafond_micro')).toBe(false)
  })

  it('flags both crossings for BNC 90 000 €', () => {
    const r = simulate({ activity: 'prestations_bnc', revenue: 90000 })
    expect(hasWarning(r.warnings, 'depassement_franchise_tva')).toBe(true)
    expect(hasWarning(r.warnings, 'depassement_plafond_micro')).toBe(true)
  })

  it('always notes that CFE is excluded', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 10000 })
    expect(hasWarning(r.warnings, 'cfe_non_incluse')).toBe(true)
  })
})

describe('simulate — edge cases', () => {
  it('zero turnover yields zero everywhere', () => {
    const r = simulate({ activity: 'vente_marchandises', revenue: 0 })
    expect(r.socialContributions.amount).toBe(0)
    expect(r.trainingContribution.amount).toBe(0)
    expect(r.incomeTax.amount).toBe(0)
    expect(r.taxableIncome).toBe(0)
    expect(r.totalLevies).toBe(0)
    expect(r.netIncome).toBe(0)
    expect(r.effectiveLevyRate).toBe(0)
  })

  it('tiny turnover is fully absorbed by the 305 € minimum allowance', () => {
    const r = simulate({ activity: 'prestations_bnc', revenue: 200 })
    // allowance = max(200 × 34 %, min(305, 200)) = max(68, 200) = 200 → taxable 0
    expect(r.taxableIncome).toBe(0)
    expect(r.incomeTax.amount).toBe(0)
  })

  it('breakdown always sums to totalLevies', () => {
    const inputs: SimulationInput[] = [
      { activity: 'vente_marchandises', revenue: 50000 },
      { activity: 'prestations_bnc', revenue: 40000, versementLiberatoire: true },
      { activity: 'liberal_cipav', revenue: 60000, acre: true },
    ]
    for (const input of inputs) {
      const r = simulate(input)
      const sum = r.breakdown.reduce((acc, line) => acc + line.amount, 0)
      expect(Math.round(sum * 100) / 100).toBe(r.totalLevies)
    }
  })
})

describe('simulate — invalid input', () => {
  it('rejects negative turnover', () => {
    expect(() => simulate({ activity: 'vente_marchandises', revenue: -1 })).toThrow(RangeError)
  })

  it('rejects an unknown activity', () => {
    // @ts-expect-error deliberately invalid
    expect(() => simulate({ activity: 'crypto', revenue: 1000 })).toThrow(RangeError)
  })

  it('rejects parts below 1', () => {
    expect(() =>
      simulate({ activity: 'vente_marchandises', revenue: 1000, parts: 0 }),
    ).toThrow(RangeError)
  })

  it('rejects negative other household income', () => {
    expect(() =>
      simulate({ activity: 'vente_marchandises', revenue: 1000, otherHouseholdTaxableIncome: -5 }),
    ).toThrow(RangeError)
  })

  it('rejects a non-finite turnover', () => {
    expect(() => simulate({ activity: 'vente_marchandises', revenue: Number.NaN })).toThrow(RangeError)
  })
})
