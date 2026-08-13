import { describe, expect, it } from 'vitest'
import { simulateParticulier } from '../src/engine/particulier.js'

describe('refute probe', () => {
  it('salaire=10000 autresRevenus=500000', () => {
    const r = simulateParticulier({ salaireNetImposable: 10000, autresRevenus: 500000 })
    console.log('taxableSalary', r.taxableSalary)
    console.log('taxableIncome', r.taxableIncome)
    console.log('incomeTax', r.incomeTax)
    console.log('netAfterTax', r.netAfterTax)
    console.log('effectiveRate', r.effectiveRate)
    expect(true).toBe(true)
  })
  it('salaire=40000 alone (baseline)', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000 })
    console.log('B netAfterTax', r.netAfterTax, 'effRate', r.effectiveRate)
  })
})
