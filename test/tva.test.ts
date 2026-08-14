import { describe, expect, it } from 'vitest'

import { tvaStatus, TVA_TAUX_NORMAL } from '../src/engine/tva.js'

describe('tvaStatus — régime (exact)', () => {
  it('is franchise below the base threshold (services)', () => {
    const s = tvaStatus({ ca: 30000, activity: 'prestations_bnc' })
    expect(s.regime).toBe('franchise')
    expect(s.assujetti).toBe(false)
    expect(s.tvaNetteEstimee).toBeUndefined()
  })

  it('is tolerance between base and majoré (services)', () => {
    const s = tvaStatus({ ca: 40000, activity: 'prestations_bnc' }) // 37 500 < 40 000 < 41 250
    expect(s.regime).toBe('tolerance')
    expect(s.assujetti).toBe(false)
  })

  it('is réel above the majoré threshold (services)', () => {
    const s = tvaStatus({ ca: 45000, activity: 'prestations_bnc' })
    expect(s.regime).toBe('reel')
    expect(s.assujetti).toBe(true)
  })

  it('uses the sales thresholds for vente de marchandises', () => {
    expect(tvaStatus({ ca: 50000, activity: 'vente_marchandises' }).regime).toBe('franchise')
  })
})

describe('tvaStatus — estimate (flagged)', () => {
  it('estimates collected/deductible/net VAT in the réel régime', () => {
    const s = tvaStatus({ ca: 100000, activity: 'prestations_bnc', charges: 20000 })
    expect(s.tvaCollecteeEstimee).toBe(100000 * TVA_TAUX_NORMAL)
    expect(s.tvaDeductibleEstimee).toBe(20000 * TVA_TAUX_NORMAL)
    expect(s.tvaNetteEstimee).toBe((100000 - 20000) * TVA_TAUX_NORMAL)
    expect(s.explanation).toMatch(/indicatif|estimation/i)
  })

  it('honours a custom rate', () => {
    const s = tvaStatus({ ca: 100000, activity: 'prestations_bnc', taux: 0.1 })
    expect(s.tvaCollecteeEstimee).toBe(10000)
  })

  it('rejects negative turnover', () => {
    expect(() => tvaStatus({ ca: -1, activity: 'prestations_bnc' })).toThrow(RangeError)
  })
})
