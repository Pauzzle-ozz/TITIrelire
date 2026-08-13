import { describe, expect, it } from 'vitest'

import {
  aggregateTurnover,
  compareFromTransactions,
  direction,
  normalizeAll,
  normalizeTransaction,
  simulateFromTransactions,
} from '../src/index.js'
import type { RawTransaction, Transaction } from '../src/index.js'

function tx(over: Partial<Transaction>): Transaction {
  return normalizeTransaction({
    id: 'id-1',
    date: '2026-01-15',
    amount: 100,
    currency: 'EUR',
    label: 'x',
    source: 'test',
    ...over,
  })
}

describe('normalizeTransaction', () => {
  it('normalizes a well-formed record', () => {
    const t = normalizeTransaction({
      id: ' abc ',
      date: '2026-03-04T10:00:00Z',
      amount: '1200.50',
      currency: 'eur',
      label: '  Facture 12 ',
      source: 'stripe',
    })
    expect(t.id).toBe('abc')
    expect(t.date).toBe('2026-03-04')
    expect(t.amount).toBe(1200.5)
    expect(t.currency).toBe('EUR')
    expect(t.label).toBe('Facture 12')
  })

  it('defaults currency to EUR and source to unknown', () => {
    const t = normalizeTransaction({ id: '1', date: '2026-01-01', amount: 10 })
    expect(t.currency).toBe('EUR')
    expect(t.source).toBe('unknown')
  })

  it('derives direction from the amount sign', () => {
    expect(direction(tx({ amount: 100 }))).toBe('income')
    expect(direction(tx({ amount: -100 }))).toBe('expense')
    expect(direction(tx({ amount: 0 }))).toBe('income')
  })

  it.each([
    { id: '', date: '2026-01-01', amount: 1 },
    { id: '1', date: '01/01/2026', amount: 1 },
    { id: '1', date: '2026-13-01', amount: 1 },
    { id: '1', date: '2026-01-01', amount: 'abc' },
    { id: '1', date: '2026-01-01', amount: Number.POSITIVE_INFINITY },
  ])('rejects invalid record %#', (raw) => {
    expect(() => normalizeTransaction(raw as RawTransaction)).toThrow(RangeError)
  })
})

describe('normalizeAll', () => {
  it('de-duplicates by id (first wins)', () => {
    const list = normalizeAll([
      { id: 'a', date: '2026-01-01', amount: 10 },
      { id: 'a', date: '2026-02-01', amount: 999 },
      { id: 'b', date: '2026-01-01', amount: 20 },
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.amount).toBe(10)
  })
})

describe('aggregateTurnover', () => {
  const transactions = [
    tx({ id: '1', date: '2026-01-10', amount: 1000 }),
    tx({ id: '2', date: '2026-02-10', amount: 500 }),
    tx({ id: '3', date: '2026-03-10', amount: -200 }), // expense
    tx({ id: '4', date: '2025-12-31', amount: 9999 }), // other year
    tx({ id: '5', date: '2026-04-10', amount: 300, currency: 'USD' }), // other currency
  ]

  it('sums income and expenses for the requested year and currency', () => {
    const s = aggregateTurnover(transactions, { year: 2026, currency: 'EUR' })
    expect(s.revenue).toBe(1500)
    expect(s.expenses).toBe(200)
    expect(s.incomeCount).toBe(2)
    expect(s.transactionCount).toBe(3)
    expect(s.ignoredCurrencies).toEqual(['USD'])
  })

  it('without a year filter, counts every EUR transaction', () => {
    const s = aggregateTurnover(transactions, { currency: 'EUR' })
    expect(s.revenue).toBe(11499) // 1000 + 500 + 9999
  })

  it('defaults to EUR', () => {
    expect(aggregateTurnover(transactions).currency).toBe('EUR')
  })
})

describe('normalizeTransaction — real calendar days', () => {
  it.each(['2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2025-02-29'])(
    'rejects impossible day %s',
    (date) => {
      expect(() => normalizeTransaction({ id: '1', date, amount: 1 })).toThrow(RangeError)
    },
  )
  it('accepts a valid leap day', () => {
    expect(normalizeTransaction({ id: '1', date: '2028-02-29', amount: 1 }).date).toBe('2028-02-29')
  })
})

describe('aggregateTurnover — numeric robustness', () => {
  it('rounds away float accumulation error over many small amounts', () => {
    const cents = Array.from({ length: 10 }, (_, i) =>
      tx({ id: `c${i}`, date: '2026-01-01', amount: 0.1 }),
    )
    // Naive sum of ten 0.1 is 0.9999999999999999; the final round fixes it.
    expect(aggregateTurnover(cents, { year: 2026 }).revenue).toBe(1)
  })

  it('counts a zero-amount transaction as income (consistent with direction())', () => {
    const s = aggregateTurnover([tx({ id: 'z', amount: 0 }), tx({ id: 'p', amount: 100 })])
    expect(s.incomeCount).toBe(2)
    expect(s.revenue).toBe(100)
  })

  it('matches currencies case-insensitively', () => {
    // Bypass normalize (which uppercases) to exercise aggregate's own comparison.
    const lower: Transaction = {
      id: 'l',
      date: '2026-01-01',
      amount: 1000,
      currency: 'eur',
      label: '',
      source: 'test',
    }
    const s = aggregateTurnover([lower], { currency: 'EUR' })
    expect(s.revenue).toBe(1000)
    expect(s.ignoredCurrencies).toEqual([])
  })
})

describe('simulate/compare from transactions', () => {
  const transactions = normalizeAll([
    { id: '1', date: '2026-01-10', amount: 20000, source: 'stripe' },
    { id: '2', date: '2026-06-10', amount: 20000, source: 'stripe' },
    { id: '3', date: '2026-06-11', amount: -1500, source: 'stripe' }, // expense, ignored for CA
  ])

  it('aggregates then simulates (40 000 € BNC == direct simulate)', () => {
    const { summary, simulation } = simulateFromTransactions(transactions, {
      activity: 'prestations_bnc',
      year: 2026,
    })
    expect(summary.revenue).toBe(40000)
    expect(simulation.revenue).toBe(40000)
    expect(simulation.socialContributions.amount).toBe(10240)
    expect(simulation.netIncome).toBe(28052)
  })

  it('aggregates then compares (recommends VL for BNC 40 000 €)', () => {
    const { summary, comparison } = compareFromTransactions(transactions, {
      activity: 'prestations_bnc',
      year: 2026,
    })
    expect(summary.revenue).toBe(40000)
    expect(comparison.recommended).toBe('versement_liberatoire')
    expect(comparison.netGain).toBe(748)
  })
})
