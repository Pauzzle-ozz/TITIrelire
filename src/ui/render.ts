/**
 * Pure presentation layer: turns a {@link ViewModel} into HTML strings. DOM-free and
 * side-effect-free, so every branch (recommendation, comparison, breakdown, warnings) is
 * unit-testable without a browser. All interpolated text is escaped — the engine's French
 * labels are trusted, but escaping keeps the render XSS-safe by construction.
 */
import type { ViewModel } from './view-model.js'

/** Minimal HTML escaping for any text injected into the result markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderComparison(vm: ViewModel): string {
  if (vm.comparison === undefined) return ''
  const { title, columns, rows } = vm.comparison
  const head = columns
    .map((c, i) => `<th${i === 0 ? ' scope="col"' : ' scope="col" class="num"'}>${escapeHtml(c)}</th>`)
    .join('')
  const body = rows
    .map(
      (r) => `
        <tr class="${r.recommended ? 'win' : ''}">
          <th scope="row">${escapeHtml(r.label)}${
            r.recommended ? '<span class="badge">conseillé</span>' : ''
          }</th>
          ${r.cells.map((c) => `<td class="num">${escapeHtml(c)}</td>`).join('')}
        </tr>`,
    )
    .join('')
  return `<section class="card"><h2>${escapeHtml(title)}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`
}

function renderBreakdown(vm: ViewModel): string {
  const lines = vm.breakdown
    .map(
      (line) => `
        <div class="line">
          <div class="row">
            <span class="label">${escapeHtml(line.label)}</span>
            <span class="amount">${escapeHtml(line.amount)}</span>
          </div>
          <div class="detail">${escapeHtml(line.detail)}</div>
        </div>`,
    )
    .join('')
  const rate =
    vm.effectiveRate === undefined
      ? ''
      : `<div class="line rate"><div class="row">
          <span class="label">${escapeHtml(vm.effectiveRateLabel ?? 'Taux de prélèvement effectif')}</span>
          <span class="amount">${escapeHtml(vm.effectiveRate)}</span>
        </div></div>`
  return `<section class="card"><h2>Le détail, ligne par ligne</h2>${lines}${rate}</section>`
}

function renderWarnings(vm: ViewModel): string {
  if (vm.warnings.length === 0) return ''
  const items = vm.warnings
    .map((w) => `<li class="${w.level}">${escapeHtml(w.message)}</li>`)
    .join('')
  return `<section class="card"><h2>À garder en tête</h2><ul class="warnings">${items}</ul></section>`
}

/** Composes the full result view: recommendation headline, comparison, breakdown, caveats. */
export function renderResult(vm: ViewModel): string {
  return `
    <section class="card reco" aria-labelledby="reco-heading">
      <h2 id="reco-heading">${escapeHtml(vm.recommendationTitle)}</h2>
      <p class="net">${escapeHtml(vm.netHighlight)}</p>
      <p class="sub">${escapeHtml(vm.netLabel)} — ${escapeHtml(vm.recommendationDetail)}</p>
    </section>
    ${renderComparison(vm)}
    ${renderBreakdown(vm)}
    ${renderWarnings(vm)}`
}

/** The message shown when input is invalid (amounts ≥ 0, parts ≥ 1). */
export const INVALID_INPUT_HTML =
  '<section class="card invalid" role="alert"><p>Vérifiez vos saisies : montants ≥ 0, parts ≥ 1.</p></section>'

/**
 * Shown when the user has not entered their real figures yet. The tool never invents data, so
 * there is nothing to compute until then — an honest empty state instead of a demo result.
 */
export const EMPTY_STATE_HTML =
  '<section class="card empty-state"><p>Renseignez vos données réelles pour voir votre situation fiscale — rien n’est calculé sur des exemples.</p></section>'
