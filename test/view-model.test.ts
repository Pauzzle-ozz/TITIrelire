import { describe, expect, it } from 'vitest'

import { compare, compareDividendes, comparePER, simulateParticulier } from '../src/index.js'
import {
  formatEUR,
  formatPct,
  modeLabel,
  toMicroViewModel,
  toParticulierViewModel,
  toSocieteViewModel,
} from '../src/ui/view-model.js'

describe('formatters', () => {
  it('formats euros in French style', () => {
    const formatted = formatEUR(43481)
    expect(formatted).toContain('43')
    expect(formatted).toContain('481')
    expect(formatted).toContain('€')
  })

  it('formats percentages in French style', () => {
    expect(formatPct(0.13).replace(/\s/g, ' ')).toMatch(/13\s?%/)
  })

  it('labels the two micro income-tax modes', () => {
    expect(modeLabel('bareme')).toContain('barème')
    expect(modeLabel('versement_liberatoire')).toContain('versement')
  })
})

describe('toMicroViewModel', () => {
  it('builds a coherent model for a barème-recommended case', () => {
    const vm = toMicroViewModel(compare({ activity: 'vente_marchandises', revenue: 50000 }))
    expect(vm.recommendationTitle).toContain('barème')
    expect(vm.comparison?.rows).toHaveLength(2)
    const recommended = vm.comparison!.rows.filter((r) => r.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0]!.label).toContain('barème')
    expect(vm.breakdown).toHaveLength(3)
    expect(vm.netHighlight).toContain('€')
    expect(vm.warnings.some((w) => w.message.includes('CFE'))).toBe(true)
  })

  it('marks the versement libératoire as recommended when it wins', () => {
    const vm = toMicroViewModel(compare({ activity: 'prestations_bnc', revenue: 40000 }))
    expect(vm.comparison!.rows.find((r) => r.recommended)?.label).toContain('versement')
    expect(vm.recommendationTitle).toContain('versement')
  })
})

describe('toParticulierViewModel', () => {
  it('shows the sans/avec-PER comparison and the saving', () => {
    const input = { salaireNetImposable: 40000, perContribution: 5000 }
    const vm = toParticulierViewModel(simulateParticulier(input), comparePER(input))
    expect(vm.recommendationTitle).toContain('PER')
    expect(vm.comparison?.rows).toHaveLength(2)
    expect(vm.comparison!.rows[1]!.recommended).toBe(true) // avec PER
    expect(vm.netLabel).toContain('net')
    expect(vm.breakdown.length).toBeGreaterThan(0)
  })

  it('omits the comparison when there is no PER contribution', () => {
    const input = { salaireNetImposable: 40000 }
    const vm = toParticulierViewModel(simulateParticulier(input), comparePER(input))
    expect(vm.comparison).toBeUndefined()
    expect(vm.netHighlight).toContain('€')
  })
})

describe('toSocieteViewModel', () => {
  it('shows PFU vs barème and a breakdown consistent with the recommended option', () => {
    // benefice 100 000 → barème is recommended, so the breakdown must be the barème path.
    const vm = toSocieteViewModel(compareDividendes({ benefice: 100000 }))
    expect(vm.comparison?.rows).toHaveLength(2)
    expect(vm.recommendationTitle).toContain('barème')
    expect(vm.breakdown.some((r) => r.label.includes('sociétés'))).toBe(true)
    expect(vm.breakdown.some((r) => r.label.includes('Prélèvements sociaux'))).toBe(true)
    expect(vm.breakdown.some((r) => r.label.includes('flat tax'))).toBe(false)
    expect(vm.netHighlight).toContain('€')
    expect(vm.effectiveRateLabel).toContain('dividende')
  })
})
