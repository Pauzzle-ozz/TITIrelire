import { describe, expect, it } from 'vitest'

import { projectAdvice } from '../src/advice/projection.js'
import type { Advice } from '../src/advice/types.js'
import { renderProjection } from '../src/ui/projection-render.js'

const opt = (id: string, title: string, gain: number): Advice => ({
  id,
  kind: 'optimisation',
  title,
  detail: 'd',
  estimatedGain: gain,
})

describe('renderProjection', () => {
  it('renders nothing when there are no scenarios', () => {
    expect(renderProjection(projectAdvice([], 5))).toBe('')
  })

  it('renders a milestone table with a combined total', () => {
    const html = renderProjection(projectAdvice([opt('a', 'Régime', 1000), opt('b', 'ACRE', 500)], 5))
    expect(html).toContain('Projection de vos optimisations')
    expect(html).toContain('Régime')
    expect(html).toContain('ACRE')
    expect(html).toContain('Total cumulé')
    expect(html).toContain('5 ans')
    // Combined at 5 years = (1000 + 500) × 5 = 7 500 €.
    expect(html).toMatch(/7\s?500,00\s?€/)
  })

  it('escapes scenario titles', () => {
    const html = renderProjection(projectAdvice([opt('x', '<b>x</b>', 100)], 3))
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})
