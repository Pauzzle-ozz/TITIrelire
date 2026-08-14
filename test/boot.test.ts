// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Builds a DOM mirroring index.html: splash, header mark, form (all profiles), result. */
function fullDom(): void {
  document.head.innerHTML = ''
  document.body.innerHTML = `
    <div id="splash" class="splash" aria-hidden="true">
      <div id="splash-rabbit" class="splash-rabbit"></div>
      <p class="splash-word">TI'TIrelire</p>
    </div>
    <main>
      <div id="brand-mark"></div>
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
          <input id="p-per" type="number" value="0" />
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
      <div id="result" aria-live="polite"></div>
    </main>`
}

describe('boot (full DOM, mirrors index.html)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    fullDom()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts the header logo and derives the favicon from the same sprite', async () => {
    await import('../src/ui/main.js')
    expect(document.querySelector('#brand-mark svg')).not.toBeNull()
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    expect(icon).not.toBeNull()
    expect(icon!.getAttribute('href')!.startsWith('data:image/svg+xml,')).toBe(true)
  })

  it('mounts the animated rabbit in the splash and computes the result behind it', async () => {
    await import('../src/ui/main.js')
    expect(document.querySelector('#splash-rabbit svg')).not.toBeNull()
    expect(document.getElementById('result')!.innerHTML).toContain('Recommandation')
  })

  it('hides the splash after the minimum display time, then removes it from layout', async () => {
    const { SPLASH_MIN_MS, SPLASH_FADE_MS } = await import('../src/ui/main.js')
    const splash = document.getElementById('splash')!
    expect(splash.classList.contains('is-hidden')).toBe(false)
    vi.advanceTimersByTime(SPLASH_MIN_MS)
    expect(splash.classList.contains('is-hidden')).toBe(true)
    expect(splash.hidden).toBe(false)
    vi.advanceTimersByTime(SPLASH_FADE_MS)
    expect(splash.hidden).toBe(true)
  })

  it('recomputes when an input changes', async () => {
    await import('../src/ui/main.js')
    const result = document.getElementById('result')!
    const revenue = document.getElementById('revenue') as HTMLInputElement
    revenue.value = '80000'
    revenue.dispatchEvent(new Event('input', { bubbles: true }))
    expect(result.innerHTML).toContain('Recommandation')
  })

  it('shows an inline validation message for invalid input', async () => {
    await import('../src/ui/main.js')
    const result = document.getElementById('result')!
    const parts = document.getElementById('parts') as HTMLInputElement
    parts.value = '0' // parts must be ≥ 1 → engine throws → inline message
    parts.dispatchEvent(new Event('input', { bubbles: true }))
    expect(result.innerHTML).toContain('Vérifiez vos saisies')
  })
})
