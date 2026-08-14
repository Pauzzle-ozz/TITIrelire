/**
 * Pure presentation for the transactions table. DOM-free and side-effect-free: it turns a
 * {@link TxTableViewModel} into HTML strings, escaping every interpolated value (labels come
 * from bank exports — untrusted — so escaping is mandatory here, not just prudent).
 *
 * Each row carries an inline category `<select>` tagged with `data-tx-id`, so the controller
 * ({@link ./tx-panel.js}) can wire corrections without the render knowing about the DOM.
 */
import { escapeHtml } from './render.js'
import type { TxCategory } from '../classify/types.js'
import { categoryLabel, formatEuro, type TxRow, type TxTableViewModel } from './tx-view-model.js'

const CATEGORIES: readonly TxCategory[] = ['pro', 'perso', 'unknown']

/** The per-row category dropdown used to correct a classification. */
export function renderCategorySelect(row: TxRow): string {
  const options = CATEGORIES.map(
    (c) =>
      `<option value="${c}"${c === row.category ? ' selected' : ''}>${escapeHtml(categoryLabel(c))}</option>`,
  ).join('')
  return `<select class="tx-cat" data-tx-id="${escapeHtml(row.id)}" aria-label="Catégorie">${options}</select>`
}

function renderRow(row: TxRow): string {
  return `
    <tr class="tx-row cat-${row.category}">
      <td class="tx-date">${escapeHtml(row.date)}</td>
      <td class="tx-label">${escapeHtml(row.label)}</td>
      <td class="num tx-amount ${row.direction}">${escapeHtml(row.amountLabel)}</td>
      <td class="tx-category">${renderCategorySelect(row)}</td>
      <td class="tx-reason">${escapeHtml(row.reason)}<span class="tx-conf">${row.confidencePct}%</span></td>
    </tr>`
}

/** Renders the summary strip above the table (totals + the CA the engine will use). */
function renderSummary(vm: TxTableViewModel): string {
  const { summary } = vm
  const nudge =
    vm.unknownIncomeCount > 0
      ? `<p class="tx-nudge">${vm.unknownIncomeCount} encaissement(s) à classer — ils ne comptent pas encore dans le CA.</p>`
      : ''
  return `
    <div class="tx-summary">
      <div class="tx-stat"><span class="tx-stat-k">CA pro (retenu)</span><span class="tx-stat-v">${escapeHtml(vm.proRevenueLabel)}</span></div>
      <div class="tx-stat"><span class="tx-stat-k">Dépenses pro</span><span class="tx-stat-v">${escapeHtml(formatEuro(summary.pro.expenses))}</span></div>
      <div class="tx-stat"><span class="tx-stat-k">Perso (info)</span><span class="tx-stat-v">${escapeHtml(formatEuro(summary.perso.revenue))}</span></div>
    </div>
    ${nudge}`
}

/** Renders the whole transactions table (or an empty-state message). */
export function renderTxTable(vm: TxTableViewModel): string {
  if (vm.rows.length === 0) {
    return `<p class="tx-empty">Aucune transaction pour l'instant. Importez un relevé CSV pour commencer.</p>`
  }
  const body = vm.rows.map(renderRow).join('')
  return `
    ${renderSummary(vm)}
    <table class="tx-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Libellé</th>
          <th scope="col" class="num">Montant</th>
          <th scope="col">Catégorie</th>
          <th scope="col">Pourquoi</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`
}
