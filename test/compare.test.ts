import { describe, expect, it } from 'vitest'

import { compare } from '../src/index.js'

describe('compare — recommendation', () => {
  it('recommends the barème when the flat option costs more (vente 50 000 €)', () => {
    const c = compare({ activity: 'vente_marchandises', revenue: 50000 })
    // barème IR 319 € vs versement libératoire 500 €
    expect(c.bareme.incomeTax).toBe(319)
    expect(c.versementLiberatoire.incomeTax).toBe(500)
    expect(c.recommended).toBe('bareme')
    // net 43 481 (barème) vs 43 300 (VL) → 181 € gain
    expect(c.netGain).toBe(181)
    expect(c.bareme.netIncome).toBe(43481)
    expect(c.versementLiberatoire.netIncome).toBe(43300)
  })

  it('recommends the versement libératoire when it is cheaper (BNC 40 000 €)', () => {
    const c = compare({ activity: 'prestations_bnc', revenue: 40000 })
    // barème IR 1628 € vs versement libératoire 880 €
    expect(c.bareme.incomeTax).toBe(1628)
    expect(c.versementLiberatoire.incomeTax).toBe(880)
    expect(c.recommended).toBe('versement_liberatoire')
    // net 28 800 (VL) vs 28 052 (barème) → 748 € gain
    expect(c.netGain).toBe(748)
  })

  it('household context flips the recommendation (BNC 40 000 € at a high marginal rate)', () => {
    // With 60 000 € of other income, the micro income is taxed at 30 % under the
    // barème, which is dearer than the 2,2 % flat option.
    const c = compare({
      activity: 'prestations_bnc',
      revenue: 40000,
      otherHouseholdTaxableIncome: 60000,
    })
    expect(c.recommended).toBe('versement_liberatoire')
    expect(c.versementLiberatoire.incomeTax).toBe(880)
    expect(c.bareme.incomeTax).toBeGreaterThan(c.versementLiberatoire.incomeTax)
  })
})

describe('compare — structure and explanation', () => {
  it('exposes both full simulations and a coherent gain', () => {
    const c = compare({ activity: 'vente_marchandises', revenue: 50000 })
    expect(c.bareme.result.incomeTaxMode).toBe('bareme')
    expect(c.versementLiberatoire.result.incomeTaxMode).toBe('versement_liberatoire')
    const diff = Math.abs(c.bareme.netIncome - c.versementLiberatoire.netIncome)
    expect(Math.round(diff * 100) / 100).toBe(c.netGain)
  })

  it('the explanation names the winning amounts', () => {
    const c = compare({ activity: 'prestations_bnc', revenue: 40000 })
    expect(c.explanation).toContain('versement libératoire')
    expect(c.explanation).toContain('748')
  })

  it('surfaces the VL eligibility caveat when VL is recommended', () => {
    const c = compare({ activity: 'prestations_bnc', revenue: 40000 })
    expect(c.warnings.some((w) => w.code === 'vl_eligibilite_rfr')).toBe(true)
  })

  it('recommended net income is always the higher of the two', () => {
    const c = compare({ activity: 'liberal_cipav', revenue: 60000 })
    const recommendedNet =
      c.recommended === 'bareme' ? c.bareme.netIncome : c.versementLiberatoire.netIncome
    expect(recommendedNet).toBe(Math.max(c.bareme.netIncome, c.versementLiberatoire.netIncome))
  })
})

describe('compare — invalid input', () => {
  it('propagates validation errors', () => {
    expect(() => compare({ activity: 'vente_marchandises', revenue: -1 })).toThrow(RangeError)
  })
})
