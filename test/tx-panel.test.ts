// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LearnedRules } from '../src/classify/learned.js'
import type { Transaction } from '../src/transactions/types.js'
import { initTxPanel, type TxPanelData, type TxPanelHandle } from '../src/ui/tx-panel.js'

function setupDom(): void {
  document.body.innerHTML = `
    <section id="transactions">
      <textarea id="tx-input"></textarea>
      <select id="tx-preset"><option value="generic" selected>Générique</option></select>
      <button id="tx-import-btn" type="button">Importer</button>
      <input id="tx-file" type="file" />
      <div id="tx-table"></div>
      <p id="tx-msg"></p>
    </section>`
}

const CSV = [
  'id,date,amount,label,currency',
  't1,2026-03-01,5000,FACTURE ACME,EUR',
  't2,2026-03-02,-300,PRLV URSSAF,EUR',
  't3,2026-03-03,2000,VIR SALAIRE,EUR',
].join('\n')

const NOW = () => '2026-08-14T12:00:00.000Z'

/** A store backing load/save so persistence is observable. */
function makeStore(initial: TxPanelData = { transactions: [], learned: {} }) {
  let data = initial
  return {
    load: (): TxPanelData => data,
    save: vi.fn((next: TxPanelData) => {
      data = next
    }),
    get: () => data,
  }
}

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new Event('click', { bubbles: true }))
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(setupDom)

describe('presence gate', () => {
  it('returns null without a #transactions container', () => {
    document.getElementById('transactions')?.remove()
    const handle = initTxPanel({ doc: document, now: NOW, load: () => ({ transactions: [], learned: {} }), save: () => {} })
    expect(handle).toBeNull()
  })

  it('renders the empty state initially', () => {
    initTxPanel({ doc: document, now: NOW, load: () => ({ transactions: [], learned: {} }), save: () => {} })
    expect(document.getElementById('tx-table')?.innerHTML).toContain('Aucune transaction')
  })
})

describe('CSV import + classification', () => {
  it('imports, classifies, persists, and reports the pro CA', async () => {
    const store = makeStore()
    const onProRevenue = vi.fn()
    const handle = initTxPanel({ doc: document, now: NOW, load: store.load, save: store.save, onProRevenue }) as TxPanelHandle

    ;(document.getElementById('tx-input') as HTMLTextAreaElement).value = CSV
    click('tx-import-btn')
    await tick()

    expect(handle.transactions()).toHaveLength(3)
    const html = document.getElementById('tx-table')!.innerHTML
    expect(html).toContain('FACTURE ACME')
    expect(html).toContain('URSSAF')
    // t1 is unknown income → not in the CA yet; last reported pro revenue is 0.
    expect(onProRevenue).toHaveBeenLastCalledWith(0)
    expect(store.save).toHaveBeenCalled()
    expect(store.get().transactions).toHaveLength(3)
  })

  it('does not double-import the same transactions (dedupe by id)', async () => {
    const store = makeStore()
    const handle = initTxPanel({ doc: document, now: NOW, load: store.load, save: store.save }) as TxPanelHandle
    ;(document.getElementById('tx-input') as HTMLTextAreaElement).value = CSV
    click('tx-import-btn')
    await tick()
    click('tx-import-btn')
    await tick()
    expect(handle.transactions()).toHaveLength(3)
  })

  it('shows a message on invalid CSV', async () => {
    const store = makeStore()
    initTxPanel({ doc: document, now: NOW, load: store.load, save: store.save })
    ;(document.getElementById('tx-input') as HTMLTextAreaElement).value = 'not,a,valid\nrow'
    click('tx-import-btn')
    await tick()
    expect(document.getElementById('tx-msg')?.textContent ?? '').toMatch(/impossible/i)
  })
})

describe('correction + learning', () => {
  it('correcting an unknown income to pro learns it and lifts the pro CA', async () => {
    const store = makeStore()
    const onProRevenue = vi.fn()
    const handle = initTxPanel({ doc: document, now: NOW, load: store.load, save: store.save, onProRevenue }) as TxPanelHandle
    ;(document.getElementById('tx-input') as HTMLTextAreaElement).value = CSV
    click('tx-import-btn')
    await tick()

    const select = document.querySelector<HTMLSelectElement>('select.tx-cat[data-tx-id="t1"]')!
    select.value = 'pro'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()

    // The correction was learned and persisted...
    const learned: LearnedRules = store.get().learned
    expect(Object.keys(learned).length).toBe(1)
    // ...and the pro CA now includes the 5000 € invoice.
    expect(onProRevenue).toHaveBeenLastCalledWith(5000)
  })
})

describe('refresh', () => {
  it('reloads persisted state and re-renders', () => {
    const seed: Transaction[] = [
      { id: 's1', date: '2026-02-02', amount: -300, currency: 'EUR', label: 'PRLV URSSAF', source: 'seed' },
    ]
    const store = makeStore({ transactions: seed, learned: {} })
    const handle = initTxPanel({ doc: document, now: NOW, load: store.load, save: store.save }) as TxPanelHandle
    expect(handle.transactions()).toHaveLength(1)
    expect(document.getElementById('tx-table')?.innerHTML).toContain('URSSAF')
    handle.refresh()
    expect(handle.transactions()).toHaveLength(1)
  })
})
