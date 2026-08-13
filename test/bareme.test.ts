import { describe, expect, it } from 'vitest'

import { impotBareme, impotMarginal } from '../src/index.js'

describe('impotBareme (2026 scale)', () => {
  it.each([
    [0, 1, 0],
    [11600, 1, 0], // exactly at the 0 % ceiling
    [14500, 1, 319], // 2900 × 11 %
    [39600, 1, 4983.99], // spans 11 % and 30 %
    [100000, 1, 24800.52], // into the 41 % band
    [200000, 1, 66523.84], // into the 45 % band
  ])('IR(%s €, %s part) = %s', (income, parts, expected) => {
    expect(impotBareme(income, parts)).toBe(expected)
  })

  it('applies the quotient familial (2 parts halves the effective scale)', () => {
    // 40 000 € over 2 parts = 20 000 €/part → tax per part × 2.
    expect(impotBareme(40000, 2)).toBe(impotBareme(20000, 1) * 2)
  })

  it('treats negative income as zero', () => {
    expect(impotBareme(-5000, 1)).toBe(0)
  })

  it('rejects invalid parts', () => {
    expect(() => impotBareme(10000, 0)).toThrow(RangeError)
  })
})

describe('impotMarginal', () => {
  it('is the difference IR(base + extra) − IR(base)', () => {
    expect(impotMarginal(0, 14500, 1)).toBe(319)
    expect(impotMarginal(100000, 47550, 1)).toBe(19495.5)
  })
})
