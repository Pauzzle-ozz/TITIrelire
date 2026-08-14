import { describe, expect, it } from 'vitest'

import { normalizeTransaction } from '../src/transactions/normalize.js'
import { normalizeText, RULES, ruleContext, type ClassificationRule } from '../src/classify/rules.js'

function tx(label: string, amount = 100, counterparty?: string) {
  return normalizeTransaction({
    id: `id-${label}-${amount}`,
    date: '2026-03-15',
    amount,
    currency: 'EUR',
    label,
    ...(counterparty !== undefined ? { counterparty } : {}),
    source: 'test',
  })
}

/** Finds the first rule whose match fires for a transaction (mirrors the cascade order). */
function firstMatch(label: string, amount = 100, counterparty?: string): ClassificationRule | undefined {
  const ctx = ruleContext(tx(label, amount, counterparty))
  return RULES.find((r) => r.match(ctx))
}

describe('normalizeText', () => {
  it('lowercases, strips accents and trims', () => {
    expect(normalizeText('  Éléctricité  ')).toBe('electricite')
    expect(normalizeText('URSSAF Île-de-France')).toBe('urssaf ile-de-france')
  })
})

describe('ruleContext', () => {
  it('joins label and counterparty into the matchable text', () => {
    const ctx = ruleContext(tx('Virement', 500, 'URSSAF'))
    expect(ctx.text).toContain('urssaf')
    expect(ctx.direction).toBe('income')
    expect(ctx.amount).toBe(500)
  })
})

describe('deterministic rules', () => {
  it('classifies URSSAF as professional', () => {
    const rule = firstMatch('PRLV SEPA URSSAF COTISATIONS', -350)
    expect(rule?.id).toBe('urssaf')
    expect(rule?.category).toBe('pro')
    expect(rule?.source).toBe('rule')
    expect(rule?.confidence).toBeGreaterThan(0.9)
  })

  it('classifies a salary credit as personal', () => {
    expect(firstMatch('VIR SALAIRE ENTREPRISE X', 2200)?.category).toBe('perso')
  })

  it('classifies TVA as professional', () => {
    expect(firstMatch('ACOMPTE TVA DGFIP', -600)?.id).toBe('tva')
  })

  it('classifies income tax at source as personal', () => {
    expect(firstMatch('PRELEVEMENT A LA SOURCE IMPOT', -180)?.category).toBe('perso')
  })

  it('classifies CAF allocations as personal', () => {
    expect(firstMatch('VIR CAF ALLOCATIONS FAMILIALES', 130)?.id).toBe('prestation-sociale')
  })
})

describe('heuristic rules', () => {
  it('flags a supermarket as probably personal with lower confidence', () => {
    const rule = firstMatch('CB CARREFOUR MARKET', -54.2)
    expect(rule?.category).toBe('perso')
    expect(rule?.source).toBe('heuristic')
    expect(rule?.confidence).toBeLessThan(0.9)
  })

  it('does not match an unrelated label (left to the cascade default)', () => {
    expect(firstMatch('VIR CLIENT ACME SARL FACTURE 42', 1500)).toBeUndefined()
  })
})

describe('rule set integrity', () => {
  it('has unique rule ids', () => {
    const ids = RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('deterministic rules are ordered before heuristics (first-match-wins)', () => {
    const firstHeuristic = RULES.findIndex((r) => r.source === 'heuristic')
    const lastDeterministic = RULES.map((r) => r.source).lastIndexOf('rule')
    expect(lastDeterministic).toBeLessThan(firstHeuristic)
  })

  it('every rule carries a non-empty French reason and a valid confidence', () => {
    for (const rule of RULES) {
      expect(rule.reason.length).toBeGreaterThan(0)
      expect(rule.confidence).toBeGreaterThan(0)
      expect(rule.confidence).toBeLessThanOrEqual(1)
    }
  })
})
