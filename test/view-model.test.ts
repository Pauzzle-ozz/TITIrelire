import { describe, expect, it } from 'vitest'

import { compare } from '../src/index.js'
import { formatEUR, formatPct, modeLabel, toViewModel } from '../src/ui/view-model.js'

describe('formatters', () => {
  it('formats euros in French style', () => {
    // Non-breaking spaces make exact matching brittle; assert the salient parts.
    const formatted = formatEUR(43481)
    expect(formatted).toContain('43')
    expect(formatted).toContain('481')
    expect(formatted).toContain('€')
  })

  it('formats percentages in French style', () => {
    expect(formatPct(0.13).replace(/\s/g, ' ')).toMatch(/13\s?%/)
  })

  it('labels the two income-tax modes', () => {
    expect(modeLabel('bareme')).toContain('barème')
    expect(modeLabel('versement_liberatoire')).toContain('versement')
  })
})

describe('toViewModel', () => {
  it('builds a coherent model for a barème-recommended case', () => {
    const vm = toViewModel(compare({ activity: 'vente_marchandises', revenue: 50000 }))
    expect(vm.recommendationTitle).toContain('barème')
    expect(vm.options).toHaveLength(2)
    expect(vm.options[0]!.mode).toBe('bareme')
    const recommended = vm.options.filter((o) => o.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0]!.mode).toBe('bareme')
    // Breakdown: social contributions, CFP, income tax.
    expect(vm.breakdown).toHaveLength(3)
    expect(vm.netHighlight).toContain('€')
    expect(vm.warnings.some((w) => w.message.includes('CFE'))).toBe(true)
  })

  it('marks the versement libératoire as recommended when it wins', () => {
    const vm = toViewModel(compare({ activity: 'prestations_bnc', revenue: 40000 }))
    const recommended = vm.options.find((o) => o.recommended)
    expect(recommended?.mode).toBe('versement_liberatoire')
    expect(vm.recommendationTitle).toContain('versement')
  })
})
