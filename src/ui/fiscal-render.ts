/**
 * Pure presentation for the "tableau fiscal" — the accountant-style view built from real
 * transactions: a compte de résultat (produits / charges / résultat) plus the VAT régime.
 * DOM-free and escaped. Nothing is shown when there are no pro transactions to account for.
 */
import type { Ledger } from '../accounting/ledger.js'
import type { TvaStatus } from '../engine/tva.js'
import { escapeHtml } from './render.js'
import { formatEuro } from './tx-view-model.js'

function renderLines(title: string, group: { total: number; lines: Ledger['charges']['lines'] }): string {
  if (group.lines.length === 0) return ''
  const rows = group.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.label)}</td><td class="num">${escapeHtml(formatEuro(l.amount))}</td></tr>`,
    )
    .join('')
  return `
    <div class="fiscal-block">
      <h3 class="fiscal-h3">${escapeHtml(title)}</h3>
      <table class="fiscal-table">
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th><th class="num">${escapeHtml(formatEuro(group.total))}</th></tr></tfoot>
      </table>
    </div>`
}

function renderTva(tva: TvaStatus): string {
  const regimeLabel =
    tva.regime === 'reel' ? 'Réel (TVA due)' : tva.regime === 'tolerance' ? 'Tolérance' : 'Franchise en base'
  const net =
    tva.tvaNetteEstimee !== undefined
      ? ` — TVA nette estimée ${escapeHtml(formatEuro(tva.tvaNetteEstimee))}`
      : ''
  return `
    <div class="fiscal-block">
      <h3 class="fiscal-h3">TVA</h3>
      <p class="fiscal-tva"><strong>${escapeHtml(regimeLabel)}</strong>${net}</p>
      <p class="fiscal-note">${escapeHtml(tva.explanation)}</p>
    </div>`
}

/** Renders the fiscal table, or an empty string when there is nothing to account for. */
export function renderFiscalTable(ledger: Ledger, tva?: TvaStatus): string {
  if (ledger.transactionCount === 0) return ''
  const resultatClass = ledger.resultat >= 0 ? 'positive' : 'negative'
  return `
    <section class="card fiscal-card" aria-labelledby="fiscal-h">
      <h2 id="fiscal-h">Ma situation fiscale (d'après vos transactions)</h2>
      ${renderLines('Produits', ledger.produits)}
      ${renderLines('Charges', ledger.charges)}
      <div class="fiscal-result ${resultatClass}">
        <span>Résultat (produits − charges)</span>
        <span class="num">${escapeHtml(formatEuro(ledger.resultat))}</span>
      </div>
      ${tva !== undefined ? renderTva(tva) : ''}
      <p class="fiscal-disclaimer">Établi à partir de vos transactions classées « pro ». Information transparente, pas un bilan comptable officiel.</p>
    </section>`
}
