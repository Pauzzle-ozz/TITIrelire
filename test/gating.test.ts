// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A shell with a #vault space panel + the micro form, to exercise the auth gate. */
function setupGatedDom(): void {
  document.head.innerHTML = ''
  document.body.innerHTML = `
    <div class="app" id="app-shell">
      <nav>
        <a class="nav-link" data-route="accueil" href="#/accueil">Accueil</a>
        <a class="nav-link" data-route="espace" href="#/espace">Espace</a>
        <a class="nav-link" data-route="situation" href="#/situation">Situation</a>
        <a class="nav-link" data-route="transactions" href="#/transactions">Transactions</a>
        <a class="nav-link" data-route="resultats" href="#/resultats">Résultats</a>
      </nav>
      <section class="page is-active" data-page="accueil"><div id="dashboard"></div></section>
      <section class="page" data-page="espace">
        <section id="vault">
          <div id="vault-locked">
            <div id="vault-existing" hidden><select id="vault-space-select"></select>
              <input id="vault-password" type="password" /><button id="vault-unlock" type="button">U</button></div>
            <input id="vault-name" type="text" /><input id="vault-newpass" type="password" />
            <button id="vault-create" type="button">Créer</button>
          </div>
          <div id="vault-unlocked" hidden><span id="vault-current-name"></span>
            <button id="vault-lock" type="button">Lock</button><button id="vault-switch" type="button">Switch</button></div>
          <p id="vault-msg"></p>
        </section>
      </section>
      <section class="page" data-page="situation">
        <form id="form">
          <select id="profile"><option value="micro" selected>Micro</option>
            <option value="particulier">P</option><option value="societe">S</option></select>
          <div id="fields-micro">
            <select id="activity"><option value="prestations_bnc" selected>BNC</option></select>
            <input id="revenue" type="number" /><input id="parts" type="number" value="1" />
            <input id="other" type="number" value="0" /><input id="acre" type="checkbox" />
            <input id="acreReduced" type="checkbox" />
          </div>
          <div id="fields-particulier" hidden><input id="p-salaire" /><input id="p-parts" value="1" />
            <input id="p-frais" /><input id="p-per" value="0" /><input id="p-autres" value="0" /></div>
          <div id="fields-societe" hidden><input id="s-benefice" /><input id="s-dividendes" />
            <input id="s-parts" value="1" /><input id="s-autres" value="0" /><input id="s-reduced" type="checkbox" /></div>
        </form>
      </section>
      <section class="page" data-page="transactions"></section>
      <section class="page" data-page="resultats"><div id="result"></div><div id="advice"></div></section>
    </div>`
}

const pageActive = (name: string): boolean =>
  document.querySelector(`[data-page="${name}"]`)?.classList.contains('is-active') ?? false
const locked = (): boolean => document.getElementById('app-shell')?.classList.contains('locked') ?? false
const unlockedVisible = (): boolean => !(document.getElementById('vault-unlocked') as HTMLElement).hidden

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new Event('click', { bubbles: true }))
}
async function waitFor(pred: () => boolean): Promise<void> {
  // Generous budget: space creation runs two PBKDF2 passes (~350 ms each), slower under load.
  for (let i = 0; i < 400; i += 1) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitFor timed out')
}

describe('auth gate (happy-dom)', () => {
  beforeEach(() => {
    vi.resetModules()
    window.location.hash = ''
    // happy-dom's localStorage lacks getItem here; install a working Map-backed one
    // (a real browser provides a proper localStorage).
    const map = new Map<string, string>()
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (map.has(k) ? map.get(k) : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    }
    setupGatedDom()
  })

  it('boots locked: only the connection screen is reachable', async () => {
    await import('../src/ui/main.js')
    expect(locked()).toBe(true)
    expect(pageActive('espace')).toBe(true)
    expect(pageActive('situation')).toBe(false)
    expect(pageActive('accueil')).toBe(false)
  })

  it('locked app resists navigating to another page via the hash', async () => {
    await import('../src/ui/main.js')
    window.location.hash = '#/transactions'
    window.dispatchEvent(new Event('hashchange'))
    expect(pageActive('transactions')).toBe(false)
    expect(pageActive('espace')).toBe(true)
  })

  it('unlocks the app when a space is created, then re-locks on lock', async () => {
    await import('../src/ui/main.js')
    ;(document.getElementById('vault-name') as HTMLInputElement).value = 'Perso'
    ;(document.getElementById('vault-newpass') as HTMLInputElement).value = 'pw-123'
    click('vault-create')
    await waitFor(unlockedVisible)
    expect(locked()).toBe(false)
    expect(pageActive('accueil')).toBe(true)

    click('vault-lock')
    expect(locked()).toBe(true)
    await waitFor(() => pageActive('espace'))
  })
})
