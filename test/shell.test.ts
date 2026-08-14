// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A compact app shell mirroring index.html: sidebar nav + pages + the micro form. */
function setupShell(): void {
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
      <section class="page" data-page="espace"></section>
      <section class="page" data-page="situation">
        <form id="form">
          <select id="profile"><option value="micro" selected>Micro</option>
            <option value="particulier">P</option><option value="societe">S</option></select>
          <div id="fields-micro">
            <select id="activity"><option value="prestations_bnc" selected>BNC</option></select>
            <input id="revenue" type="number" value="40000" />
            <input id="parts" type="number" value="1" />
            <input id="other" type="number" value="0" />
            <input id="acre" type="checkbox" />
            <input id="acreReduced" type="checkbox" />
          </div>
          <div id="fields-particulier" hidden>
            <input id="p-salaire" value="0" /><input id="p-parts" value="1" />
            <input id="p-frais" /><input id="p-per" value="0" /><input id="p-autres" value="0" />
          </div>
          <div id="fields-societe" hidden>
            <input id="s-benefice" value="0" /><input id="s-dividendes" />
            <input id="s-parts" value="1" /><input id="s-autres" value="0" />
            <input id="s-reduced" type="checkbox" />
          </div>
        </form>
      </section>
      <section class="page" data-page="transactions"></section>
      <section class="page" data-page="resultats"><div id="result"></div><div id="advice"></div></section>
    </div>`
}

function pageActive(name: string): boolean {
  return document.querySelector(`[data-page="${name}"]`)?.classList.contains('is-active') ?? false
}

function navigate(route: string): void {
  window.location.hash = `#/${route}`
  window.dispatchEvent(new Event('hashchange'))
}

describe('app shell (happy-dom)', () => {
  beforeEach(() => {
    vi.resetModules()
    window.location.hash = ''
    setupShell()
  })

  it('activates the router and shows the default page', async () => {
    await import('../src/ui/main.js')
    expect(document.getElementById('app-shell')?.classList.contains('router-on')).toBe(true)
    expect(pageActive('accueil')).toBe(true)
    expect(pageActive('transactions')).toBe(false)
  })

  it('renders the dashboard on the home page', async () => {
    await import('../src/ui/main.js')
    expect(document.getElementById('dashboard')?.innerHTML).toContain('Optimisations identifiées')
  })

  it('navigates between pages via the hash and highlights the nav link', async () => {
    await import('../src/ui/main.js')
    navigate('transactions')
    expect(pageActive('transactions')).toBe(true)
    expect(pageActive('accueil')).toBe(false)
    const link = document.querySelector('.nav-link[data-route="transactions"]')
    expect(link?.classList.contains('is-active')).toBe(true)
  })

  it('falls back to the default page for an unknown hash', async () => {
    await import('../src/ui/main.js')
    navigate('does-not-exist')
    expect(pageActive('accueil')).toBe(true)
  })
})
