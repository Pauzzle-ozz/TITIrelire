/**
 * Pure presentation for the multi-year projection of optimisations. DOM-free and escaped.
 * Shows each top optimisation's cumulative gain at milestone years (1 / 3 / 5), plus the
 * combined total — the "sur X années, vous économisez tant" view.
 */
import type { Projection } from '../advice/projection.js'
import { escapeHtml } from './render.js'
import { formatEuro } from './tx-view-model.js'

/** Cumulative gain of a scenario at a milestone year (1-based). */
function atYear(cumulative: number[], year: number): number {
  return cumulative[year - 1] ?? cumulative[cumulative.length - 1] ?? 0
}

/** Renders the projection card, or an empty string when there is nothing to project. */
export function renderProjection(projection: Projection): string {
  if (projection.scenarios.length === 0) return ''
  const { milestones } = projection
  const head = milestones.map((y) => `<th class="num">${y} an${y > 1 ? 's' : ''}</th>`).join('')
  const rows = projection.scenarios
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.title)}</td>
        <td class="num">${escapeHtml(formatEuro(s.yearlyGain))}</td>
        ${milestones.map((y) => `<td class="num">${escapeHtml(formatEuro(atYear(s.cumulative, y)))}</td>`).join('')}
      </tr>`,
    )
    .join('')
  const footer = `
    <tr class="proj-total">
      <th>Total cumulé</th>
      <th class="num">—</th>
      ${milestones.map((y) => `<th class="num">${escapeHtml(formatEuro(atYear(projection.combinedCumulative, y)))}</th>`).join('')}
    </tr>`

  return `
    <section class="card proj-card" aria-labelledby="proj-h">
      <h2 id="proj-h">Projection de vos optimisations</h2>
      <p class="proj-lede">Gains cumulés à conditions constantes (estimation indicative).</p>
      <table class="proj-table">
        <thead><tr><th>Levier</th><th class="num">/ an</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${footer}</tfoot>
      </table>
    </section>`
}
