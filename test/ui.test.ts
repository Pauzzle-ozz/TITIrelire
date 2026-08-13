// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Builds the minimal DOM that main.ts expects (mirrors index.html ids). */
function setupDom(): void {
  document.body.innerHTML = `
    <form id="form">
      <select id="activity">
        <option value="prestations_bnc" selected>BNC</option>
      </select>
      <input id="revenue" type="number" value="40000" />
      <input id="parts" type="number" value="1" />
      <input id="other" type="number" value="0" />
      <input id="acre" type="checkbox" />
      <input id="acreReduced" type="checkbox" />
    </form>
    <div id="result"></div>`
}

describe('UI wiring (happy-dom)', () => {
  // Fresh DOM + fresh module each time, so main.ts re-runs its top-level wiring.
  beforeEach(() => {
    vi.resetModules()
    setupDom()
  })

  it('renders a recommendation with the breakdown on load', async () => {
    // main.ts runs on import: attaches listeners and performs the first render.
    await import('../src/ui/main.js')

    const result = document.getElementById('result')!
    expect(result.innerHTML).toContain('Recommandation')
    expect(result.innerHTML).toContain('Le détail, ligne par ligne')
    // BNC 40 000 € → versement libératoire wins.
    expect(result.innerHTML).toContain('versement libératoire')
    expect(result.innerHTML).toContain('conseillé')
    // A euro amount is rendered (currency symbol present).
    expect(result.innerHTML).toContain('€')
  })

  it('recomputes when an input changes', async () => {
    await import('../src/ui/main.js')
    const result = document.getElementById('result')!

    const revenue = document.getElementById('revenue') as HTMLInputElement
    revenue.value = '0'
    revenue.dispatchEvent(new Event('input', { bubbles: true }))

    // With CA = 0 the two options tie, and the barème is the default recommendation.
    expect(result.innerHTML).toContain('barème')
  })
})
