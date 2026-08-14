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
import { INVALID_INPUT_HTML, renderResult } from './render.js'
import { renderRabbitSVG } from './sprite/rabbit.js'
import {
  toMicroViewModel,
  toParticulierViewModel,
  toSocieteViewModel,
  type ViewModel,
} from './view-model.js'

type Profile = 'micro' | 'particulier' | 'societe'

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

/** Reads the form, computes, and renders the result (or an inline validation message). */
function compute(): void {
  const profile = el<HTMLSelectElement>('profile').value as Profile
  const result = el('result')
  try {
    result.innerHTML = renderResult(buildViewModel(profile))
  } catch {
    result.innerHTML = INVALID_INPUT_HTML
  }
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
  })
  el('form').addEventListener('input', compute)
}

// ── Boot ────────────────────────────────────────────────────────────────────────
// Schedule the splash-hide first, so it always clears even if a later step throws.
runSplash()
setFavicon()
mountBrand()
toggleFields(el<HTMLSelectElement>('profile').value as Profile)
compute()
wire()
