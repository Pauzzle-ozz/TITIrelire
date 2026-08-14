// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readForm } from '../src/ui/form-state.js'
import { initVaultPanel, type VaultPanelHandle } from '../src/ui/vault-panel.js'
import { MemoryVaultStorage } from '../src/vault/storage.js'
import type { VaultState } from '../src/vault/types.js'

/** Full DOM: the vault panel plus the micro form fields the panel reads/writes. */
function setupDom(): void {
  document.body.innerHTML = `
    <section id="vault">
      <div id="vault-locked">
        <input id="vault-password" type="password" />
        <button id="vault-unlock" type="button" hidden>Unlock</button>
        <button id="vault-create" type="button" hidden>Create</button>
      </div>
      <div id="vault-unlocked" hidden>
        <button id="vault-lock" type="button">Lock</button>
      </div>
      <p id="vault-msg"></p>
    </section>
    <form id="form">
      <select id="profile"><option value="micro" selected>Micro</option>
        <option value="particulier">P</option><option value="societe">S</option></select>
      <div id="fields-micro">
        <select id="activity"><option value="prestations_bnc" selected>BNC</option></select>
        <input id="revenue" type="number" value="40000" />
        <input id="parts" type="number" value="1" />
        <input id="other" type="number" value="0" />
        <input id="acre" type="checkbox" />
        <input id="acreReduced" type="checkbox" />
      </div>
      <div id="fields-particulier">
        <input id="p-salaire" value="0" /><input id="p-parts" value="1" />
        <input id="p-frais" /><input id="p-per" value="0" /><input id="p-autres" value="0" />
      </div>
      <div id="fields-societe">
        <input id="s-benefice" value="0" /><input id="s-dividendes" />
        <input id="s-parts" value="1" /><input id="s-autres" value="0" />
        <input id="s-reduced" type="checkbox" />
      </div>
    </form>`
}

const NOW = () => '2026-08-14T12:00:00.000Z'

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new Event('click', { bubbles: true }))
}

/** Awaits until `predicate()` is true (crypto handlers are async), or fails after a budget. */
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor timed out')
}

beforeEach(setupDom)

describe('initVaultPanel presence gate', () => {
  it('returns null when there is no #vault container', async () => {
    document.getElementById('vault')?.remove()
    const handle = await initVaultPanel({
      doc: document,
      storage: new MemoryVaultStorage(),
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })
    expect(handle).toBeNull()
  })

  it('offers "create" when no vault exists yet', async () => {
    await initVaultPanel({
      doc: document,
      storage: new MemoryVaultStorage(),
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })
    expect((document.getElementById('vault-create') as HTMLButtonElement).hidden).toBe(false)
    expect((document.getElementById('vault-unlock') as HTMLButtonElement).hidden).toBe(true)
  })
})

describe('create → autosave → lock → unlock lifecycle', () => {
  it('creates a vault, persists edits, and restores them after a lock/unlock', async () => {
    const storage = new MemoryVaultStorage()
    const applySnapshot = vi.fn<(s: VaultState) => void>()

    const handle = (await initVaultPanel({
      doc: document,
      storage,
      now: NOW,
      readForm,
      applySnapshot,
    })) as VaultPanelHandle

    // Create the space.
    ;(document.getElementById('vault-password') as HTMLInputElement).value = 'master-pw-123'
    click('vault-create')
    // Wait for the handler to fully finish (unlocked section revealed), not just for the
    // vault to be assigned — showUnlocked() runs a few awaits after isUnlocked() flips.
    await waitFor(() => !(document.getElementById('vault-unlocked') as HTMLDivElement).hidden)
    expect(handle.isUnlocked()).toBe(true)
    expect(await storage.load()).not.toBeNull()
    // Password field is cleared after use (hygiene).
    expect((document.getElementById('vault-password') as HTMLInputElement).value).toBe('')

    // Edit the form and autosave.
    ;(document.getElementById('revenue') as HTMLInputElement).value = '72000'
    await handle.save()

    // Lock.
    click('vault-lock')
    expect(handle.isUnlocked()).toBe(false)
    expect((document.getElementById('vault-unlock') as HTMLButtonElement).hidden).toBe(false)

    // A fresh panel over the same storage should now offer unlock and restore the data.
    const applySnapshot2 = vi.fn<(s: VaultState) => void>()
    const handle2 = (await initVaultPanel({
      doc: document,
      storage,
      now: NOW,
      readForm,
      applySnapshot: applySnapshot2,
    })) as VaultPanelHandle
    ;(document.getElementById('vault-password') as HTMLInputElement).value = 'master-pw-123'
    click('vault-unlock')
    await waitFor(() => handle2.isUnlocked())

    expect(applySnapshot2).toHaveBeenCalledTimes(1)
    const restored = applySnapshot2.mock.calls[0]?.[0] as VaultState
    expect(restored.profileInputs.micro?.['revenue']).toBe('72000')
  })
})

describe('error handling', () => {
  it('shows a message and stays locked on a wrong password', async () => {
    const storage = new MemoryVaultStorage()
    // Seed a vault with a known password via a first panel.
    const h1 = (await initVaultPanel({
      doc: document,
      storage,
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })) as VaultPanelHandle
    ;(document.getElementById('vault-password') as HTMLInputElement).value = 'right-pw'
    click('vault-create')
    await waitFor(() => h1.isUnlocked())
    click('vault-lock')

    const h2 = (await initVaultPanel({
      doc: document,
      storage,
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })) as VaultPanelHandle
    ;(document.getElementById('vault-password') as HTMLInputElement).value = 'wrong-pw'
    click('vault-unlock')
    await waitFor(() => (document.getElementById('vault-msg')?.textContent ?? '').includes('incorrect'))
    expect(h2.isUnlocked()).toBe(false)
  })

  it('refuses to create with an empty password', async () => {
    const handle = (await initVaultPanel({
      doc: document,
      storage: new MemoryVaultStorage(),
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })) as VaultPanelHandle
    ;(document.getElementById('vault-password') as HTMLInputElement).value = ''
    click('vault-create')
    await waitFor(() => (document.getElementById('vault-msg')?.textContent ?? '').includes('Choisis'))
    expect(handle.isUnlocked()).toBe(false)
  })

  it('save is a no-op while locked', async () => {
    const storage = new MemoryVaultStorage()
    const handle = (await initVaultPanel({
      doc: document,
      storage,
      now: NOW,
      readForm,
      applySnapshot: () => {},
    })) as VaultPanelHandle
    await handle.save()
    expect(await storage.load()).toBeNull()
  })
})
