// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyForm,
  applyProfileInputs,
  readActiveProfile,
  readForm,
  readProfileInputs,
} from '../src/ui/form-state.js'

/** Minimal form DOM mirroring index.html field ids for all three profiles. */
function setupDom(): void {
  document.body.innerHTML = `
    <form id="form">
      <select id="profile">
        <option value="micro" selected>Micro</option>
        <option value="particulier">Particulier</option>
        <option value="societe">Société</option>
      </select>
      <div id="fields-micro">
        <select id="activity">
          <option value="vente_marchandises">V</option>
          <option value="prestations_bnc" selected>BNC</option>
        </select>
        <input id="revenue" type="number" value="40000" />
        <input id="parts" type="number" value="1" />
        <input id="other" type="number" value="0" />
        <input id="acre" type="checkbox" />
        <input id="acreReduced" type="checkbox" />
      </div>
      <div id="fields-particulier">
        <input id="p-salaire" type="number" value="40000" />
        <input id="p-parts" type="number" value="1" />
        <input id="p-frais" type="number" />
        <input id="p-per" type="number" value="5000" />
        <input id="p-autres" type="number" value="0" />
      </div>
      <div id="fields-societe">
        <input id="s-benefice" type="number" value="100000" />
        <input id="s-dividendes" type="number" />
        <input id="s-parts" type="number" value="1" />
        <input id="s-autres" type="number" value="0" />
        <input id="s-reduced" type="checkbox" checked />
      </div>
    </form>`
}

beforeEach(setupDom)

describe('readActiveProfile', () => {
  it('defaults to micro', () => {
    expect(readActiveProfile(document)).toBe('micro')
  })

  it('reflects the selected profile', () => {
    ;(document.getElementById('profile') as HTMLSelectElement).value = 'societe'
    expect(readActiveProfile(document)).toBe('societe')
  })
})

describe('readProfileInputs', () => {
  it('reads strings for text/select and booleans for checkboxes', () => {
    const micro = readProfileInputs(document, 'micro')
    expect(micro).toEqual({
      activity: 'prestations_bnc',
      revenue: '40000',
      parts: '1',
      other: '0',
      acre: false,
      acreReduced: false,
    })
  })

  it('reads the pre-checked company reduced-rate box as true', () => {
    expect(readProfileInputs(document, 'societe')['s-reduced']).toBe(true)
  })

  it('skips ids absent from the DOM', () => {
    document.getElementById('revenue')?.remove()
    expect('revenue' in readProfileInputs(document, 'micro')).toBe(false)
  })
})

describe('applyProfileInputs', () => {
  it('writes values back into the fields', () => {
    applyProfileInputs(document, 'micro', { revenue: 55000, acre: true, activity: 'vente_marchandises' })
    expect((document.getElementById('revenue') as HTMLInputElement).value).toBe('55000')
    expect((document.getElementById('acre') as HTMLInputElement).checked).toBe(true)
    expect((document.getElementById('activity') as HTMLSelectElement).value).toBe('vente_marchandises')
  })

  it('is a no-op for undefined values', () => {
    applyProfileInputs(document, 'micro', undefined)
    expect((document.getElementById('revenue') as HTMLInputElement).value).toBe('40000')
  })

  it('leaves unlisted fields untouched', () => {
    applyProfileInputs(document, 'micro', { revenue: 1 })
    expect((document.getElementById('parts') as HTMLInputElement).value).toBe('1')
  })
})

describe('readForm / applyForm round-trip', () => {
  it('captures the whole form and restores it into a fresh DOM', () => {
    ;(document.getElementById('profile') as HTMLSelectElement).value = 'particulier'
    ;(document.getElementById('revenue') as HTMLInputElement).value = '73000'
    ;(document.getElementById('acre') as HTMLInputElement).checked = true
    const snapshot = readForm(document)

    setupDom() // wipe to defaults
    applyForm(document, snapshot)

    expect(readActiveProfile(document)).toBe('particulier')
    expect((document.getElementById('revenue') as HTMLInputElement).value).toBe('73000')
    expect((document.getElementById('acre') as HTMLInputElement).checked).toBe(true)
  })
})
