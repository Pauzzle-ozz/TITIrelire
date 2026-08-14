import { describe, expect, it } from 'vitest'

import { projectAdvice } from '../src/advice/projection.js'
import type { Advice } from '../src/advice/types.js'

const opt = (id: string, gain: number): Advice => ({
  id,
  kind: 'optimisation',
  title: id,
  detail: 'd',
  estimatedGain: gain,
})

describe('projectAdvice', () => {
  it('projects a constant yearly gain cumulatively', () => {
    const p = projectAdvice([opt('a', 1000)], 5)
    expect(p.horizonYears).toBe(5)
    expect(p.scenarios).toHaveLength(1)
    expect(p.scenarios[0]!.cumulative).toEqual([1000, 2000, 3000, 4000, 5000])
    expect(p.scenarios[0]!.totalOverHorizon).toBe(5000)
  })

  it('keeps only optimisations with a positive gain, sorted descending', () => {
    const p = projectAdvice([
      opt('small', 300),
      opt('big', 2000),
      { id: 'alert', kind: 'alerte', title: 'x', detail: 'd' },
      { id: 'info', kind: 'info', title: 'x', detail: 'd' },
      opt('zero', 0),
    ])
    expect(p.scenarios.map((s) => s.id)).toEqual(['big', 'small'])
  })

  it('caps the number of scenarios at topN', () => {
    const advice = [opt('a', 5), opt('b', 4), opt('c', 3), opt('d', 2), opt('e', 1)]
    expect(projectAdvice(advice, 5, 3).scenarios).toHaveLength(3)
  })

  it('combines scenarios cumulatively across years', () => {
    const p = projectAdvice([opt('a', 1000), opt('b', 500)], 3)
    expect(p.combinedCumulative).toEqual([1500, 3000, 4500])
    expect(p.combinedTotal).toBe(4500)
  })

  it('clamps the horizon to at least 1 year and sets milestones', () => {
    const p = projectAdvice([opt('a', 100)], 0)
    expect(p.horizonYears).toBe(1)
    expect(p.milestones).toEqual([1])
    expect(projectAdvice([opt('a', 100)], 5).milestones).toEqual([1, 3, 5])
  })

  it('handles no optimisations', () => {
    const p = projectAdvice([{ id: 'i', kind: 'info', title: 'x', detail: 'd' }], 5)
    expect(p.scenarios).toEqual([])
    expect(p.combinedTotal).toBe(0)
  })
})
