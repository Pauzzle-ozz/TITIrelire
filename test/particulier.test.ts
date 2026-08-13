import { describe, expect, it } from 'vitest'

import { comparePER, simulateParticulier } from '../src/index.js'

describe('simulateParticulier — income tax on salary', () => {
  it('applies the 10 % deduction then the scale (salary 40 000 €)', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000 })
    expect(r.abattement.amount).toBe(4000)
    expect(r.taxableSalary).toBe(36000)
    expect(r.incomeTax).toBe(3903.99) // IR(36 000)
    expect(r.netAfterTax).toBe(36096.01)
  })

  it('applies the 499 € minimum deduction for a low salary', () => {
    const r = simulateParticulier({ salaireNetImposable: 3000 })
    expect(r.abattement.amount).toBe(499)
    expect(r.taxableSalary).toBe(2501)
    expect(r.incomeTax).toBe(0)
  })

  it('caps the deduction at the 14 556 € ceiling for a high salary', () => {
    const r = simulateParticulier({ salaireNetImposable: 200000 })
    expect(r.abattement.amount).toBe(14556)
    expect(r.taxableSalary).toBe(185444)
  })

  it('uses frais réels when provided (no cap)', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000, fraisReels: 8000 })
    expect(r.abattement.amount).toBe(8000)
    expect(r.taxableSalary).toBe(32000)
    expect(r.incomeTax).toBe(2703.99)
  })

  it('deducts a PER contribution up to the ceiling', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000, perContribution: 5000 })
    expect(r.perDeductible).toBe(4710) // floor 4 710 applies (10 % of 36 000 = 3 600)
    expect(r.taxableIncome).toBe(31290)
    expect(r.incomeTax).toBe(2490.99)
    expect(r.warnings.some((w) => w.code === 'per_plafond_depasse')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(() => simulateParticulier({ salaireNetImposable: -1 })).toThrow(RangeError)
    expect(() => simulateParticulier({ salaireNetImposable: 1000, parts: 0 })).toThrow(RangeError)
  })
})

describe('comparePER — optimisation', () => {
  it('quantifies the tax saving and real cost of a PER contribution', () => {
    const c = comparePER({ salaireNetImposable: 40000, perContribution: 5000 })
    expect(c.deductible).toBe(4710)
    expect(c.taxWithout).toBe(3903.99)
    expect(c.taxWith).toBe(2490.99)
    expect(c.taxSaving).toBe(1413)
    expect(c.netCost).toBe(3297) // 4710 − 1413
    expect(c.explanation).toContain('PER')
  })

  it('reports no saving when there is no contribution', () => {
    const c = comparePER({ salaireNetImposable: 40000 })
    expect(c.taxSaving).toBe(0)
    expect(c.deductible).toBe(0)
  })
})
