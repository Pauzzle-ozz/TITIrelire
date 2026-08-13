import { describe, expect, it } from 'vitest'

import {
  CSV_PRESETS,
  importCsv,
  importCsvWithPreset,
  parseAmount,
  parseCsv,
  parseDate,
  simulateFromTransactions,
} from '../src/index.js'

describe('parseCsv', () => {
  it('handles quoted fields, escaped quotes and embedded delimiters', () => {
    const rows = parseCsv('a,b\n"x,y","he said ""hi"""\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
    ])
  })

  it('auto-detects a semicolon delimiter', () => {
    const rows = parseCsv('a;b;c\n1;2;3')
    expect(rows[1]).toEqual(['1', '2', '3'])
  })

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseAmount', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['-42,00', -42],
    ['(99.90)', -99.9],
    ['€ 1 000,00', 1000],
  ])('parses %s → %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it('respects an explicit comma decimal', () => {
    expect(parseAmount('1.000', ',')).toBe(1000) // dot as thousands
    expect(parseAmount('1,5', ',')).toBe(1.5)
  })
})

describe('parseDate', () => {
  it('passes through ISO and truncates a datetime', () => {
    expect(parseDate('2026-03-04T10:00:00Z', 'iso')).toBe('2026-03-04')
  })
  it('converts dd/mm/yyyy and mm/dd/yyyy', () => {
    expect(parseDate('04/03/2026', 'dd/mm/yyyy')).toBe('2026-03-04')
    expect(parseDate('03/04/2026', 'mm/dd/yyyy')).toBe('2026-03-04')
  })
})

describe('importCsv', () => {
  it('imports a generic export into canonical transactions', () => {
    const csv = [
      'id,date,amount,currency,label',
      'a,2026-01-10,1000.00,EUR,Facture 1',
      'b,2026-02-10,500.00,EUR,Facture 2',
    ].join('\n')
    const txs = importCsv(csv, CSV_PRESETS.generic!.mapping)
    expect(txs).toHaveLength(2)
    expect(txs[0]).toMatchObject({ id: 'a', date: '2026-01-10', amount: 1000, currency: 'EUR', label: 'Facture 1' })
  })

  it('supports debit/credit bank-style columns', () => {
    const csv = [
      'Date;Libellé;Débit;Crédit',
      '10/01/2026;Vente;;1200,00',
      '11/01/2026;Achat;300,50;',
    ].join('\n')
    const txs = importCsv(
      csv,
      { date: 'Date', label: 'Libellé', debit: 'Débit', credit: 'Crédit' },
      { dateFormat: 'dd/mm/yyyy', decimal: ',' },
    )
    expect(txs[0]!.amount).toBe(1200) // credit
    expect(txs[1]!.amount).toBe(-300.5) // debit → negative
  })

  it('derives a stable id when no id column is mapped', () => {
    const csv = 'date,amount,label\n2026-01-10,1000,Vente'
    const first = importCsv(csv, { date: 'date', amount: 'amount', label: 'label' })
    const second = importCsv(csv, { date: 'date', amount: 'amount', label: 'label' })
    expect(first[0]!.id).toBe(second[0]!.id) // deterministic across runs
  })

  it('throws when a mapped column is missing from the header', () => {
    expect(() => importCsv('date,amount\n2026-01-01,10', { date: 'date', amount: 'montant' })).toThrow(
      RangeError,
    )
  })

  it('returns an empty list for a header-only file', () => {
    expect(importCsv('id,date,amount\n', CSV_PRESETS.generic!.mapping)).toEqual([])
  })
})

describe('importCsvWithPreset', () => {
  it('imports a Stripe-style export via the preset', () => {
    const csv = [
      'id,created,amount,currency,description',
      'ch_1,2026-01-10,1000.00,eur,Subscription',
    ].join('\n')
    const txs = importCsvWithPreset(csv, 'stripe')
    expect(txs[0]).toMatchObject({ id: 'ch_1', amount: 1000, currency: 'EUR', source: 'stripe' })
  })

  it('rejects an unknown preset', () => {
    expect(() => importCsvWithPreset('a\n1', 'sap')).toThrow(RangeError)
  })
})

describe('CSV → simulation end-to-end', () => {
  it('imports a BNC year of invoices and simulates 40 000 €', () => {
    const csv = [
      'id,date,amount,currency,label',
      'i1,2026-03-01,25000,EUR,Prestation Q1',
      'i2,2026-09-01,15000,EUR,Prestation Q3',
      'r1,2026-09-15,-800,EUR,Remboursement frais', // expense, not turnover
    ].join('\n')
    const txs = importCsv(csv, CSV_PRESETS.generic!.mapping)
    const { summary, simulation } = simulateFromTransactions(txs, { activity: 'prestations_bnc', year: 2026 })
    expect(summary.revenue).toBe(40000)
    expect(summary.expenses).toBe(800)
    expect(simulation.netIncome).toBe(28052)
  })
})
