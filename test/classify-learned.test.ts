import { describe, expect, it } from 'vitest'

import { normalizeTransaction } from '../src/transactions/normalize.js'
import {
  applyLearned,
  coerceLearnedRules,
  forgetCorrection,
  learningKey,
  lookupLearned,
  recordCorrection,
  type LearnedRules,
} from '../src/classify/learned.js'

const NOW = '2026-08-14T12:00:00.000Z'

function tx(over: { label?: string; counterparty?: string; amount?: number; id?: string }) {
  return normalizeTransaction({
    id: over.id ?? 'id-1',
    date: '2026-03-15',
    amount: over.amount ?? 100,
    currency: 'EUR',
    label: over.label ?? 'x',
    ...(over.counterparty !== undefined ? { counterparty: over.counterparty } : {}),
    source: 'test',
  })
}

describe('learningKey', () => {
  it('prefers the counterparty when present', () => {
    expect(learningKey(tx({ label: 'VIR 12/03', counterparty: 'ACME SARL' }))).toBe('cp:acme sarl')
  })

  it('falls back to a label signature (letters only, collapsed)', () => {
    expect(learningKey(tx({ label: 'CB CARREFOUR MARKET 12/03 PARIS' }))).toBe('label:cb carrefour market paris')
  })

  it('is stable across dates/amounts in the label', () => {
    const a = learningKey(tx({ label: 'CB CARREFOUR 01/02 12,30 EUR' }))
    const b = learningKey(tx({ label: 'CB CARREFOUR 28/09 45,90 EUR' }))
    expect(a).toBe(b)
  })

  it('returns null when nothing meaningful can be derived', () => {
    expect(learningKey(tx({ label: '123 456', counterparty: '' }))).toBeNull()
  })
})

describe('recordCorrection / lookup / apply', () => {
  it('remembers a correction and applies it with full confidence', () => {
    const learned = recordCorrection({}, tx({ counterparty: 'ACME SARL' }), 'pro', NOW)
    const verdict = applyLearned(learned, tx({ counterparty: 'ACME SARL', label: 'other label' }))
    expect(verdict?.category).toBe('pro')
    expect(verdict?.confidence).toBe(1)
    expect(verdict?.source).toBe('learned')
  })

  it('is immutable (returns a new map, leaves the input untouched)', () => {
    const base: LearnedRules = {}
    const next = recordCorrection(base, tx({ counterparty: 'X' }), 'perso', NOW)
    expect(base).toEqual({})
    expect(next).not.toBe(base)
  })

  it('overwrites an earlier correction for the same key', () => {
    let learned = recordCorrection({}, tx({ counterparty: 'X' }), 'pro', NOW)
    learned = recordCorrection(learned, tx({ counterparty: 'X' }), 'perso', '2026-09-01T00:00:00.000Z')
    expect(lookupLearned(learned, tx({ counterparty: 'X' }))?.category).toBe('perso')
  })

  it('returns the map unchanged when there is no derivable key', () => {
    const base: LearnedRules = {}
    expect(recordCorrection(base, tx({ label: '000', counterparty: '' }), 'pro', NOW)).toBe(base)
  })

  it('applyLearned returns null when nothing was remembered', () => {
    expect(applyLearned({}, tx({ counterparty: 'Unknown' }))).toBeNull()
  })
})

describe('forgetCorrection', () => {
  it('removes a remembered rule', () => {
    const learned = recordCorrection({}, tx({ counterparty: 'X' }), 'pro', NOW)
    const after = forgetCorrection(learned, tx({ counterparty: 'X' }))
    expect(lookupLearned(after, tx({ counterparty: 'X' }))).toBeUndefined()
  })

  it('is a no-op when nothing matches', () => {
    const learned = recordCorrection({}, tx({ counterparty: 'X' }), 'pro', NOW)
    expect(forgetCorrection(learned, tx({ counterparty: 'Y' }))).toBe(learned)
  })
})

describe('coerceLearnedRules', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const coerced = coerceLearnedRules({
      'cp:x': { category: 'pro', updatedAt: NOW },
      'cp:bad-cat': { category: 'nope', updatedAt: NOW },
      'cp:no-date': { category: 'perso' },
      'cp:not-obj': 42,
    })
    expect(coerced).toEqual({ 'cp:x': { category: 'pro', updatedAt: NOW } })
  })

  it('returns an empty map for non-objects', () => {
    expect(coerceLearnedRules(null)).toEqual({})
    expect(coerceLearnedRules('nope')).toEqual({})
  })
})
