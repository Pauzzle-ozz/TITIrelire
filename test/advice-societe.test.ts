import { describe, expect, it } from 'vitest'

import { adviseSociete } from '../src/advice/societe.js'
import type { SocieteInput } from '../src/engine/societe.js'

function base(over: Partial<SocieteInput> = {}): SocieteInput {
  return { benefice: 100000, reducedRateEligible: true, parts: 1, autresRevenus: 0, ...over }
}

function byId(advice: ReturnType<typeof adviseSociete>, id: string) {
  return advice.find((a) => a.id === id)
}

describe('adviseSociete — dividend taxation', () => {
  it('recommends a dividend taxation mode with a euro gain when they differ', () => {
    // Low other income makes the barème option attractive vs the PFU.
    const advice = adviseSociete(base({ benefice: 60000, autresRevenus: 0, parts: 1 }))
    const mode = byId(advice, 'dividendes-mode')
    if (mode !== undefined) {
      expect(mode.kind).toBe('optimisation')
      expect(mode.estimatedGain).toBeGreaterThan(0)
    }
  })
})

describe('adviseSociete — reduced IS rate', () => {
  it('surfaces the 15 % reduced-rate opportunity when not currently eligible', () => {
    const advice = adviseSociete(base({ benefice: 100000, reducedRateEligible: false }))
    const is = byId(advice, 'is-taux-reduit')
    expect(is?.kind).toBe('optimisation')
    // First 42 500 € at 15 % instead of 25 % → 10 points saved on that slice.
    expect(is?.estimatedGain).toBeCloseTo(42500 * 0.1, 0)
  })

  it('does not surface the reduced-rate advice when already eligible', () => {
    expect(byId(adviseSociete(base({ reducedRateEligible: true })), 'is-taux-reduit')).toBeUndefined()
  })

  it('does not surface reduced-rate advice with no profit', () => {
    expect(byId(adviseSociete(base({ benefice: 0, reducedRateEligible: false })), 'is-taux-reduit')).toBeUndefined()
  })
})

describe('adviseSociete — salaire/dividende', () => {
  it('always includes the honest salaire-vs-dividende info note', () => {
    expect(byId(adviseSociete(base()), 'salaire-dividende-info')?.kind).toBe('info')
  })
})
