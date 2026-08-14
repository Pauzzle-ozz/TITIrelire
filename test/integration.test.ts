// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { compare, compareDividendes, comparePER, simulateParticulier } from '../src/index.js'
import {
  toMicroViewModel,
  toParticulierViewModel,
  toSocieteViewModel,
} from '../src/ui/view-model.js'
import { installIndexDom } from './dom-fixture.js'

// ── DOM helpers ─────────────────────────────────────────────────────────────────
function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }))
}
function setValue(id: string, value: string | number): void {
  const el = document.getElementById(id) as HTMLInputElement
  el.value = String(value)
  fire(el, 'input')
}
function selectProfile(value: string): void {
  const el = document.getElementById('profile') as HTMLSelectElement
  el.value = value
  fire(el, 'change')
}
function selectActivity(value: string): void {
  const el = document.getElementById('activity') as HTMLSelectElement
  el.value = value
  fire(el, 'input')
}

/** The headline "net" figure the user sees. */
function domNet(): string {
  return document.querySelector('#result .reco .net')?.textContent ?? ''
}
/** Every numeric cell of the comparison table, in document order. */
function domComparisonCells(): string[] {
  return [...document.querySelectorAll('#result table td.num')].map((td) => td.textContent ?? '')
}
/** Every breakdown amount (line-by-line + the trailing effective-rate line). */
function domBreakdownAmounts(): string[] {
  return [...document.querySelectorAll('#result .line .amount')].map((a) => a.textContent ?? '')
}

async function boot(): Promise<void> {
  await import('../src/ui/main.js')
}

describe('backend↔frontend integration — the DOM equals the engine (étanchéité)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers() // freeze splash/animator timers; we only assert rendered output
    installIndexDom()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('micro: net, comparison and breakdown match compare()+view-model exactly', async () => {
    await boot()
    selectActivity('vente_marchandises')
    setValue('revenue', 50000)

    const vm = toMicroViewModel(
      compare({
        activity: 'vente_marchandises',
        revenue: 50000,
        parts: 1,
        otherHouseholdTaxableIncome: 0,
        acre: false,
        acreReducedRate: false,
      }),
    )

    expect(domNet()).toBe(vm.netHighlight)
    expect(domComparisonCells()).toEqual(vm.comparison!.rows.flatMap((r) => r.cells))
    expect(domBreakdownAmounts().slice(0, vm.breakdown.length)).toEqual(
      vm.breakdown.map((b) => b.amount),
    )
    expect(domBreakdownAmounts().at(-1)).toBe(vm.effectiveRate)
  })

  it('particulier (with PER): net, comparison and breakdown match the engine exactly', async () => {
    await boot()
    selectProfile('particulier')
    setValue('p-per', 5000)

    const input = { salaireNetImposable: 40000, parts: 1, perContribution: 5000, autresRevenus: 0 }
    const vm = toParticulierViewModel(simulateParticulier(input), comparePER(input))

    expect(domNet()).toBe(vm.netHighlight)
    expect(domComparisonCells()).toEqual(vm.comparison!.rows.flatMap((r) => r.cells))
    expect(domBreakdownAmounts().slice(0, vm.breakdown.length)).toEqual(
      vm.breakdown.map((b) => b.amount),
    )
  })

  it('société: net, comparison and breakdown match compareDividendes()+view-model exactly', async () => {
    await boot()
    selectProfile('societe')

    const vm = toSocieteViewModel(
      compareDividendes({ benefice: 100000, reducedRateEligible: true, parts: 1, autresRevenus: 0 }),
    )

    expect(domNet()).toBe(vm.netHighlight)
    expect(domComparisonCells()).toEqual(vm.comparison!.rows.flatMap((r) => r.cells))
    expect(domBreakdownAmounts().slice(0, vm.breakdown.length)).toEqual(
      vm.breakdown.map((b) => b.amount),
    )
  })

  it('switching profiles shows the right fields and re-renders consistently', async () => {
    await boot()
    selectProfile('particulier')
    expect((document.getElementById('fields-particulier') as HTMLDivElement).hidden).toBe(false)
    expect((document.getElementById('fields-micro') as HTMLDivElement).hidden).toBe(true)
    expect((document.getElementById('fields-societe') as HTMLDivElement).hidden).toBe(true)

    selectProfile('societe')
    expect((document.getElementById('fields-societe') as HTMLDivElement).hidden).toBe(false)
    expect((document.getElementById('fields-particulier') as HTMLDivElement).hidden).toBe(true)
    expect(document.getElementById('result')!.innerHTML).toContain('Impôt sur les sociétés')
  })

  it('never leaks NaN/undefined into the rendered result for valid input', async () => {
    await boot()
    for (const profile of ['micro', 'particulier', 'societe']) {
      selectProfile(profile)
      const html = document.getElementById('result')!.innerHTML
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('undefined')
      expect(domNet()).toContain('€')
    }
  })
})
