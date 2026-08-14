import { describe, expect, it } from 'vitest'

import { aggregateByCategory, proRevenue } from '../src/classify/aggregate.js'
import { classifyAll } from '../src/classify/classify.js'
import { recordCorrection } from '../src/classify/learned.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'

function tx(over: { label?: string; counterparty?: string; amount: number; id: string; date?: string; currency?: string }) {
  return normalizeTransaction({
    id: over.id,
    date: over.date ?? '2026-03-15',
    amount: over.amount,
    currency: over.currency ?? 'EUR',
    label: over.label ?? 'x',
    ...(over.counterparty !== undefined ? { counterparty: over.counterparty } : {}),
    source: 'test',
  })
}

describe('aggregateByCategory', () => {
  it('splits income and expenses by category', () => {
    // Mixed account: a client invoice (learned pro), a salary (perso), URSSAF (pro expense),
    // a supermarket (perso expense), and an unrecognized credit (unknown).
    const client = tx({ label: 'VIR FACTURE', counterparty: 'ACME SARL', amount: 5000, id: 'a' })
    const learned = recordCorrection({}, client, 'pro', '2026-08-14T00:00:00.000Z')

    const txs = [
      client,
      tx({ label: 'VIR SALAIRE EMPLOYEUR', amount: 2000, id: 'b' }),
      tx({ label: 'PRLV URSSAF', amount: -800, id: 'c' }),
      tx({ label: 'CB CARREFOUR', amount: -60, id: 'd' }),
      tx({ label: 'VIR MYSTERE', amount: 300, id: 'e' }),
    ]
    const summary = aggregateByCategory(classifyAll(txs, learned))

    expect(summary.pro.revenue).toBe(5000)
    expect(summary.pro.expenses).toBe(800)
    expect(summary.perso.revenue).toBe(2000)
    expect(summary.perso.expenses).toBe(60)
    expect(summary.unknown.revenue).toBe(300)
    expect(summary.transactionCount).toBe(5)
  })

  it('proRevenue returns professional income only (the CA that feeds the engine)', () => {
    const txs = [
      tx({ label: 'VIR SALAIRE', amount: 2500, id: 'b' }), // perso — must not inflate CA
      tx({ label: 'PRLV URSSAF', amount: -300, id: 'c' }),
    ]
    // Only the salary is income here and it is personal → pro revenue is 0.
    const summary = aggregateByCategory(classifyAll(txs))
    expect(proRevenue(summary)).toBe(0)
  })

  it('filters by year', () => {
    const txs = [
      tx({ label: 'PRLV URSSAF', amount: -100, id: 'c1', date: '2025-12-31' }),
      tx({ label: 'PRLV URSSAF', amount: -200, id: 'c2', date: '2026-01-02' }),
    ]
    const summary = aggregateByCategory(classifyAll(txs), { year: 2026 })
    expect(summary.pro.expenses).toBe(200)
    expect(summary.transactionCount).toBe(1)
    expect(summary.year).toBe(2026)
  })

  it('ignores and reports other currencies', () => {
    const txs = [
      tx({ label: 'VIR', counterparty: 'ACME', amount: 100, id: 'e1' }),
      tx({ label: 'VIR', counterparty: 'ACME', amount: 100, id: 'e2', currency: 'USD' }),
    ]
    const summary = aggregateByCategory(classifyAll(txs), { currency: 'EUR' })
    expect(summary.ignoredCurrencies).toEqual(['USD'])
    expect(summary.transactionCount).toBe(1)
  })

  it('rounds to the cent', () => {
    const txs = [
      tx({ label: 'PRLV URSSAF', amount: 0.1, id: 'r1' }),
      tx({ label: 'PRLV URSSAF', amount: 0.2, id: 'r2' }),
    ]
    expect(aggregateByCategory(classifyAll(txs)).pro.revenue).toBe(0.3)
  })

  it('returns zeroed buckets for an empty input', () => {
    const summary = aggregateByCategory([])
    expect(summary.pro).toEqual({ revenue: 0, expenses: 0, incomeCount: 0, expenseCount: 0 })
    expect(summary.transactionCount).toBe(0)
  })
})
