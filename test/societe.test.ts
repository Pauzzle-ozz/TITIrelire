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
})

describe('compareDividendes — PFU vs barème', () => {
  it('prefers the barème at a low marginal rate', () => {
    const c = compareDividendes({ benefice: 100000 }) // no other income
    expect(c.recommended).toBe('bareme')
    expect(c.netPfu).toBe(55475)
    expect(c.netBareme).toBe(58250.01)
    expect(c.netGain).toBe(2775.01)
  })

  it('prefers the PFU at a high marginal rate', () => {
    const c = compareDividendes({ benefice: 100000, autresRevenus: 100000 })
    expect(c.recommended).toBe('pfu')
    expect(c.netPfu).toBe(55475)
    expect(c.netBareme).toBe(46123.5)
    expect(c.netGain).toBe(9351.5)
  })

  it('recommended net is always the higher of the two', () => {
    const c = compareDividendes({ benefice: 60000 })
    const recommendedNet = c.recommended === 'pfu' ? c.netPfu : c.netBareme
    expect(recommendedNet).toBe(Math.max(c.netPfu, c.netBareme))
  })
})
