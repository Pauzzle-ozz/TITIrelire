import { describe, expect, it } from 'vitest'

import { classifyAll } from '../src/classify/classify.js'
import { normalizeTransaction } from '../src/transactions/normalize.js'
import { renderCategorySelect, renderTxTable } from '../src/ui/tx-render.js'
import { toTxTableViewModel } from '../src/ui/tx-view-model.js'

function tx(over: { label?: string; amount: number; id: string }) {
  return normalizeTransaction({
    id: over.id,
    date: '2026-03-15',
    amount: over.amount,
    currency: 'EUR',
    label: over.label ?? 'x',
    source: 'test',
  })
}

function vmFor(labels: { label: string; amount: number; id: string }[]) {
  return toTxTableViewModel(classifyAll(labels.map(tx)))
}

describe('renderCategorySelect', () => {
  it('marks the current category as selected and tags the tx id', () => {
    const vm = vmFor([{ label: 'PRLV URSSAF', amount: -300, id: 'abc' }])
    const html = renderCategorySelect(vm.rows[0]!)
    expect(html).toContain('data-tx-id="abc"')
    expect(html).toContain('<option value="pro" selected>')
    expect(html).toContain('value="perso"')
    expect(html).toContain('value="unknown"')
  })
})

describe('renderTxTable', () => {
  it('renders an empty-state message with no transactions', () => {
    expect(renderTxTable(toTxTableViewModel([]))).toContain('Aucune transaction')
  })

  it('renders one row per transaction with amount, category and reason', () => {
    const html = renderTxTable(vmFor([{ label: 'PRLV URSSAF', amount: -300, id: 'a' }]))
    expect(html).toContain('PRLV URSSAF')
    expect(html).toContain('URSSAF') // reason
    expect(html).toContain('95%') // confidence
    expect(html).toContain('class="tx-cat"')
  })

  it('shows the retained pro CA and nudges about unknown income', () => {
    const html = renderTxTable(vmFor([{ label: 'VIR MYSTERE', amount: 900, id: 'a' }]))
    expect(html).toContain('CA pro (retenu)')
    expect(html).toContain('à classer')
  })

  it('escapes untrusted labels (XSS-safe)', () => {
    const html = renderTxTable(vmFor([{ label: '<img src=x onerror=alert(1)>', amount: 10, id: 'a' }]))
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
