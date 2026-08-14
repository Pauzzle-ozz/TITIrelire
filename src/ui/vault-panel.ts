/**
 * The personal-space panel: unlock / create / lock, plus autosave into the encrypted vault.
 *
 * This is the DOM controller that turns the {@link ../vault/vault.js Vault} into a UI. It is
 * **entirely opt-in**: if the host page has no `#vault` container the panel does nothing and
 * returns `null`, so the simulator keeps working exactly as before (and the existing UI
 * tests, which render no vault DOM, are unaffected).
 *
 * It never imports the connectors or the barrel, keeping the browser/secret boundary intact
 * (enforced by test/boundaries.test.ts).
 */
import type { CryptoDeps } from '../vault/crypto.js'
import type { VaultStorage } from '../vault/storage.js'
import type { ProfileInputs, VaultProfile, VaultState } from '../vault/types.js'
import { Vault } from '../vault/vault.js'

/** What the panel needs from its host, all injected for testability. */
export interface VaultPanelDeps {
  doc: Document
  storage: VaultStorage
  /** Returns the current time as an ISO string (injected — no hidden clock). */
  now: () => string
  /** Reads the live form into vault shape (from ./form-state). */
  readForm: (doc: Document) => { activeProfile: VaultProfile; profileInputs: ProfileInputs }
  /** Prefills the form from a snapshot and recomputes the result (host-provided). */
  applySnapshot: (state: VaultState) => void
  /** Called once the vault is open (after create or unlock), e.g. to refresh other panels. */
  onOpened?: () => void
  /** Optional WebCrypto override (defaults to the platform's). */
  cryptoDeps?: CryptoDeps
}

/** Handle returned to the host so it can autosave and share the open vault's state. */
export interface VaultPanelHandle {
  /** Persists the current form into the vault; a no-op while locked. */
  save(): Promise<void>
  /** Whether a vault is currently open (unlocked). */
  isUnlocked(): boolean
  /** The current vault state, or `null` while locked (for other panels to read). */
  snapshot(): VaultState | null
  /** Merges a partial update into the vault and saves it; a no-op while locked. */
  patch(partial: Partial<VaultState>): Promise<void>
}

function byId<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null
}

/**
 * Wires the vault panel if present. Returns a {@link VaultPanelHandle}, or `null` when there
 * is no `#vault` container (the simulator then runs stateless, as before).
 */
export async function initVaultPanel(deps: VaultPanelDeps): Promise<VaultPanelHandle | null> {
  const { doc, storage, now, cryptoDeps } = deps
  const container = byId(doc, 'vault')
  if (container === null) return null

  const password = byId<HTMLInputElement>(doc, 'vault-password')
  const unlockBtn = byId<HTMLButtonElement>(doc, 'vault-unlock')
  const createBtn = byId<HTMLButtonElement>(doc, 'vault-create')
  const lockBtn = byId<HTMLButtonElement>(doc, 'vault-lock')
  const lockedSection = byId(doc, 'vault-locked')
  const unlockedSection = byId(doc, 'vault-unlocked')
  const msg = byId(doc, 'vault-msg')

  let vault: Vault | null = null
  let hasVault = (await storage.load()) !== null

  const setMsg = (text: string): void => {
    if (msg !== null) msg.textContent = text
  }

  /** Shows the locked view, offering unlock (existing vault) or create (new one). */
  const showLocked = (): void => {
    if (lockedSection !== null) lockedSection.hidden = false
    if (unlockedSection !== null) unlockedSection.hidden = true
    if (unlockBtn !== null) unlockBtn.hidden = !hasVault
    if (createBtn !== null) createBtn.hidden = hasVault
  }

  const showUnlocked = (): void => {
    if (lockedSection !== null) lockedSection.hidden = true
    if (unlockedSection !== null) unlockedSection.hidden = false
  }

  /** Persists the current form (merged over the open vault's transactions). */
  const persistForm = async (): Promise<void> => {
    if (vault === null) return
    const { activeProfile, profileInputs } = deps.readForm(doc)
    await vault.save({ ...vault.state, activeProfile, profileInputs }, now())
  }

  const clearPassword = (): void => {
    if (password !== null) password.value = ''
  }

  unlockBtn?.addEventListener('click', async () => {
    const pw = password?.value ?? ''
    if (pw === '') {
      setMsg('Entre ton mot de passe.')
      return
    }
    try {
      vault = await Vault.open(storage, pw, now(), cryptoDeps)
      deps.applySnapshot(vault.state)
      clearPassword()
      showUnlocked()
      setMsg('Espace déverrouillé.')
      deps.onOpened?.()
    } catch {
      setMsg('Mot de passe incorrect ou données illisibles.')
    }
  })

  createBtn?.addEventListener('click', async () => {
    const pw = password?.value ?? ''
    if (pw === '') {
      setMsg('Choisis un mot de passe pour protéger ton espace.')
      return
    }
    try {
      vault = await Vault.create(storage, pw, now(), cryptoDeps)
      hasVault = true
      await persistForm() // remember whatever is already typed in the form
      clearPassword()
      showUnlocked()
      setMsg('Espace créé et chiffré sur cet appareil.')
      deps.onOpened?.()
    } catch {
      setMsg('Impossible de créer l’espace (un espace existe peut-être déjà).')
    }
  })

  lockBtn?.addEventListener('click', () => {
    vault = null
    clearPassword()
    showLocked()
    setMsg('Espace verrouillé.')
  })

  showLocked()
  setMsg(
    hasVault
      ? 'Un espace chiffré existe sur cet appareil. Déverrouille-le pour retrouver tes données.'
      : 'Crée ton espace : tes données seront chiffrées et ne quitteront pas cet appareil.',
  )

  return {
    save: persistForm,
    isUnlocked: () => vault !== null,
    snapshot: () => (vault !== null ? vault.state : null),
    patch: async (partial) => {
      if (vault === null) return
      await vault.save({ ...vault.state, ...partial }, now())
    },
  }
}
