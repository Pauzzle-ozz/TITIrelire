import { describe, expect, it } from 'vitest'

import { compareMicroReel, ESTIMATED_TNS_RATE, simulateReel } from '../src/engine/reel.js'
import type { CompareInput } from '../src/engine/compare.js'

describe('simulateReel', () => {
  it('computes résultat, estimated TNS contributions, tax and net', () => {
    const r = simulateReel({ produits: 50000, charges: 20000, parts: 1 })
    expect(r.resultatAvantCotisations).toBe(30000)
    expect(r.cotisationsSociales.amount).toBe(round(30000 * ESTIMATED_TNS_RATE))
    expect(r.revenuImposable).toBe(round(30000 - 30000 * ESTIMATED_TNS_RATE))
    expect(r.net).toBeGreaterThan(0)
    expect(r.net).toBe(round(r.resultatAvantCotisations - r.cotisationsSociales.amount - r.incomeTax))
  })

  it('flags the TNS contributions as an estimate', () => {
    const r = simulateReel({ produits: 40000, charges: 10000 })
    expect(r.cotisationsSociales.label).toMatch(/estimation/i)
    expect(r.warnings.some((w) => w.code === 'tns_estimation')).toBe(true)
  })

  it('handles a déficit (charges > produits) without negative contributions', () => {
    const r = simulateReel({ produits: 10000, charges: 15000 })
    expect(r.resultatAvantCotisations).toBe(-5000)
    expect(r.cotisationsSociales.amount).toBe(0)
    expect(r.incomeTax).toBe(0)
  })

  it('rejects invalid input', () => {
    expect(() => simulateReel({ produits: -1, charges: 0 })).toThrow(RangeError)
    expect(() => simulateReel({ produits: 0, charges: -1 })).toThrow(RangeError)
    expect(() => simulateReel({ produits: 0, charges: 0, parts: 0 })).toThrow(RangeError)
  })
})

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const microBase = (over: Partial<CompareInput> = {}): CompareInput => ({
  activity: 'prestations_bnc',
  revenue: 50000,
  parts: 1,
  otherHouseholdTaxableIncome: 0,
  acre: false,
  acreReducedRate: false,
  ...over,
})

describe('compareMicroReel', () => {
  it('prefers réel when real charges are high', () => {
    // BNC abattement is 34 % (17 000 € on 50 000 €); 30 000 € of real charges beats it.
    const c = compareMicroReel(microBase({ revenue: 50000 }), 30000)
    expect(c.recommended).toBe('reel')
    expect(c.netGain).toBeGreaterThan(0)
    expect(c.explanation).toMatch(/réel/i)
  })

  it('prefers micro when real charges are low', () => {
    // With almost no charges, the 34 % flat abattement wins.
    const c = compareMicroReel(microBase({ revenue: 50000 }), 2000)
    expect(c.recommended).toBe('micro')
    expect(c.netGain).toBeGreaterThan(0)
  })

  it('exposes both nets and the réel detail', () => {
    const c = compareMicroReel(microBase(), 10000)
    expect(c.microNet).toBeGreaterThan(0)
    expect(c.reelNet).toBeGreaterThan(0)
    expect(c.reel.cotisationsSociales.amount).toBeGreaterThan(0)
  })
})
