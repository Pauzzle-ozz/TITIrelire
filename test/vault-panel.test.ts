// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SpaceRegistry } from '../src/vault/registry.js'
import { MemoryVaultStorage, type WebStorageLike } from '../src/vault/storage.js'
import type { VaultState } from '../src/vault/types.js'
import { initVaultPanel, type VaultPanelDeps, type VaultPanelHandle } from '../src/ui/vault-panel.js'

/** DOM mirroring the espace page: space picker, create form, unlocked view. */
function setupDom(): void {
  document.body.innerHTML = `
    <section id="vault">
      <div id="vault-locked">
        <div id="vault-existing">
          <select id="vault-space-select"></select>
          <input id="vault-password" type="password" />
          <button id="vault-unlock" type="button">Déverrouiller</button>
        </div>
        <input id="vault-name" type="text" />
        <input id="vault-newpass" type="password" />
        <button id="vault-create" type="button">Créer</button>
      </div>
      <div id="vault-unlocked" hidden>
        <span id="vault-current-name"></span>
        <button id="vault-lock" type="button">Verrouiller</button>
        <button id="vault-switch" type="button">Changer</button>
      </div>
      <p id="vault-msg"></p>
    </section>`
}

function fakeStore(): WebStorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

/** Builds panel deps with an in-memory registry and per-space memory storage. */
function makeDeps(over: Partial<VaultPanelDeps> = {}): VaultPanelDeps {
  const storages = new Map<string, MemoryVaultStorage>()
  let counter = 0
  return {
    doc: document,
    now: () => '2026-08-14T12:00:00.000Z',
    registry: new SpaceRegistry(fakeStore()),
    makeStorage: (id) => {
      let s = storages.get(id)
      if (s === undefined) {
        s = new MemoryVaultStorage()
        storages.set(id, s)
      }
      return s
    },
    genId: () => `id-${(counter += 1)}`,
    readForm: () => ({ activeProfile: 'micro', profileInputs: { micro: { revenue: '40000' } } }),
    applySnapshot: () => {},
    ...over,
  }
}

const val = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement
function set(id: string, value: string): void {
  val(id).value = value
}
function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new Event('click', { bubbles: true }))
}
async function waitFor(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor timed out')
}
const unlockedVisible = (): boolean => !(document.getElementById('vault-unlocked') as HTMLElement).hidden

beforeEach(setupDom)

describe('presence gate', () => {
  it('returns null without a #vault container', () => {
    document.getElementById('vault')?.remove()
    expect(initVaultPanel(makeDeps())).toBeNull()
  })

  it('hides the existing-spaces block when there are none', () => {
    initVaultPanel(makeDeps())
    expect((document.getElementById('vault-existing') as HTMLElement).hidden).toBe(true)
  })
})

describe('create a named space', () => {
  it('requires a name', async () => {
    initVaultPanel(makeDeps())
    set('vault-name', '')
    set('vault-newpass', 'pw')
    click('vault-create')
    await waitFor(() => (document.getElementById('vault-msg')?.textContent ?? '').includes('nom'))
    expect(unlockedVisible()).toBe(false)
  })

  it('requires a password', async () => {
    initVaultPanel(makeDeps())
    set('vault-name', 'Perso')
    set('vault-newpass', '')
    click('vault-create')
    await waitFor(() => (document.getElementById('vault-msg')?.textContent ?? '').includes('mot de passe'))
    expect(unlockedVisible()).toBe(false)
  })

  it('creates, registers, and unlocks the space', async () => {
    const deps = makeDeps()
    const handle = initVaultPanel(deps) as VaultPanelHandle
    set('vault-name', 'Mon activité')
    set('vault-newpass', 'secret-123')
    click('vault-create')
    await waitFor(unlockedVisible)
    expect(handle.isUnlocked()).toBe(true)
    expect(handle.spaceName()).toBe('Mon activité')
    expect(deps.registry.list().map((s) => s.name)).toEqual(['Mon activité'])
    expect(document.getElementById('vault-current-name')?.textContent).toBe('Mon activité')
  })
})

describe('multiple spaces: lock, list, switch, unlock', () => {
  it('lists created spaces in the picker and unlocks the chosen one', async () => {
    const deps = makeDeps()
    const applySnapshot = vi.fn<(s: VaultState) => void>()
    const handle = initVaultPanel({ ...deps, applySnapshot }) as VaultPanelHandle

    // Create "Perso".
    set('vault-name', 'Perso')
    set('vault-newpass', 'pw-perso')
    click('vault-create')
    await waitFor(unlockedVisible)
    click('vault-lock')

    // Create "Activité".
    set('vault-name', 'Activité')
    set('vault-newpass', 'pw-activite')
    click('vault-create')
    await waitFor(unlockedVisible)
    click('vault-switch')

    // Both spaces are listed.
    const options = Array.from(document.querySelectorAll('#vault-space-select option')).map((o) => o.textContent)
    expect(options).toEqual(['Perso', 'Activité'])

    // Unlock "Perso" with its password.
    const persoId = deps.registry.list().find((s) => s.name === 'Perso')!.id
    ;(document.getElementById('vault-space-select') as HTMLSelectElement).value = persoId
    set('vault-password', 'pw-perso')
    applySnapshot.mockClear()
    click('vault-unlock')
    await waitFor(() => handle.isUnlocked())
    expect(handle.spaceName()).toBe('Perso')
    expect(applySnapshot).toHaveBeenCalledTimes(1)
  })

  it('keeps each space\'s data separate', async () => {
    const deps = makeDeps()
    const handle = initVaultPanel(deps) as VaultPanelHandle

    set('vault-name', 'A')
    set('vault-newpass', 'pa')
    click('vault-create')
    await waitFor(unlockedVisible)
    await handle.patch({ transactions: [{ id: 'txA', date: '2026-01-01', amount: 10, currency: 'EUR', label: 'A', source: 't' }] })
    click('vault-lock')

    set('vault-name', 'B')
    set('vault-newpass', 'pb')
    click('vault-create')
    await waitFor(unlockedVisible)
    // Fresh space B has no transactions from A.
    expect(handle.snapshot()?.transactions).toEqual([])
  })

  it('fails to unlock with the wrong password', async () => {
    const deps = makeDeps()
    const handle = initVaultPanel(deps) as VaultPanelHandle
    set('vault-name', 'Perso')
    set('vault-newpass', 'right')
    click('vault-create')
    await waitFor(unlockedVisible)
    click('vault-lock')

    const id = deps.registry.list()[0]!.id
    ;(document.getElementById('vault-space-select') as HTMLSelectElement).value = id
    set('vault-password', 'wrong')
    click('vault-unlock')
    await waitFor(() => (document.getElementById('vault-msg')?.textContent ?? '').includes('incorrect'))
    expect(handle.isUnlocked()).toBe(false)
  })
})

describe('locked handle', () => {
  it('save and spaceName are inert while locked', async () => {
    const handle = initVaultPanel(makeDeps()) as VaultPanelHandle
    await handle.save()
    expect(handle.spaceName()).toBeNull()
    expect(handle.snapshot()).toBeNull()
  })
})
