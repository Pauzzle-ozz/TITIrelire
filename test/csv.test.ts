import { describe, expect, it } from 'vitest'

import { CSV_PRESETS, importCsv, importCsvWithPreset, simulateFromTransactions } from '../src/index.js'
// Low-level helpers are internal to the CSV module (not the public barrel).
import { parseAmount, parseCsv, parseDate } from '../src/transactions/import/csv.js'

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
    ['1 234,56', 1234.56], // non-breaking-space thousands (FR)
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

  it('imports a PayPal-style export (signed Gross, FR dates/decimals)', () => {
    const csv = [
      'Date,Name,Currency,Gross',
      '10/01/2026,Client A,EUR,"1.200,00"',
      '15/01/2026,Remboursement,EUR,"-50,00"',
    ].join('\n')
    const txs = importCsvWithPreset(csv, 'paypal')
    expect(txs[0]).toMatchObject({ date: '2026-01-10', amount: 1200, currency: 'EUR', source: 'paypal' })
    expect(txs[1]!.amount).toBe(-50)
  })

  it('imports a generic FR bank export (débit/crédit)', () => {
    const csv = ['Date;Libellé;Débit;Crédit', '10/01/2026;Vente;;1 200,00', '11/01/2026;Loyer;800,00;'].join(
      '\n',
    )
    const txs = importCsvWithPreset(csv, 'bank_fr')
    expect(txs[0]).toMatchObject({ date: '2026-01-10', amount: 1200, label: 'Vente', source: 'bank' })
    expect(txs[1]!.amount).toBe(-800)
  })

  it('matches FR bank headers even without accents (Debit/Credit/Libelle)', () => {
    const csv = ['Date;Libelle;Debit;Credit', '10/01/2026;Vente;;1 200,00'].join('\n')
    const txs = importCsvWithPreset(csv, 'bank_fr')
    expect(txs[0]).toMatchObject({ amount: 1200, label: 'Vente' })
  })

  it('handles bank_fr edge amounts via the preset path', () => {
    const csv = [
      'Date;Libellé;Débit;Crédit',
      '10/01/2026;Vide;;', // both empty → 0
      '11/01/2026;Signé;-800,00;', // already-signed debit → -800
      '12/01/2026;Gros;;1 234,56', // thousands-grouped credit
    ].join('\n')
    const txs = importCsvWithPreset(csv, 'bank_fr')
    expect(txs.map((t) => t.amount)).toEqual([0, -800, 1234.56])
    expect(txs.every((t) => t.source === 'bank')).toBe(true)
  })
})

describe('parseAmount — single-separator ambiguity contract', () => {
  it('treats a lone comma as a decimal by default', () => {
    expect(parseAmount('1,234')).toBe(1.234)
    expect(parseAmount('1,200')).toBe(1.2)
  })
  it('honors an explicit decimal to resolve thousands', () => {
    expect(parseAmount('1,234', '.')).toBe(1234) // comma = thousands
    expect(parseAmount('1,234', ',')).toBe(1.234) // comma = decimal
  })
})

describe('parseDate — validation', () => {
  it('returns the raw value for a 2-digit year (so normalize rejects it)', () => {
    expect(parseDate('04/03/26', 'dd/mm/yyyy')).toBe('04/03/26')
  })
  it('returns the raw value when there are not exactly 3 parts', () => {
    expect(parseDate('2026-03-04-extra', 'dd/mm/yyyy')).toBe('2026-03-04-extra')
  })
  it('makes importCsv reject a 2-digit-year file', () => {
    expect(() =>
      importCsv('date,amount\n04/03/26,10', { date: 'date', amount: 'amount' }, { dateFormat: 'dd/mm/yyyy' }),
    ).toThrow(RangeError)
  })
})

describe('delimiter detection is quote-aware', () => {
  it('does not miscount separators inside a quoted header field', () => {
    // A genuine semicolon file whose first column name contains commas.
    const rows = parseCsv('"a,b,c";"d"\n"x";"y"')
    expect(rows).toEqual([
      ['a,b,c', 'd'],
      ['x', 'y'],
    ])
  })
})

describe('importCsv — ids and de-duplication', () => {
  it('keeps two genuinely identical rows as distinct transactions', () => {
    const csv = 'date,amount,label\n2026-01-10,10,Café\n2026-01-10,10,Café'
    const txs = importCsv(csv, { date: 'date', amount: 'amount', label: 'label' })
    expect(txs).toHaveLength(2)
    expect(txs[0]!.id).not.toBe(txs[1]!.id)
  })

  it('derives ids that do not shift when an unrelated earlier row is added', () => {
    const base = importCsv('date,amount,label\n2026-01-10,10,Café', {
      date: 'date',
      amount: 'amount',
      label: 'label',
    })
    const withPrior = importCsv('date,amount,label\n2026-01-01,99,Autre\n2026-01-10,10,Café', {
      date: 'date',
      amount: 'amount',
      label: 'label',
    })
    expect(withPrior[1]!.id).toBe(base[0]!.id) // stable across inserts
  })

  it('collapses duplicate ids from a mapped id column (first wins)', () => {
    const csv = 'id,date,amount\nx,2026-01-10,10\nx,2026-02-10,999'
    const txs = importCsv(csv, { id: 'id', date: 'date', amount: 'amount' })
    expect(txs).toHaveLength(1)
    expect(txs[0]!.amount).toBe(10)
  })
})

describe('importCsv — raw retention and debit sign', () => {
  it('omits raw by default and keeps it only when asked', () => {
    const csv = 'date,amount\n2026-01-10,10'
    const m = { date: 'date', amount: 'amount' }
    expect(importCsv(csv, m)[0]!.raw).toBeUndefined()
    expect(importCsv(csv, m, { keepRaw: true })[0]!.raw).toEqual(['2026-01-10', '10'])
  })

  it('treats a signed debit column as a magnitude (no double negative)', () => {
    const csv = 'Date;Débit;Crédit\n10/01/2026;-50,00;\n11/01/2026;;100,00'
    const txs = importCsv(
      csv,
      { date: 'Date', debit: 'Débit', credit: 'Crédit' },
      { dateFormat: 'dd/mm/yyyy', decimal: ',' },
    )
    expect(txs[0]!.amount).toBe(-50) // -(|−50|) = −50, not +50
    expect(txs[1]!.amount).toBe(100)
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
