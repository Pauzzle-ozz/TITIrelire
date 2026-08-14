import { describe, expect, it } from 'vitest'

import { adviseParticulier } from '../src/advice/particulier.js'
import type { ParticulierInput } from '../src/engine/particulier.js'

function base(over: Partial<ParticulierInput> = {}): ParticulierInput {
  return { salaireNetImposable: 40000, parts: 1, perContribution: 0, autresRevenus: 0, ...over }
}

function byId(advice: ReturnType<typeof adviseParticulier>, id: string) {
  return advice.find((a) => a.id === id)
}

describe('adviseParticulier — PER', () => {
  it('suggests opening a PER with a quantified saving when none is set', () => {
    const advice = adviseParticulier(base({ perContribution: 0 }))
    const per = byId(advice, 'per-ouvrir')
    expect(per?.kind).toBe('optimisation')
    expect(per?.estimatedGain).toBeGreaterThan(0)
  })

  it('values the current PER contribution', () => {
    const advice = adviseParticulier(base({ perContribution: 3000 }))
    expect(byId(advice, 'per-actuel')?.estimatedGain).toBeGreaterThan(0)
    expect(byId(advice, 'per-ouvrir')).toBeUndefined()
  })

  it('surfaces the remaining PER ceiling as extra saving', () => {
    const advice = adviseParticulier(base({ perContribution: 1000 }))
    const marge = byId(advice, 'per-marge')
    expect(marge).toBeDefined()
    expect(marge?.estimatedGain).toBeGreaterThan(0)
  })

  it('warns when the PER contribution exceeds the ceiling', () => {
    const advice = adviseParticulier(base({ perContribution: 100000 }))
    expect(byId(advice, 'alerte-per_plafond_depasse')?.kind).toBe('alerte')
  })
})

describe('adviseParticulier — frais réels', () => {
  it('shows the frais-réels info when on the 10 % forfait', () => {
    expect(byId(adviseParticulier(base()), 'frais-reels-info')?.kind).toBe('info')
  })

  it('flags frais réels lower than the 10 % forfait as an optimisation to drop them', () => {
    // 40 000 → forfait 4 000 €; declaring only 500 € of frais réels is worse.
    const advice = adviseParticulier(base({ fraisReels: 500 }))
    const drop = byId(advice, 'frais-reels-defavorable')
    expect(drop?.kind).toBe('optimisation')
    expect(drop?.estimatedGain).toBeGreaterThan(0)
  })

  it('does not flag frais réels that beat the forfait', () => {
    const advice = adviseParticulier(base({ fraisReels: 9000 }))
    expect(byId(advice, 'frais-reels-defavorable')).toBeUndefined()
  })
})

describe('adviseParticulier — ordering', () => {
  it('orders optimisations before alertes before info', () => {
    const kinds = adviseParticulier(base({ perContribution: 1000 })).map((a) => a.kind)
    const firstInfo = kinds.indexOf('info')
    const lastOpt = kinds.lastIndexOf('optimisation')
    if (firstInfo !== -1 && lastOpt !== -1) expect(lastOpt).toBeLessThan(firstInfo)
  })
})
