import { describe, expect, it } from 'vitest'

import { comparePER, perPlafond, simulateParticulier } from '../src/index.js'

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

  it('reaches the 41 %/45 % bands on a high salary', () => {
    const r = simulateParticulier({ salaireNetImposable: 300000 })
    expect(r.taxableSalary).toBe(285444)
    expect(r.incomeTax).toBe(104973.64)
    expect(r.netAfterTax).toBe(195026.36)
    expect(r.effectiveRate).toBe(0.3499)
  })

  it('caps frais réels at the salary and warns', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000, fraisReels: 50000 })
    expect(r.abattement.amount).toBe(40000)
    expect(r.taxableSalary).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.abattement.detail).toContain('50000') // reports the declared amount
    expect(r.warnings.some((w) => w.code === 'frais_reels_plafonnes')).toBe(true)
  })

  it('caps the PER deduction at the 37 680 € ceiling on a high salary', () => {
    const r = simulateParticulier({ salaireNetImposable: 500000, perContribution: 45000 })
    expect(r.perDeductible).toBe(37680)
    expect(r.warnings.some((w) => w.code === 'per_plafond_depasse')).toBe(true)
  })

  it('scales other household income on top of the salary (marginal tax)', () => {
    const r = simulateParticulier({ salaireNetImposable: 40000, autresRevenus: 30000 })
    expect(r.taxableIncome).toBe(66000)
    expect(r.incomeTax).toBe(10800) // marginal: IR(66 000) − IR(30 000)
    expect(r.netAfterTax).toBe(29200)
  })

  it('applies the quotient familial with plafonnement (single, 2 parts)', () => {
    const r = simulateParticulier({ salaireNetImposable: 80000, parts: 2 })
    expect(r.taxableSalary).toBe(72000)
    // A single filer with 2 parts: the QF advantage is capped (plafonnement).
    expect(r.incomeTax).toBe(11089.99)
    expect(r.incomeTax).toBeLessThan(simulateParticulier({ salaireNetImposable: 80000 }).incomeTax)
  })

  it('does not cap the QF for a couple (base parts = 2)', () => {
    const r = simulateParticulier({ salaireNetImposable: 80000, parts: 2, couple: true })
    expect(r.incomeTax).toBe(7807.98) // no plafonnement → lower than the single case
  })
})

describe('perPlafond', () => {
  it('clamps 10 % of the taxable salary between the floor and ceiling', () => {
    expect(perPlafond(500000)).toBe(37680) // ceiling
    expect(perPlafond(20000)).toBe(4710) // floor
    expect(perPlafond(100000)).toBe(10000) // 10 %
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
