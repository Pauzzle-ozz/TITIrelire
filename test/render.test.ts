import { describe, expect, it } from 'vitest'

import { compare, comparePER, simulateParticulier } from '../src/index.js'
import { INVALID_INPUT_HTML, escapeHtml, renderResult } from '../src/ui/render.js'
import { toMicroViewModel, toParticulierViewModel, type ViewModel } from '../src/ui/view-model.js'

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml('<a href="x">& \'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp; &#39;')
  })
  it('leaves plain text untouched', () => {
    expect(escapeHtml('Revenu net estimé : 43 481,00 €')).toBe('Revenu net estimé : 43 481,00 €')
  })
})

describe('renderResult — micro (full result)', () => {
  const vm = toMicroViewModel(compare({ activity: 'prestations_bnc', revenue: 40000 }))
  const html = renderResult(vm)

  it('renders the recommendation headline and net figure', () => {
    expect(html).toContain('card reco')
    expect(html).toContain(escapeHtml(vm.recommendationTitle))
    expect(html).toContain(escapeHtml(vm.netHighlight))
  })

  it('renders the comparison with a "conseillé" badge on the recommended row', () => {
    expect(html).toContain('<table')
    expect(html).toContain('conseillé')
    expect(html).toContain('class="win"')
  })

  it('renders the line-by-line breakdown with the profile-specific effective-rate label', () => {
    expect(html).toContain('Le détail, ligne par ligne')
    expect(html).toContain(escapeHtml(vm.effectiveRateLabel!))
    expect(html).toContain(escapeHtml(vm.effectiveRate!))
  })

  it('renders the caveats section when warnings exist', () => {
    expect(vm.warnings.length).toBeGreaterThan(0)
    expect(html).toContain('À garder en tête')
  })
})

describe('renderResult — optional sections', () => {
  it('omits the comparison table when there is no PER contribution', () => {
    const input = { salaireNetImposable: 40000 }
    const vm = toParticulierViewModel(simulateParticulier(input), comparePER(input))
    expect(vm.comparison).toBeUndefined()
    const html = renderResult(vm)
    expect(html).not.toContain('<table')
    expect(html).toContain('Le détail, ligne par ligne')
  })
})

describe('renderResult — XSS safety', () => {
  it('escapes hostile strings coming from the view-model', () => {
    const evil: ViewModel = {
      recommendationTitle: '<script>alert(1)</script>',
      recommendationDetail: 'broken" onload="steal',
      netHighlight: '<img src=x onerror=1>',
      netLabel: 'net',
      effectiveRate: '13 %',
      effectiveRateLabel: '<b>rate</b>',
      comparison: {
        title: '<i>title</i>',
        columns: ['Option', '<u>col</u>'],
        rows: [{ label: '<x>row</x>', cells: ['<y>cell</y>'], recommended: true }],
      },
      breakdown: [{ label: '<a>l</a>', amount: '<b>a</b>', detail: '<c>d</c>' }],
      warnings: [{ level: 'warning', message: '<script>evil()</script>' }],
    }
    const html = renderResult(evil)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('onerror=1>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('INVALID_INPUT_HTML', () => {
  it('is an accessible alert with guidance', () => {
    expect(INVALID_INPUT_HTML).toContain('role="alert"')
    expect(INVALID_INPUT_HTML).toContain('Vérifiez vos saisies')
  })
})
