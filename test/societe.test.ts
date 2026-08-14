import { describe, expect, it } from 'vitest'

import { compareDividendes, impotSocietes, simulateSociete } from '../src/index.js'

describe('impotSocietes', () => {
  it.each([
    [30000, true, 4500], // 15 %
    [42500, true, 6375], // exactly at the reduced-rate limit
    [42501, true, 6375.25], // one euro over → 25 % on the excess
    [100000, true, 20750], // 42 500 × 15 % + 57 500 × 25 %
    [100000, false, 25000], // reduced rate not eligible → 25 %
  ])('IS(%s €, eligible=%s) = %s', (benefice, eligible, expected) => {
    expect(impotSocietes(benefice, eligible)).toBe(expected)
  })

  it('rejects a negative profit', () => {
    expect(() => impotSocietes(-1)).toThrow(RangeError)
  })
})

describe('simulateSociete — IS then dividend (PFU)', () => {
  it('computes IS, distributable result and net dividend (profit 100 000 €)', () => {
    const r = simulateSociete({ benefice: 100000 })
    expect(r.is.amount).toBe(20750)
    expect(r.resultatNet).toBe(79250)
    expect(r.dividende).toBe(79250)
    expect(r.pfu.amount).toBe(23775) // 30 %
    expect(r.netDividende).toBe(55475)
  })

  it('warns when the dividend exceeds the after-IS result', () => {
    const r = simulateSociete({ benefice: 100000, dividendes: 90000 })
    expect(r.warnings.some((w) => w.code === 'dividende_superieur_resultat')).toBe(true)
  })

  it('applies the full 25 % IS when the reduced rate is not eligible', () => {
    const r = simulateSociete({ benefice: 100000, reducedRateEligible: false })
    expect(r.is.amount).toBe(25000)
    expect(r.resultatNet).toBe(75000)
    expect(r.dividende).toBe(75000)
    expect(r.pfu.amount).toBe(22500)
    expect(r.netDividende).toBe(52500)
    expect(r.warnings.some((w) => w.code === 'is_taux_reduit_conditions')).toBe(false)
  })
})

describe('compareDividendes — PFU vs barème (with CSG déductible)', () => {
  it('prefers the barème at a low marginal rate', () => {
    const c = compareDividendes({ benefice: 100000 }) // no other income
    expect(c.recommended).toBe('bareme')
    expect(c.netPfu).toBe(55475)
    expect(c.netBareme).toBe(59866.71) // 40 % allowance − 6,8 % CSG déductible
    expect(c.netGain).toBe(4391.71)
  })

  it('prefers the PFU at a high marginal rate', () => {
    const c = compareDividendes({ benefice: 100000, autresRevenus: 100000 })
    expect(c.recommended).toBe('pfu')
    expect(c.netPfu).toBe(55475)
    expect(c.netBareme).toBe(48332.99)
    expect(c.netGain).toBe(7142.01)
  })

  it('ties at zero dividend and defaults to the PFU', () => {
    const c = compareDividendes({ benefice: 100000, dividendes: 0 })
    expect(c.netPfu).toBe(0)
    expect(c.netBareme).toBe(0)
    expect(c.netGain).toBe(0)
    expect(c.recommended).toBe('pfu')
    expect(c.explanation).toContain('même net')
  })

  it('applies the quotient familial in the barème option (parts > 1)', () => {
    const c = compareDividendes({ benefice: 100000, autresRevenus: 100000, parts: 2 })
    expect(c.netPfu).toBe(55475)
    expect(c.netBareme).toBe(52970.7)
    expect(c.recommended).toBe('pfu')
    expect(c.netGain).toBe(2504.3)
  })

  it('surfaces the CSG-déductible approximation caveat', () => {
    const c = compareDividendes({ benefice: 100000 })
    expect(c.warnings.some((w) => w.code === 'csg_deductible_approx')).toBe(true)
  })

  it('exposes per-option breakdowns that reconcile with each net', () => {
    const c = compareDividendes({ benefice: 100000 })
    const sum = (lines: { amount: number }[]) => Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100
    // benefice − net = total levies (IS + option-specific levies)
    expect(sum(c.pfuBreakdown)).toBe(100000 - c.netPfu)
    expect(sum(c.baremeBreakdown)).toBe(100000 - c.netBareme)
    // The barème breakdown replaces the flat-tax line with PS + IR.
    expect(c.baremeBreakdown.some((l) => l.key === 'ps')).toBe(true)
    expect(c.baremeBreakdown.some((l) => l.key === 'pfu')).toBe(false)
  })

  it('recommended net is always the higher of the two', () => {
    const c = compareDividendes({ benefice: 60000 })
    const recommendedNet = c.recommended === 'pfu' ? c.netPfu : c.netBareme
    expect(recommendedNet).toBe(Math.max(c.netPfu, c.netBareme))
  })
})
