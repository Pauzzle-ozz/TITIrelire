import { describe, expect, it } from 'vitest'

import { buildLedger, chargeCategory, produitCategory } from '../src/accounting/ledger.js'
import { classifyAll } from '../src/classify/classify.js'
import { recordCorrection, type LearnedRules } from '../src/classify/learned.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'

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

describe('chargeCategory', () => {
  it('maps keywords to PCG-inspired buckets', () => {
    expect(chargeCategory('PRLV URSSAF')).toBe('charges_sociales')
    expect(chargeCategory('Loyer bureau')).toBe('services_exterieurs')
    expect(chargeCategory('Acompte TVA')).toBe('impots_taxes')
    expect(chargeCategory('Achat marchandises')).toBe('achats')
    expect(chargeCategory('Quelque chose')).toBe('autres_charges')
  })
})

describe('produitCategory', () => {
  it('maps income keywords to CA vs autres', () => {
    expect(produitCategory('Facture client ACME')).toBe('ventes_prestations')
    expect(produitCategory('Virement divers')).toBe('autres_produits')
  })
})

describe('buildLedger', () => {
  it('builds a compte de résultat from pro transactions only', () => {
    const client = tx({ label: 'Facture client', counterparty: 'ACME', amount: 5000, id: 'a' })
    const learned: LearnedRules = recordCorrection({}, client, 'pro', '2026-08-14T00:00:00.000Z')
    const txs = [
      client, // pro income
      tx({ label: 'PRLV URSSAF', amount: -800, id: 'b' }), // pro charge (social)
      tx({ label: 'Loyer bureau', amount: -600, id: 'c', counterparty: 'SCI' }), // pro charge — but needs pro
      tx({ label: 'VIR SALAIRE', amount: 2000, id: 'd' }), // perso income → excluded
      tx({ label: 'CB CARREFOUR', amount: -60, id: 'e' }), // perso → excluded
    ]
    // Mark the loyer as pro too (heuristics classify it unknown otherwise).
    const learned2 = recordCorrection(learned, txs[2]!, 'pro', '2026-08-14T00:00:00.000Z')
    const ledger = buildLedger(classifyAll(txs, learned2))

    expect(ledger.produits.total).toBe(5000)
    expect(ledger.charges.total).toBe(1400) // 800 + 600
    expect(ledger.resultat).toBe(3600)
    expect(ledger.transactionCount).toBe(3) // 1 income + 2 charges (pro only)
    expect(ledger.charges.lines.map((l) => l.category)).toContain('charges_sociales')
    expect(ledger.charges.lines.map((l) => l.category)).toContain('services_exterieurs')
  })

  it('sorts lines by descending amount', () => {
    const txs = [
      tx({ label: 'Facture A', counterparty: 'ACME', amount: 1000, id: 'a' }),
      tx({ label: 'PRLV URSSAF', amount: -200, id: 'b' }),
      tx({ label: 'Loyer', amount: -900, id: 'c', counterparty: 'SCI' }),
    ]
    let learned: LearnedRules = {}
    for (const t of txs) learned = recordCorrection(learned, t, 'pro', '2026-08-14T00:00:00.000Z')
    const ledger = buildLedger(classifyAll(txs, learned))
    expect(ledger.charges.lines[0]!.amount).toBeGreaterThanOrEqual(ledger.charges.lines[1]!.amount)
  })

  it('handles an empty ledger', () => {
    const ledger = buildLedger([])
    expect(ledger.produits.total).toBe(0)
    expect(ledger.charges.total).toBe(0)
    expect(ledger.resultat).toBe(0)
  })

  it('can produce a déficit (negative résultat)', () => {
    const txs = [
      tx({ label: 'Facture', counterparty: 'ACME', amount: 500, id: 'a' }),
      tx({ label: 'Achat matiere', amount: -900, id: 'b' }),
    ]
    let learned: LearnedRules = {}
    for (const t of txs) learned = recordCorrection(learned, t, 'pro', '2026-08-14T00:00:00.000Z')
    expect(buildLedger(classifyAll(txs, learned)).resultat).toBe(-400)
  })

  it('filters by year', () => {
    const txs = [
      tx({ label: 'Facture', counterparty: 'ACME', amount: 1000, id: 'a', date: '2025-12-31' }),
      tx({ label: 'Facture', counterparty: 'ACME', amount: 2000, id: 'b', date: '2026-01-02' }),
    ]
    let learned: LearnedRules = {}
    for (const t of txs) learned = recordCorrection(learned, t, 'pro', '2026-08-14T00:00:00.000Z')
    expect(buildLedger(classifyAll(txs, learned), { year: 2026 }).produits.total).toBe(2000)
  })
})
