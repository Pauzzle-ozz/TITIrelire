/**
 * Pure presentation for the advice panel. DOM-free and escaped: turns {@link Advice}[] into
 * an HTML card. Advice text is French and produced by our own engine, but it is escaped all
 * the same (XSS-safe by construction, consistent with {@link ./render.js}).
 */
import type { Advice } from '../advice/types.js'
import { totalEstimatedGain } from '../advice/micro.js'
import { escapeHtml } from './render.js'
import { formatEuro } from './tx-view-model.js'

/** French heading for each advice kind. */
function kindLabel(kind: Advice['kind']): string {
  return kind === 'optimisation' ? 'Optimisation' : kind === 'alerte' ? 'À surveiller' : 'Bon à savoir'
}

function renderItem(advice: Advice): string {
  const gain =
    advice.estimatedGain !== undefined && advice.estimatedGain > 0
      ? `<span class="advice-gain">+${escapeHtml(formatEuro(advice.estimatedGain))}/an</span>`
      : ''
  return `
    <li class="advice-item kind-${advice.kind}">
      <div class="advice-head">
        <span class="advice-kind">${escapeHtml(kindLabel(advice.kind))}</span>
        <span class="advice-title">${escapeHtml(advice.title)}</span>
        ${gain}
      </div>
      <p class="advice-detail">${escapeHtml(advice.detail)}</p>
    </li>`
}

/**
 * Renders the advice card, or an empty string when there is nothing to say. A headline sums
 * the identified optimisations as an indicative "up to X/year".
 */
export function renderAdvice(advice: Advice[]): string {
  if (advice.length === 0) return ''
  const total = totalEstimatedGain(advice)
  const headline =
    total > 0
      ? `<p class="advice-headline">Jusqu'à <strong>${escapeHtml(formatEuro(total))}/an</strong> à optimiser <span class="advice-hint">(estimation indicative)</span></p>`
      : ''
  const items = advice.map(renderItem).join('')
  return `<section class="card advice-card" aria-labelledby="advice-h">
    <h2 id="advice-h">Conseils &amp; optimisations</h2>
    ${headline}
    <ul class="advice-list">${items}</ul>
    <p class="advice-disclaimer">Information et simulation transparentes — ne remplace pas un expert-comptable.</p>
  </section>`
}
