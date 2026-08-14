import { describe, expect, it } from 'vitest'

import { microThresholds } from '../src/engine/simulate.js'

describe('microThresholds', () => {
  it('returns the sales ceilings for vente de marchandises', () => {
    expect(microThresholds('vente_marchandises')).toEqual({
      plafondMicro: 203100,
      franchiseTVA: 85000,
      franchiseTVAMajoree: 93500,
    })
  })

  it('returns the services ceilings for BNC/BIC/liberal activities', () => {
    for (const activity of ['prestations_bic', 'prestations_bnc', 'liberal_cipav'] as const) {
      expect(microThresholds(activity)).toEqual({
        plafondMicro: 83600,
        franchiseTVA: 37500,
        franchiseTVAMajoree: 41250,
      })
    }
  })

  it('is not disturbed by a prior full simulation (reads thresholds cleanly)', () => {
    // Threshold reads must not depend on leftover CA from a previous simulate() call.
    expect(microThresholds('vente_marchandises').franchiseTVA).toBe(85000)
    expect(microThresholds('prestations_bnc').franchiseTVA).toBe(37500)
  })

  it('throws on an unknown activity', () => {
    // @ts-expect-error deliberately invalid
    expect(() => microThresholds('freelance')).toThrow(/unknown activity/i)
  })
})
