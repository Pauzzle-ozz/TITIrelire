import { describe, expect, it } from 'vitest'

import { impotBareme, impotMarginal } from '../src/index.js'

describe('impotBareme (2026 scale)', () => {
  it.each([
    [0, 1, 0],
    [11600, 1, 0], // exactly at the 0 % ceiling
    [14500, 1, 0], // 319 € raw, entirely wiped by the décote
    [39600, 1, 4983.99], // spans 11 % and 30 %, above the décote range
    [100000, 1, 24800.52], // into the 41 % band
    [200000, 1, 66523.84], // into the 45 % band
  ])('IR(%s €, %s part) = %s', (income, parts, expected) => {
    expect(impotBareme(income, parts)).toBe(expected)
  })

  it('reduces tax with more parts (quotient familial), but not linearly (plafonnement/décote)', () => {
    expect(impotBareme(40000, 2)).toBeLessThan(impotBareme(40000, 1))
  })

  it('treats negative income as zero', () => {
    expect(impotBareme(-5000, 1)).toBe(0)
  })

  it('rejects invalid parts and baseParts', () => {
    expect(() => impotBareme(10000, 0)).toThrow(RangeError)
    expect(() => impotBareme(10000, 1, 3)).toThrow(RangeError)
  })
})

describe('décote 2026', () => {
  it('wipes a small tax entirely (single)', () => {
    expect(impotBareme(14500, 1)).toBe(0) // raw 319 € → décote > 319 → 0
  })

  it('partially reduces a mid tax (single)', () => {
    expect(impotBareme(25000, 1)).toBe(1243.99) // raw 1474 €, décote ~230 €
  })

  it('matches the official couple example (economie.gouv): IR 2250 € → 1785 €', () => {
    // 43 654,55 € for a couple (2 parts, baseParts 2) yields ~2250 € raw; décote 465 € → 1785 €.
    expect(impotBareme(43654.55, 2, 2)).toBeCloseTo(1785, 0)
  })

  it('uses the couple ceiling when baseParts = 2', () => {
    expect(impotBareme(30000, 2, 2)).toBe(0) // couple décote (1483 €) wipes the small tax
  })
})

describe('plafonnement du quotient familial', () => {
  it('caps the QF advantage above the base parts (high income)', () => {
    // Single filer with 2 parts: advantage capped at 2 × 1807 = 3614 €.
    expect(impotBareme(80000, 2)).toBe(13489.99)
  })

  it('does not cap when the advantage stays under the ceiling', () => {
    expect(impotBareme(40000, 2)).toBe(1787.22)
  })
})

describe('impotMarginal', () => {
  it('is the difference IR(base + extra) − IR(base)', () => {
    expect(impotMarginal(0, 14500, 1)).toBe(0) // wiped by décote
    expect(impotMarginal(100000, 47550, 1)).toBe(19495.5)
  })

  it('reflects plafonnement and décote with parts > 1', () => {
    expect(impotMarginal(40000, 40000, 2)).toBe(11702.77)
    expect(impotMarginal(40000, 40000, 2)).toBe(impotBareme(80000, 2) - impotBareme(40000, 2))
  })
})
