/**
 * UI wiring: reads the form, runs the comparison in the browser, and renders the
 * transparent result. No network, no storage — everything stays on the device.
 */
import { compare, type ActivityType, type CompareInput } from '../index.js'
import { toViewModel, type ViewModel } from './view-model.js'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`Missing element #${id}`)
  return node as T
}

/** Minimal HTML escaping for text injected into the result markup. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readInput(): CompareInput {
  return {
    activity: el<HTMLSelectElement>('activity').value as ActivityType,
    revenue: Number(el<HTMLInputElement>('revenue').value),
    parts: Number(el<HTMLInputElement>('parts').value),
    otherHouseholdTaxableIncome: Number(el<HTMLInputElement>('other').value),
    acre: el<HTMLInputElement>('acre').checked,
    acreReducedRate: el<HTMLInputElement>('acreReduced').checked,
  }
}

function renderOptions(vm: ViewModel): string {
  const rows = vm.options
    .map(
      (o) => `
        <tr class="${o.recommended ? 'win' : ''}">
          <td>${escape(o.label)}${o.recommended ? '<span class="badge">conseillé</span>' : ''}</td>
          <td class="num">${escape(o.incomeTax)}</td>
          <td class="num">${escape(o.totalLevies)}</td>
          <td class="num">${escape(o.netIncome)}</td>
        </tr>`,
    )
    .join('')
  return `
    <table>
      <thead>
        <tr>
          <th>Option</th>
          <th class="num">Impôt</th>
          <th class="num">Prélèvements</th>
          <th class="num">Revenu net</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
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
  return `<div class="card"><h2>Le détail, ligne par ligne</h2>${lines}
    <div class="line"><div class="row">
      <span class="label">Taux de prélèvement effectif</span>
      <span class="amount">${escape(vm.effectiveRate)}</span>
    </div></div>
  </div>`
}

function renderWarnings(vm: ViewModel): string {
  if (vm.warnings.length === 0) return ''
  const items = vm.warnings
    .map((w) => `<li class="${w.level}">${escape(w.message)}</li>`)
    .join('')
  return `<div class="card"><h2>À garder en tête</h2><ul class="warnings">${items}</ul></div>`
}

function render(): void {
  const result = el('result')
  let vm: ViewModel
  try {
    vm = toViewModel(compare(readInput()))
  } catch {
    result.innerHTML =
      '<div class="card"><p>Vérifiez vos saisies (chiffre d\'affaires ≥ 0, parts ≥ 1).</p></div>'
    return
  }

  result.innerHTML = `
    <div class="card reco">
      <h2>${escape(vm.recommendationTitle)}</h2>
      <div class="net">${escape(vm.netHighlight)}</div>
      <div class="sub">revenu net estimé — ${escape(vm.recommendationDetail)}</div>
    </div>
    <div class="card"><h2>Barème vs versement libératoire</h2>${renderOptions(vm)}</div>
    ${renderBreakdown(vm)}
    ${renderWarnings(vm)}`
}

// Recompute live on any change.
el('form').addEventListener('input', render)
render()
