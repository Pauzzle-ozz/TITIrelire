/**
 * UI wiring: reads the form for the selected profile, runs the computation in the browser,
 * and renders the transparent result. No network, no storage — everything stays on device.
 *
 * Import the engines directly (not the top-level barrel) so the browser bundle's module
 * graph never references the connectors — secret-handling code cannot ship to the client.
 * The presentation (HTML strings) lives in ./render.js and the mascot in ./sprite/*.
 */
import { compare, type CompareInput } from '../engine/compare.js'
import { comparePER, simulateParticulier, type ParticulierInput } from '../engine/particulier.js'
import { compareDividendes, type SocieteInput } from '../engine/societe.js'
import type { ActivityType } from '../engine/types.js'
import { adviseMicro } from '../advice/micro.js'
import { adviseParticulier } from '../advice/particulier.js'
import { adviseSociete } from '../advice/societe.js'
import { totalEstimatedGain } from '../advice/shared.js'
import type { Advice } from '../advice/types.js'
import { renderAdvice } from './advice-render.js'
import { buildLedger } from '../accounting/ledger.js'
import { tvaStatus, type TvaStatus } from '../engine/tva.js'
import { renderDashboard } from './dashboard-render.js'
import { renderFiscalTable } from './fiscal-render.js'
import { applyForm, readForm } from './form-state.js'
import { EMPTY_STATE_HTML, INVALID_INPUT_HTML, renderResult } from './render.js'
import { createRouter, type Router } from './router.js'
import { renderRabbitSVG } from './sprite/rabbit.js'
import { initTxPanel, type TxPanelHandle } from './tx-panel.js'
import { initVaultPanel, type VaultPanelHandle } from './vault-panel.js'
import {
  toMicroViewModel,
  toParticulierViewModel,
  toSocieteViewModel,
  type ViewModel,
} from './view-model.js'
import { SpaceRegistry, spaceStorageKey } from '../vault/registry.js'
import { WebVaultStorage } from '../vault/storage.js'
import type { VaultState } from '../vault/types.js'

type Profile = 'micro' | 'particulier' | 'societe'

/** The personal-space panel, once wired (null when the page has no vault container). */
let vaultPanel: VaultPanelHandle | null = null
/** The transactions panel, once wired (null when the page has no transactions container). */
let txPanel: TxPanelHandle | null = null

/** Minimum time the boot splash stays up, so the mascot is actually seen. */
export const SPLASH_MIN_MS = 750
/** How long the splash takes to fade before it is removed from the layout. */
export const SPLASH_FADE_MS = 400

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`Missing element #${id}`)
  return node as T
}

function num(id: string): number {
  return Number(el<HTMLInputElement>(id).value)
}

/** Reads an optional numeric field: blank → undefined. */
function optNum(id: string): number | undefined {
  const raw = el<HTMLInputElement>(id).value.trim()
  return raw === '' ? undefined : Number(raw)
}

/** Reads a checkbox that may be absent (tolerant): missing → false. */
function optChecked(id: string): boolean {
  const node = document.getElementById(id) as HTMLInputElement | null
  return node?.checked ?? false
}

function readMicro(): CompareInput {
  return {
    activity: el<HTMLSelectElement>('activity').value as ActivityType,
    revenue: num('revenue'),
    parts: num('parts'),
    otherHouseholdTaxableIncome: num('other'),
    acre: el<HTMLInputElement>('acre').checked,
    acreReducedRate: el<HTMLInputElement>('acreReduced').checked,
  }
}

function readParticulier(): ParticulierInput {
  const frais = optNum('p-frais')
  return {
    salaireNetImposable: num('p-salaire'),
    parts: num('p-parts'),
    ...(frais !== undefined ? { fraisReels: frais } : {}),
    perContribution: num('p-per'),
    autresRevenus: num('p-autres'),
    couple: optChecked('p-couple'),
  }
}

function readSociete(): SocieteInput {
  const dividendes = optNum('s-dividendes')
  return {
    benefice: num('s-benefice'),
    reducedRateEligible: el<HTMLInputElement>('s-reduced').checked,
    ...(dividendes !== undefined ? { dividendes } : {}),
    parts: num('s-parts'),
    autresRevenus: num('s-autres'),
    couple: optChecked('s-couple'),
  }
}

function buildViewModel(profile: Profile): ViewModel {
  if (profile === 'particulier') {
    const input = readParticulier()
    return toParticulierViewModel(simulateParticulier(input), comparePER(input))
  }
  if (profile === 'societe') {
    return toSocieteViewModel(compareDividendes(readSociete()))
  }
  return toMicroViewModel(compare(readMicro()))
}

/** Shows the field group for the selected profile and hides the others. */
function toggleFields(profile: Profile): void {
  for (const p of ['micro', 'particulier', 'societe'] as Profile[]) {
    el(`fields-${p}`).hidden = p !== profile
  }
}

/** Total deductible pro charges from the imported transactions, or 0 when none. */
function currentCharges(): number {
  const classified = txPanel?.classified() ?? []
  return classified.length === 0 ? 0 : buildLedger(classified).charges.total
}

/** Computes transparent advice for the selected profile. */
function adviceFor(profile: Profile): Advice[] {
  if (profile === 'particulier') return adviseParticulier(readParticulier())
  if (profile === 'societe') return adviseSociete(readSociete())
  // Feed real charges (from transactions) so the micro-vs-réel advice is quantified.
  const charges = currentCharges()
  return adviseMicro(readMicro(), charges > 0 ? charges : undefined)
}

/**
 * Renders the accountant-style fiscal table from the imported transactions into the optional
 * `#fiscal` region. Micro only (produits/charges + VAT régime); cleared otherwise.
 */
function renderFiscalRegion(): void {
  const region = document.getElementById('fiscal')
  if (region === null) return
  const classified = txPanel?.classified() ?? []
  const profile = el<HTMLSelectElement>('profile').value as Profile
  if (classified.length === 0 || profile !== 'micro') {
    region.innerHTML = ''
    return
  }
  const ledger = buildLedger(classified)
  let tva: TvaStatus | undefined
  try {
    tva = tvaStatus({ activity: el<HTMLSelectElement>('activity').value as ActivityType, ca: ledger.produits.total, charges: ledger.charges.total })
  } catch {
    tva = undefined
  }
  region.innerHTML = renderFiscalTable(ledger, tva)
}

/**
 * Renders transparent advice for the selected profile into the optional `#advice` region.
 * No-op when the region is absent (e.g. minimal test DOMs).
 */
function renderAdviceRegion(profile: Profile): void {
  const region = document.getElementById('advice')
  if (region === null) return
  region.innerHTML = renderAdvice(adviceFor(profile))
}

/** Human label for a profile, shared by the dashboard. */
function profileLabel(profile: Profile): string {
  if (profile === 'particulier') return 'Particulier salarié'
  if (profile === 'societe') return 'Société (SASU)'
  return 'Micro-entrepreneur'
}

/** Renders the home dashboard into the optional `#dashboard` region. */
function renderDashboardRegion(profile: Profile): void {
  const region = document.getElementById('dashboard')
  if (region === null) return
  let optimisationTotal = 0
  try {
    optimisationTotal = totalEstimatedGain(adviceFor(profile))
  } catch {
    optimisationTotal = 0
  }
  region.innerHTML = renderDashboard({
    unlocked: vaultPanel?.isUnlocked() ?? false,
    spaceName: vaultPanel?.spaceName() ?? null,
    profileLabel: profileLabel(profile),
    optimisationTotal,
  })
}

/** The main monetary field that decides whether the user has entered real data, per profile. */
function primaryFieldId(profile: Profile): string {
  return profile === 'particulier' ? 'p-salaire' : profile === 'societe' ? 's-benefice' : 'revenue'
}

/** Whether the user has entered their real headline figure (else nothing is computed). */
function hasData(profile: Profile): boolean {
  const raw = el<HTMLInputElement>(primaryFieldId(profile)).value.trim()
  if (raw === '') return false
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0
}

/** Clears the advice region, if present. */
function clearAdvice(): void {
  const region = document.getElementById('advice')
  if (region !== null) region.innerHTML = ''
}

/** Reads the form, computes, and renders the result — or an empty/validation state. */
function compute(): void {
  const profile = el<HTMLSelectElement>('profile').value as Profile
  const result = el('result')
  if (!hasData(profile)) {
    // No real figures yet → honest empty state, never a demo computation.
    result.innerHTML = EMPTY_STATE_HTML
    clearAdvice()
    renderDashboardRegion(profile)
    return
  }
  try {
    result.innerHTML = renderResult(buildViewModel(profile))
    renderAdviceRegion(profile)
  } catch {
    result.innerHTML = INVALID_INPUT_HTML
    clearAdvice()
  }
  renderDashboardRegion(profile)
  renderFiscalRegion()
}

/** The pages of the app shell, matched to `[data-page]` / `data-route` in the DOM. */
const PAGES = ['accueil', 'espace', 'situation', 'transactions', 'resultats'] as const

/** The shell router, once wired (null on minimal test DOMs without `#app-shell`). */
let router: Router | null = null

/**
 * Locks or unlocks the whole app around the personal space. Locked = only the connection
 * screen (`espace`) is reachable; the other pages and nav links are hidden. This is enforced
 * both by CSS (`.app.locked`) and by the router (any route resolves to `espace` while locked),
 * so nothing — data, results, advice — is visible until a space is open.
 */
function gate(unlocked: boolean): void {
  const shell = document.getElementById('app-shell')
  if (shell === null) return
  shell.classList.toggle('locked', !unlocked)
  router?.navigate(unlocked ? 'accueil' : 'espace')
}

/**
 * Wires the multi-page shell if present: a hash router shows one `[data-page]` at a time and
 * highlights the matching nav link. Opt-in — absent on minimal test DOMs. Nav anchors drive the
 * hash directly, so the router just reacts. While locked, every route resolves to `espace`.
 */
function initShell(): void {
  const shell = document.getElementById('app-shell')
  if (shell === null) return
  shell.classList.add('router-on')

  const showPage = (route: string): void => {
    // While locked, force the connection screen regardless of the requested route.
    const effective = shell.classList.contains('locked') && route !== 'espace' ? 'espace' : route
    for (const page of Array.from(document.querySelectorAll<HTMLElement>('[data-page]'))) {
      page.classList.toggle('is-active', page.dataset['page'] === effective)
    }
    for (const link of Array.from(document.querySelectorAll<HTMLElement>('.nav-link'))) {
      link.classList.toggle('is-active', link.dataset['route'] === effective)
    }
    if (effective === 'accueil') {
      renderDashboardRegion(el<HTMLSelectElement>('profile').value as Profile)
    }
  }

  router = createRouter({ routes: PAGES, defaultRoute: 'accueil', onChange: showPage })
  // Gate only when there is a space to connect to: no #vault panel → open app (pure simulator).
  // With a panel, the app starts locked (never open at boot) until a space is unlocked.
  gate(vaultPanel === null ? true : vaultPanel.isUnlocked())
  router.start()
}

/** Places the static rabbit logo in the header, when the mark container is present. */
function mountBrand(): void {
  const mark = document.getElementById('brand-mark')
  if (mark !== null) mark.innerHTML = renderRabbitSVG(0, { className: 'rabbit', title: "TITI'relire" })
}

/** Sets the favicon to the rabbit sprite — one mascot, one source of truth. */
function setFavicon(): void {
  const svg = renderRabbitSVG(0, { background: '#fbf8f1', title: "TITI'relire" })
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link === null) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = href
}

/** Boot splash: the hopping rabbit (CSS animation) that fades once the app is ready. Optional. */
function runSplash(): void {
  const splash = document.getElementById('splash')
  const box = document.getElementById('splash-rabbit')
  if (splash === null || box === null) return
  box.innerHTML = renderRabbitSVG(0, { title: 'Chargement…', className: 'rabbit' })
  setTimeout(() => {
    splash.classList.add('is-hidden')
    setTimeout(() => {
      splash.hidden = true
    }, SPLASH_FADE_MS)
  }, SPLASH_MIN_MS)
}

function wire(): void {
  el('profile').addEventListener('change', () => {
    toggleFields(el<HTMLSelectElement>('profile').value as Profile)
    compute()
    void vaultPanel?.save()
  })
  el('form').addEventListener('input', () => {
    compute()
    void vaultPanel?.save()
  })
}

/** Restores a saved snapshot into the form, then reveals the right fields and recomputes. */
function applySnapshot(state: VaultState): void {
  applyForm(document, state)
  toggleFields(state.activeProfile)
  compute()
}

/**
 * Feeds the professional-only CA derived from transactions into the micro revenue field.
 * Only applies for the micro profile and only when there is real pro income (> 0), so it
 * never wipes a manually typed CA when nothing was imported / everything is still unknown.
 */
function applyProRevenue(proRevenue: number): void {
  if (proRevenue <= 0) return
  if ((el<HTMLSelectElement>('profile').value as Profile) !== 'micro') return
  const revenue = document.getElementById('revenue') as HTMLInputElement | null
  if (revenue === null) return
  revenue.value = String(Math.round(proRevenue))
  compute()
  void vaultPanel?.save() // persist the updated CA into the form snapshot
}

/**
 * Wires the personal-space panel when the page provides one. Kept optional so the simulator
 * still runs stateless (and secret-free) on pages without a vault. localStorage is only
 * touched when a `#vault` container exists, so headless/test pages are unaffected.
 */
function initVault(): void {
  if (document.getElementById('vault') === null) return
  const now = (): string => new Date().toISOString()
  const registry = new SpaceRegistry()
  const genId = (): string => globalThis.crypto.randomUUID()

  // The transactions panel reads/writes its state through the open space (or stays in-memory
  // until one is unlocked). It is wired first so the vault's onOpened can refresh it.
  txPanel = initTxPanel({
    doc: document,
    now,
    load: () => {
      const state = vaultPanel?.snapshot() ?? null
      return { transactions: state?.transactions ?? [], learned: state?.learnedCategories ?? {} }
    },
    save: (data) => vaultPanel?.patch({ transactions: data.transactions, learnedCategories: data.learned }),
    onProRevenue: applyProRevenue,
    onChanged: () => {
      renderFiscalRegion()
      renderAdviceRegion(el<HTMLSelectElement>('profile').value as Profile)
    },
  })

  vaultPanel = initVaultPanel({
    doc: document,
    now,
    registry,
    makeStorage: (id) => new WebVaultStorage(undefined, spaceStorageKey(id)),
    genId,
    readForm,
    applySnapshot,
    onOpened: () => {
      txPanel?.refresh()
      gate(true)
    },
    onLocked: () => gate(false),
  })
}

// ── Boot ────────────────────────────────────────────────────────────────────────
// Schedule the splash-hide first, so it always clears even if a later step throws.
runSplash()
setFavicon()
mountBrand()
toggleFields(el<HTMLSelectElement>('profile').value as Profile)
compute()
wire()
initVault()
initShell()
