/**
 * The personal-space panel: list named spaces, create a new one, unlock the chosen space,
 * switch between spaces, and autosave into the open one.
 *
 * A **space** (espace) is a named, password-protected vault; several can coexist. The name
 * identifies it — there is no server login (local-first). The registry holds the non-secret
 * list; each space's data lives in its own encrypted blob.
 *
 * Opt-in like before: with no `#vault` container the panel does nothing and returns `null`.
 * It never imports the connectors or the barrel (browser/secret boundary intact).
 */
import type { CryptoDeps } from '../vault/crypto.js'
import type { SpaceRegistry } from '../vault/registry.js'
import type { VaultStorage } from '../vault/storage.js'
import type { ProfileInputs, VaultProfile, VaultState } from '../vault/types.js'
import { Vault } from '../vault/vault.js'

/** What the panel needs from its host, injected for testability. */
export interface VaultPanelDeps {
  doc: Document
  /** Returns the current time as an ISO string (injected — no hidden clock). */
  now: () => string
  /** The registry of named spaces. */
  registry: SpaceRegistry
  /** Builds the encrypted storage for a given space id. */
  makeStorage: (spaceId: string) => VaultStorage
  /** Generates a unique id for a new space (e.g. `crypto.randomUUID()`). */
  genId: () => string
  /** Reads the live form into vault shape (from ./form-state). */
  readForm: (doc: Document) => { activeProfile: VaultProfile; profileInputs: ProfileInputs }
  /** Prefills the form from a snapshot and recomputes the result (host-provided). */
  applySnapshot: (state: VaultState) => void
  /** Called once a space is open (after create or unlock), e.g. to refresh other panels. */
  onOpened?: () => void
  /** Optional WebCrypto override (defaults to the platform's). */
  cryptoDeps?: CryptoDeps
}

/** Handle returned to the host so it can autosave and share the open space's state. */
export interface VaultPanelHandle {
  /** Persists the current form into the open space; a no-op while locked. */
  save(): Promise<void>
  /** Whether a space is currently open (unlocked). */
  isUnlocked(): boolean
  /** The current space state, or `null` while locked (for other panels to read). */
  snapshot(): VaultState | null
  /** Merges a partial update into the open space and saves it; a no-op while locked. */
  patch(partial: Partial<VaultState>): Promise<void>
  /** The name of the open space, or `null` while locked (for the dashboard). */
  spaceName(): string | null
}

function byId<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null
}

/** Wires the space panel if present, else returns `null`. */
export function initVaultPanel(deps: VaultPanelDeps): VaultPanelHandle | null {
  const { doc, now, registry, makeStorage, genId, cryptoDeps } = deps
  const container = byId(doc, 'vault')
  if (container === null) return null

  const spaceSelect = byId<HTMLSelectElement>(doc, 'vault-space-select')
  const password = byId<HTMLInputElement>(doc, 'vault-password')
  const unlockBtn = byId<HTMLButtonElement>(doc, 'vault-unlock')
  const nameInput = byId<HTMLInputElement>(doc, 'vault-name')
  const newPass = byId<HTMLInputElement>(doc, 'vault-newpass')
  const createBtn = byId<HTMLButtonElement>(doc, 'vault-create')
  const lockBtn = byId<HTMLButtonElement>(doc, 'vault-lock')
  const switchBtn = byId<HTMLButtonElement>(doc, 'vault-switch')
  const existingBlock = byId(doc, 'vault-existing')
  const lockedSection = byId(doc, 'vault-locked')
  const unlockedSection = byId(doc, 'vault-unlocked')
  const currentName = byId(doc, 'vault-current-name')
  const msg = byId(doc, 'vault-msg')

  let vault: Vault | null = null
  let currentId: string | null = null

  const setMsg = (text: string): void => {
    if (msg !== null) msg.textContent = text
  }

  /** Populates the space picker from the registry; hides it when there are no spaces yet. */
  const renderSpaces = (): void => {
    const spaces = registry.list()
    if (spaceSelect !== null) {
      spaceSelect.textContent = ''
      for (const space of spaces) {
        const option = doc.createElement('option')
        option.value = space.id
        option.textContent = space.name // textContent → no HTML injection
        spaceSelect.appendChild(option)
      }
    }
    if (existingBlock !== null) existingBlock.hidden = spaces.length === 0
  }

  const showLocked = (): void => {
    if (lockedSection !== null) lockedSection.hidden = false
    if (unlockedSection !== null) unlockedSection.hidden = true
    renderSpaces()
  }

  const showUnlocked = (): void => {
    if (lockedSection !== null) lockedSection.hidden = true
    if (unlockedSection !== null) unlockedSection.hidden = false
    if (currentName !== null) {
      currentName.textContent = currentId !== null ? (registry.get(currentId)?.name ?? '') : ''
    }
  }

  /** Persists the current form into the open space (and stamps its updatedAt). */
  const persistForm = async (): Promise<void> => {
    if (vault === null || currentId === null) return
    const { activeProfile, profileInputs } = deps.readForm(doc)
    await vault.save({ ...vault.state, activeProfile, profileInputs }, now())
    registry.touch(currentId, now())
  }

  unlockBtn?.addEventListener('click', async () => {
    const id = spaceSelect?.value ?? ''
    if (id === '') {
      setMsg('Choisis un espace à déverrouiller.')
      return
    }
    const pw = password?.value ?? ''
    if (pw === '') {
      setMsg('Entre le mot de passe de cet espace.')
      return
    }
    try {
      vault = await Vault.open(makeStorage(id), pw, now(), cryptoDeps)
      currentId = id
      deps.applySnapshot(vault.state)
      if (password !== null) password.value = ''
      showUnlocked()
      setMsg(`Espace « ${registry.get(id)?.name ?? ''} » déverrouillé.`)
      deps.onOpened?.()
    } catch {
      setMsg('Mot de passe incorrect ou données illisibles.')
    }
  })

  createBtn?.addEventListener('click', async () => {
    const name = nameInput?.value.trim() ?? ''
    if (name === '') {
      setMsg('Donne un nom à ton espace (ex. « Perso », « Mon activité »).')
      return
    }
    const pw = newPass?.value ?? ''
    if (pw === '') {
      setMsg('Choisis un mot de passe pour protéger cet espace.')
      return
    }
    const id = genId()
    try {
      vault = await Vault.create(makeStorage(id), pw, now(), cryptoDeps)
      registry.add({ id, name, createdAt: now() })
      currentId = id
      await persistForm() // remember whatever is already typed in the form
      if (nameInput !== null) nameInput.value = ''
      if (newPass !== null) newPass.value = ''
      showUnlocked()
      setMsg(`Espace « ${name} » créé et chiffré sur cet appareil.`)
      deps.onOpened?.()
    } catch {
      setMsg("Impossible de créer l'espace.")
    }
  })

  const relock = (message: string): void => {
    vault = null
    currentId = null
    if (password !== null) password.value = ''
    if (newPass !== null) newPass.value = ''
    showLocked()
    setMsg(message)
  }

  lockBtn?.addEventListener('click', () => relock('Espace verrouillé.'))
  switchBtn?.addEventListener('click', () => relock('Choisis un espace.'))

  showLocked()
  setMsg(
    registry.isEmpty()
      ? 'Crée ton premier espace : donne-lui un nom et un mot de passe. Tes données seront chiffrées et resteront sur cet appareil.'
      : 'Choisis un espace et déverrouille-le, ou crée-en un nouveau.',
  )

  return {
    save: persistForm,
    isUnlocked: () => vault !== null,
    snapshot: () => (vault !== null ? vault.state : null),
    patch: async (partial) => {
      if (vault === null || currentId === null) return
      await vault.save({ ...vault.state, ...partial }, now())
      registry.touch(currentId, now())
    },
    spaceName: () => (currentId !== null ? (registry.get(currentId)?.name ?? null) : null),
  }
}
