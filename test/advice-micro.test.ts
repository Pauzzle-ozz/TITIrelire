import { describe, expect, it } from 'vitest'

import { adviseMicro, totalEstimatedGain } from '../src/advice/micro.js'
import type { CompareInput } from '../src/engine/compare.js'

function base(over: Partial<CompareInput> = {}): CompareInput {
  return {
    activity: 'prestations_bnc',
    revenue: 40000,
    parts: 1,
    otherHouseholdTaxableIncome: 0,
    acre: false,
    acreReducedRate: false,
    ...over,
  }
}

function byId(advice: ReturnType<typeof adviseMicro>, id: string) {
  return advice.find((a) => a.id === id)
}

describe('adviseMicro — régime IR', () => {
  it('recommends a régime with a quantified euro gain', () => {
    const regime = byId(adviseMicro(base()), 'regime-ir')
    expect(regime).toBeDefined()
    expect(regime?.kind).toBe('optimisation')
    expect(regime?.estimatedGain).toBeGreaterThan(0)
    expect(regime?.ruleRef).toContain('impôt')
  })
})

describe('adviseMicro — ACRE', () => {
  it('surfaces the ACRE lever with a gain when not already claimed', () => {
    const acre = byId(adviseMicro(base({ acre: false })), 'acre')
    expect(acre).toBeDefined()
    expect(acre?.estimatedGain).toBeGreaterThan(0)
    expect(acre?.detail).toMatch(/première année/i)
  })

  it('does not suggest ACRE when it is already claimed', () => {
    expect(byId(adviseMicro(base({ acre: true })), 'acre')).toBeUndefined()
  })
})

describe('adviseMicro — thresholds', () => {
  it('warns when VAT franchise is exceeded (services)', () => {
    const advice = adviseMicro(base({ revenue: 40000 })) // > 37 500 franchise services
    expect(byId(advice, 'tva-depassee')?.kind).toBe('alerte')
  })

  it('warns about proximity just below the VAT franchise', () => {
    const advice = adviseMicro(base({ revenue: 35000 })) // 93 % of 37 500, not over
    expect(byId(advice, 'tva-proche')).toBeDefined()
    expect(byId(advice, 'tva-depassee')).toBeUndefined()
  })

  it('warns when the micro ceiling is exceeded', () => {
    const advice = adviseMicro(base({ revenue: 90000 })) // > 83 600 services ceiling
    expect(byId(advice, 'plafond-depasse')?.kind).toBe('alerte')
  })

  it('does not warn about thresholds well below them', () => {
    const advice = adviseMicro(base({ revenue: 10000 }))
    expect(byId(advice, 'tva-proche')).toBeUndefined()
    expect(byId(advice, 'tva-depassee')).toBeUndefined()
    expect(byId(advice, 'plafond-proche')).toBeUndefined()
  })

  it('uses the sales ceilings for vente de marchandises', () => {
    // 40 000 is under both sales thresholds (85 000 / 203 100) → no VAT/ceiling alert.
    const advice = adviseMicro(base({ activity: 'vente_marchandises', revenue: 40000 }))
    expect(byId(advice, 'tva-depassee')).toBeUndefined()
    expect(byId(advice, 'tva-proche')).toBeUndefined()
  })
})

describe('adviseMicro — ordering and info', () => {
  it('always includes the micro-vs-réel info note', () => {
    expect(byId(adviseMicro(base()), 'reel-info')?.kind).toBe('info')
  })

  it('orders optimisations before alertes before info', () => {
    const kinds = adviseMicro(base({ revenue: 40000 })).map((a) => a.kind)
    const firstAlerte = kinds.indexOf('alerte')
    const firstInfo = kinds.indexOf('info')
    const lastOpt = kinds.lastIndexOf('optimisation')
    expect(lastOpt).toBeLessThan(firstAlerte)
    expect(firstAlerte).toBeLessThan(firstInfo)
  })
})

describe('totalEstimatedGain', () => {
  it('sums only optimisation gains', () => {
    const advice = adviseMicro(base())
    const manual = advice
      .filter((a) => a.kind === 'optimisation')
      .reduce((s, a) => s + (a.estimatedGain ?? 0), 0)
    expect(totalEstimatedGain(advice)).toBeCloseTo(manual, 2)
  })

  it('is zero when there are no optimisations', () => {
    expect(totalEstimatedGain([{ id: 'x', kind: 'info', title: 't', detail: 'd' }])).toBe(0)
  })
})
