import { describe, expect, it } from 'vitest'

import { classifyAll, classifyTransaction } from '../src/classify/classify.js'
import { recordCorrection } from '../src/classify/learned.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'

function tx(over: { label?: string; counterparty?: string; amount?: number; id?: string }) {
  return normalizeTransaction({
    id: over.id ?? `id-${over.label ?? 'x'}`,
    date: '2026-03-15',
    amount: over.amount ?? 100,
    currency: 'EUR',
    label: over.label ?? 'x',
    ...(over.counterparty !== undefined ? { counterparty: over.counterparty } : {}),
    source: 'test',
  })
}

describe('classifyTransaction cascade', () => {
  it('applies a deterministic rule when one matches', () => {
    const { classification } = classifyTransaction(tx({ label: 'PRLV URSSAF', amount: -300 }))
    expect(classification.category).toBe('pro')
    expect(classification.source).toBe('rule')
    expect(classification.ruleId).toBe('urssaf')
  })

  it('falls back to unknown when nothing matches', () => {
    const { classification } = classifyTransaction(tx({ label: 'VIR CLIENT ACME FACTURE 42', amount: 1500 }))
    expect(classification.category).toBe('unknown')
    expect(classification.source).toBe('default')
  })

  it('lets a learned correction override even a deterministic rule', () => {
    // Teach that "URSSAF"-labelled counterparty should be perso (contrived, to prove priority).
    const learned = recordCorrection({}, tx({ label: 'PRLV URSSAF', counterparty: 'URSSAF' }), 'perso', '2026-08-14T00:00:00.000Z')
    const { classification } = classifyTransaction(
      tx({ label: 'PRLV URSSAF', counterparty: 'URSSAF', amount: -300 }),
      learned,
    )
    expect(classification.category).toBe('perso')
    expect(classification.source).toBe('learned')
    expect(classification.confidence).toBe(1)
  })

  it('learns an unknown transaction so it is no longer unknown', () => {
    const client = tx({ label: 'VIR CLIENT ACME FACTURE 42', counterparty: 'ACME SARL', amount: 1500 })
    expect(classifyTransaction(client).classification.category).toBe('unknown')

    const learned = recordCorrection({}, client, 'pro', '2026-08-14T00:00:00.000Z')
    const again = classifyTransaction(
      tx({ label: 'VIR CLIENT ACME FACTURE 99', counterparty: 'ACME SARL', amount: 800 }),
      learned,
    )
    expect(again.classification.category).toBe('pro')
    expect(again.classification.source).toBe('learned')
  })
})

describe('classifyAll', () => {
  it('classifies a batch preserving order', () => {
    const txs = [
      tx({ label: 'PRLV URSSAF', amount: -300, id: 'a' }),
      tx({ label: 'VIR SALAIRE', amount: 2000, id: 'b' }),
      tx({ label: 'CB CARREFOUR', amount: -40, id: 'c' }),
      tx({ label: 'VIR MYSTERY', amount: 10, id: 'd' }),
    ]
    const out = classifyAll(txs)
    expect(out.map((c) => c.classification.category)).toEqual(['pro', 'perso', 'perso', 'unknown'])
    expect(out.map((c) => c.transaction.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('defaults to no learned rules', () => {
    expect(classifyAll([tx({ label: 'PRLV URSSAF', amount: -1 })])[0]?.classification.ruleId).toBe('urssaf')
  })
})
