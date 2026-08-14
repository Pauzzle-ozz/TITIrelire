/**
 * UI wiring: reads the form for the selected profile, runs the computation in the browser,
 * and renders the transparent result. No network, no storage — everything stays on device.
 */
// Import the engines directly (not the top-level barrel) so the browser bundle's module
// graph never references the connectors — secret-handling code cannot ship to the client.
import { compare, type CompareInput } from '../engine/compare.js'
import { comparePER, simulateParticulier, type ParticulierInput } from '../engine/particulier.js'
import { compareDividendes, type SocieteInput } from '../engine/societe.js'
import type { ActivityType } from '../engine/types.js'
import {
  toMicroViewModel,
  toParticulierViewModel,
  toSocieteViewModel,
  type ViewModel,
} from './view-model.js'

type Profile = 'micro' | 'particulier' | 'societe'

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

/** Minimal HTML escaping for text injected into the result markup. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

function renderComparison(vm: ViewModel): string {
  if (vm.comparison === undefined) return ''
  const { title, columns, rows } = vm.comparison
  const head = columns.map((c, i) => `<th${i === 0 ? '' : ' class="num"'}>${escape(c)}</th>`).join('')
  const body = rows
    .map(
      (r) => `
        <tr class="${r.recommended ? 'win' : ''}">
          <td>${escape(r.label)}${r.recommended ? '<span class="badge">conseillé</span>' : ''}</td>
          ${r.cells.map((c) => `<td class="num">${escape(c)}</td>`).join('')}
        </tr>`,
    )
    .join('')
  return `<div class="card"><h2>${escape(title)}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

function renderBreakdown(vm: ViewModel): string {
  const lines = vm.breakdown
    .map(
      (line) => `
        <div class="line">
          <div class="row">
            <span class="label">${escape(line.label)}</span>
            <span class="amount">${escape(line.amount)}</span>
          </div>
          <div class="detail">${escape(line.detail)}</div>
        </div>`,
    )
    .join('')
  const rate =
    vm.effectiveRate === undefined
      ? ''
      : `<div class="line"><div class="row">
          <span class="label">${escape(vm.effectiveRateLabel ?? 'Taux de prélèvement effectif')}</span>
          <span class="amount">${escape(vm.effectiveRate)}</span>
        </div></div>`
  return `<div class="card"><h2>Le détail, ligne par ligne</h2>${lines}${rate}</div>`
}

function renderWarnings(vm: ViewModel): string {
  if (vm.warnings.length === 0) return ''
  const items = vm.warnings.map((w) => `<li class="${escape(w.level)}">${escape(w.message)}</li>`).join('')
  return `<div class="card"><h2>À garder en tête</h2><ul class="warnings">${items}</ul></div>`
}

/** Shows the field group for the selected profile and hides the others. */
function toggleFields(profile: Profile): void {
  for (const p of ['micro', 'particulier', 'societe'] as Profile[]) {
    el(`fields-${p}`).hidden = p !== profile
  }
}

function render(): void {
  const profile = el<HTMLSelectElement>('profile').value as Profile
  const result = el('result')
  let vm: ViewModel
  try {
    vm = buildViewModel(profile)
  } catch {
    result.innerHTML = '<div class="card"><p>Vérifiez vos saisies (montants ≥ 0, parts ≥ 1).</p></div>'
    return
  }

  result.innerHTML = `
    <div class="card reco">
      <h2>${escape(vm.recommendationTitle)}</h2>
      <div class="net">${escape(vm.netHighlight)}</div>
      <div class="sub">${escape(vm.netLabel)} — ${escape(vm.recommendationDetail)}</div>
    </div>
    ${renderComparison(vm)}
    ${renderBreakdown(vm)}
    ${renderWarnings(vm)}`
}

el('profile').addEventListener('change', () => {
  toggleFields(el<HTMLSelectElement>('profile').value as Profile)
  render()
})
el('form').addEventListener('input', render)

toggleFields(el<HTMLSelectElement>('profile').value as Profile)
render()
