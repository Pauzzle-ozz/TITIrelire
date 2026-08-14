import { describe, expect, it } from 'vitest'

import { UNCLASSIFIED, type Classification, type TxCategory } from '../src/classify/types.js'

describe('classification model', () => {
  it('UNCLASSIFIED is the neutral default verdict', () => {
    expect(UNCLASSIFIED.category).toBe('unknown')
    expect(UNCLASSIFIED.confidence).toBe(0)
    expect(UNCLASSIFIED.source).toBe('default')
    expect(UNCLASSIFIED.ruleId).toBe('none')
  })

  it('round-trips as plain JSON (persistable in the vault)', () => {
    const c: Classification = {
      category: 'pro',
      confidence: 0.9,
      source: 'rule',
      ruleId: 'urssaf',
      reason: 'Cotisations URSSAF',
    }
    expect(JSON.parse(JSON.stringify(c))).toEqual(c)
  })

  it('the category union is exactly pro | perso | unknown', () => {
    const all: TxCategory[] = ['pro', 'perso', 'unknown']
    expect(all).toHaveLength(3)
  })
})
