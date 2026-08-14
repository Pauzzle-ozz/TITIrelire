import { describe, expect, it } from 'vitest'

import { renderDashboard } from '../src/ui/dashboard-render.js'

describe('renderDashboard', () => {
  it('shows the optimisation total when positive', () => {
    const html = renderDashboard({ unlocked: false, profileLabel: 'Micro-entrepreneur', optimisationTotal: 1234 })
    expect(html).toMatch(/1\s?234,00\s?€/)
    expect(html).toContain('Optimisations identifiées')
    expect(html).toContain('Micro-entrepreneur')
  })

  it('shows a dash when there is no optimisation', () => {
    const html = renderDashboard({ unlocked: true, profileLabel: 'Société (SASU)', optimisationTotal: 0 })
    expect(html).toContain('>—<')
  })

  it('reflects the unlocked state', () => {
    expect(renderDashboard({ unlocked: true, profileLabel: 'x', optimisationTotal: 0 })).toContain('Déverrouillé')
    expect(renderDashboard({ unlocked: false, profileLabel: 'x', optimisationTotal: 0 })).toContain('Verrouillé')
  })

  it('shows the open space name when provided', () => {
    const html = renderDashboard({ unlocked: true, spaceName: 'Mon activité', profileLabel: 'x', optimisationTotal: 0 })
    expect(html).toContain('Mon activité')
  })

  it('escapes the space name', () => {
    const html = renderDashboard({ unlocked: true, spaceName: '<b>x</b>', profileLabel: 'x', optimisationTotal: 0 })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('renders navigation cards to every page', () => {
    const html = renderDashboard({ unlocked: false, profileLabel: 'x', optimisationTotal: 0 })
    for (const route of ['espace', 'situation', 'transactions', 'resultats']) {
      expect(html).toContain(`data-route="${route}"`)
      expect(html).toContain(`href="#/${route}"`)
    }
  })

  it('escapes the profile label', () => {
    const html = renderDashboard({ unlocked: false, profileLabel: '<b>x</b>', optimisationTotal: 0 })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})
