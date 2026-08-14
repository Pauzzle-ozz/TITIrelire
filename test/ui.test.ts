// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Builds the minimal DOM that main.ts expects (mirrors index.html ids for all profiles). */
function setupDom(): void {
  document.body.innerHTML = `
    <form id="form">
      <select id="profile">
        <option value="micro" selected>Micro</option>
        <option value="particulier">Particulier</option>
        <option value="societe">Société</option>
      </select>

      <div id="fields-micro" class="profile-fields">
        <select id="activity"><option value="prestations_bnc" selected>BNC</option></select>
        <input id="revenue" type="number" value="40000" />
        <input id="parts" type="number" value="1" />
        <input id="other" type="number" value="0" />
        <input id="acre" type="checkbox" />
        <input id="acreReduced" type="checkbox" />
      </div>

      <div id="fields-particulier" class="profile-fields" hidden>
        <input id="p-salaire" type="number" value="40000" />
        <input id="p-parts" type="number" value="1" />
        <input id="p-frais" type="number" />
        <input id="p-per" type="number" value="5000" />
        <input id="p-autres" type="number" value="0" />
      </div>

      <div id="fields-societe" class="profile-fields" hidden>
        <input id="s-benefice" type="number" value="100000" />
        <input id="s-dividendes" type="number" />
        <input id="s-parts" type="number" value="1" />
        <input id="s-autres" type="number" value="0" />
        <input id="s-reduced" type="checkbox" checked />
      </div>
    </form>
    <div id="result"></div>
    <div id="advice"></div>`
}

function switchProfile(value: string): void {
  const select = document.getElementById('profile') as HTMLSelectElement
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('UI wiring (happy-dom)', () => {
  beforeEach(() => {
    vi.resetModules()
    setupDom()
  })

  it('renders the micro recommendation and breakdown on load', async () => {
    await import('../src/ui/main.js')
    const result = document.getElementById('result')!
    expect(result.innerHTML).toContain('Recommandation')
    expect(result.innerHTML).toContain('Le détail, ligne par ligne')
    expect(result.innerHTML).toContain('versement libératoire') // BNC 40 000 € → VL wins
    expect(result.innerHTML).toContain('conseillé')
  })

  it('renders transparent advice for the micro profile', async () => {
    await import('../src/ui/main.js')
    const advice = document.getElementById('advice')!
    expect(advice.innerHTML).toContain('Conseils')
    expect(advice.innerHTML).toContain('ne remplace pas un expert-comptable')
  })

  it('clears the advice region when leaving the micro profile', async () => {
    await import('../src/ui/main.js')
    switchProfile('particulier')
    expect(document.getElementById('advice')!.innerHTML).toBe('')
  })

  it('switches to the salaried profile and shows the PER optimisation', async () => {
    await import('../src/ui/main.js')
    switchProfile('particulier')
    const result = document.getElementById('result')!
    expect(result.innerHTML).toContain('PER')
    expect(result.innerHTML).toContain('Sans PER')
    // The particulier field group is now visible, micro hidden.
    expect((document.getElementById('fields-particulier') as HTMLDivElement).hidden).toBe(false)
    expect((document.getElementById('fields-micro') as HTMLDivElement).hidden).toBe(true)
  })

  it('switches to the company profile and shows PFU vs barème', async () => {
    await import('../src/ui/main.js')
    switchProfile('societe')
    const result = document.getElementById('result')!
    expect(result.innerHTML).toContain('PFU')
    expect(result.innerHTML).toContain('Impôt sur les sociétés')
  })

  it('recomputes when an input changes', async () => {
    await import('../src/ui/main.js')
    const result = document.getElementById('result')!
    const revenue = document.getElementById('revenue') as HTMLInputElement
    revenue.value = '0'
    revenue.dispatchEvent(new Event('input', { bubbles: true }))
    expect(result.innerHTML).toContain('barème') // CA = 0 ties → barème default
  })
})
