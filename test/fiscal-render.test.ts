import { describe, expect, it } from 'vitest'

import { buildLedger } from '../src/accounting/ledger.js'
import { classifyAll } from '../src/classify/classify.js'
import { recordCorrection, type LearnedRules } from '../src/classify/learned.js'
import { tvaStatus } from '../src/engine/tva.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'
import { renderFiscalTable } from '../src/ui/fiscal-render.js'

function tx(over: { label?: string; counterparty?: string; amount: number; id: string }) {
  return normalizeTransaction({
    id: over.id,
    date: '2026-03-15',
    amount: over.amount,
    currency: 'EUR',
    label: over.label ?? 'x',
    ...(over.counterparty !== undefined ? { counterparty: over.counterparty } : {}),
    source: 'test',
  })
}

function ledgerFrom(txs: ReturnType<typeof tx>[]) {
  let learned: LearnedRules = {}
  for (const t of txs) learned = recordCorrection(learned, t, 'pro', '2026-08-14T00:00:00.000Z')
  return buildLedger(classifyAll(txs, learned))
}

describe('renderFiscalTable', () => {
  it('renders nothing without transactions', () => {
    expect(renderFiscalTable(buildLedger([]))).toBe('')
  })

  it('renders produits, charges and the résultat', () => {
    const ledger = ledgerFrom([
      tx({ label: 'Facture client', counterparty: 'ACME', amount: 5000, id: 'a' }),
      tx({ label: 'PRLV URSSAF', amount: -800, id: 'b' }),
    ])
    const html = renderFiscalTable(ledger)
    expect(html).toContain('Ma situation fiscale')
    expect(html).toContain('Produits')
    expect(html).toContain('Charges')
    expect(html).toContain('Résultat')
    expect(html).toContain('positive') // 5000 - 800 > 0
  })

  it('marks a déficit as negative', () => {
    const ledger = ledgerFrom([
      tx({ label: 'Facture', counterparty: 'ACME', amount: 500, id: 'a' }),
      tx({ label: 'Achat matiere', amount: -900, id: 'b' }),
    ])
    expect(renderFiscalTable(ledger)).toContain('negative')
  })

  it('includes the VAT régime when provided', () => {
    const ledger = ledgerFrom([tx({ label: 'Facture', counterparty: 'ACME', amount: 45000, id: 'a' })])
    const html = renderFiscalTable(ledger, tvaStatus({ ca: 45000, activity: 'prestations_bnc' }))
    expect(html).toContain('TVA')
    expect(html).toContain('due') // réel above the majoré threshold
  })

  it('escapes transaction-derived labels', () => {
    const ledger = ledgerFrom([tx({ label: '<img src=x>', counterparty: 'ACME', amount: 1000, id: 'a' })])
    const html = renderFiscalTable(ledger)
    expect(html).not.toContain('<img src=x>')
  })
})
