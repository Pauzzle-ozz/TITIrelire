import { describe, expect, it } from 'vitest'

import { classifyAll } from '../src/classify/classify.js'
import { recordCorrection } from '../src/classify/learned.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'
import { categoryLabel, formatEuro, toTxTableViewModel } from '../src/ui/tx-view-model.js'

function tx(over: { label?: string; counterparty?: string; amount: number; id: string; date?: string }) {
  return normalizeTransaction({
    id: over.id,
    date: over.date ?? '2026-03-15',
    amount: over.amount,
    currency: 'EUR',
    label: over.label ?? 'x',
    ...(over.counterparty !== undefined ? { counterparty: over.counterparty } : {}),
    source: 'test',
  })
}

describe('categoryLabel', () => {
  it('maps categories to French labels', () => {
    expect(categoryLabel('pro')).toBe('Pro')
    expect(categoryLabel('perso')).toBe('Perso')
    expect(categoryLabel('unknown')).toBe('À classer')
  })
})

describe('formatEuro', () => {
  it('formats signed euro amounts in French', () => {
    // Non-breaking spaces are used by Intl; assert on the meaningful parts.
    expect(formatEuro(1200)).toMatch(/1\s?200,00\s?€/)
    expect(formatEuro(-60)).toMatch(/-60,00\s?€/)
  })
})

describe('toTxTableViewModel', () => {
  it('builds one row per transaction with category, reason and confidence', () => {
    const vm = toTxTableViewModel(classifyAll([tx({ label: 'PRLV URSSAF', amount: -300, id: 'a' })]))
    expect(vm.rows).toHaveLength(1)
    const row = vm.rows[0]!
    expect(row.category).toBe('pro')
    expect(row.categoryLabel).toBe('Pro')
    expect(row.direction).toBe('expense')
    expect(row.reason).toContain('URSSAF')
    expect(row.confidencePct).toBe(95)
  })

  it('computes proRevenue from professional income only', () => {
    const client = tx({ label: 'FACTURE', counterparty: 'ACME', amount: 5000, id: 'a' })
    const learned = recordCorrection({}, client, 'pro', '2026-08-14T00:00:00.000Z')
    const vm = toTxTableViewModel(
      classifyAll([client, tx({ label: 'VIR SALAIRE', amount: 2000, id: 'b' })], learned),
    )
    expect(vm.proRevenue).toBe(5000)
    expect(vm.proRevenueLabel).toMatch(/5\s?000,00\s?€/)
  })

  it('counts unknown income transactions needing a decision', () => {
    const vm = toTxTableViewModel(
      classifyAll([
        tx({ label: 'VIR MYSTERE', amount: 900, id: 'a' }), // unknown income
        tx({ label: 'CB MYSTERE', amount: -20, id: 'b' }), // unknown expense (not counted)
        tx({ label: 'PRLV URSSAF', amount: -300, id: 'c' }), // pro
      ]),
    )
    expect(vm.unknownIncomeCount).toBe(1)
  })

  it('handles an empty list', () => {
    const vm = toTxTableViewModel([])
    expect(vm.rows).toEqual([])
    expect(vm.proRevenue).toBe(0)
    expect(vm.unknownIncomeCount).toBe(0)
  })
})
