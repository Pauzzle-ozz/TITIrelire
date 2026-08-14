import { describe, expect, it } from 'vitest'

import { adviseMicro } from '../src/advice/micro.js'
import type { CompareInput } from '../src/engine/compare.js'
import { renderAdvice } from '../src/ui/advice-render.js'

function adviceFor(over: Partial<CompareInput> = {}) {
  return adviseMicro({
    activity: 'prestations_bnc',
    revenue: 40000,
    parts: 1,
    otherHouseholdTaxableIncome: 0,
    acre: false,
    acreReducedRate: false,
    ...over,
  })
}

describe('renderAdvice', () => {
  it('returns an empty string for no advice', () => {
    expect(renderAdvice([])).toBe('')
  })

  it('renders the card with a headline total and the disclaimer', () => {
    const html = renderAdvice(adviceFor())
    expect(html).toContain('Conseils')
    expect(html).toContain('optimiser')
    expect(html).toContain('ne remplace pas un expert-comptable')
  })

  it('shows a euro gain badge for optimisations', () => {
    const html = renderAdvice(adviceFor())
    expect(html).toMatch(/advice-gain">\+/)
    expect(html).toContain('/an')
  })

  it('renders alert items when a threshold is crossed', () => {
    const html = renderAdvice(adviceFor({ revenue: 40000 })) // over services VAT franchise
    expect(html).toContain('kind-alerte')
    expect(html).toContain('TVA')
  })

  it('escapes advice text (XSS-safe)', () => {
    const html = renderAdvice([
      { id: 'x', kind: 'info', title: '<script>alert(1)</script>', detail: 'ok' },
    ])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
