/**
 * Vault orchestration — the one entry point the app uses for the personal space.
 *
 * It ties the three lower layers together:
 *   {@link ./storage.js storage}  ← where the encrypted blob lives
 *   {@link ./crypto.js  crypto}   ← how it is encrypted with the master password
 *   {@link ./types.js   types}    ← the plaintext shape that is remembered
 *
 * An open {@link Vault} keeps the master password in memory for the session so the UI can
 * autosave without re-prompting. Time is injected (`now` ISO strings) to stay deterministic
 * and testable — never read from a hidden clock.
 *
 * On load, whatever is decrypted is passed through {@link migrate}, which coerces it to the
 * current {@link SCHEMA_VERSION}: missing/invalid fields fall back to safe defaults (so a
 * partially-written or hand-edited vault still opens) while a *newer* schema is refused
 * rather than silently downgraded.
 */
import { decryptString, encryptString, type CryptoDeps } from './crypto.js'
import type { VaultStorage } from './storage.js'
import {
  emptyVaultState,
  isVaultProfile,
  SCHEMA_VERSION,
  type ProfileInputs,
  type VaultProfile,
  type VaultState,
} from './types.js'
import { normalizeTransaction } from '../transactions/normalize.js'
import type { Transaction } from '../transactions/types.js'

/** Keeps only well-formed per-profile input records, dropping unknown keys/values. */
function coerceProfileInputs(value: unknown): ProfileInputs {
  if (typeof value !== 'object' || value === null) return {}
  const out: ProfileInputs = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isVaultProfile(key) && typeof val === 'object' && val !== null) {
      out[key as VaultProfile] = { ...(val as Record<string, unknown>) }
    }
  }
  return out
}

/** Re-normalizes stored transactions, dropping any that no longer validate, de-duped by id. */
function coerceTransactions(value: unknown): Transaction[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: Transaction[] = []
  for (const item of value) {
    try {
      const tx = normalizeTransaction(item as Parameters<typeof normalizeTransaction>[0])
      if (seen.has(tx.id)) continue
      seen.add(tx.id)
      out.push(tx)
    } catch {
      // Skip corrupted records rather than failing the whole vault.
    }
  }
  return out
}

/**
 * Coerces an arbitrary decrypted value into a valid {@link VaultState} at the current
 * schema version. Future schema versions are refused.
 *
 * When {@link SCHEMA_VERSION} is bumped, add field-level transforms here keyed by the old
 * `schemaVersion` before the final coercion.
 *
 * @throws Error if the stored schema version is newer than this build supports.
 */
export function migrate(parsed: unknown, now: string): VaultState {
  const o = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  const version = typeof o.schemaVersion === 'number' ? o.schemaVersion : 0
  if (version > SCHEMA_VERSION) {
    throw new Error(`Vault schema v${version} is newer than supported v${SCHEMA_VERSION}`)
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProfile: isVaultProfile(o.activeProfile) ? o.activeProfile : 'micro',
    profileInputs: coerceProfileInputs(o.profileInputs),
    transactions: coerceTransactions(o.transactions),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
  }
}

/** An open personal space: decrypted state + the session password used to re-save. */
export class Vault {
  private constructor(
    private readonly storage: VaultStorage,
    private readonly password: string,
    private readonly deps: CryptoDeps | undefined,
    private current: VaultState,
  ) {}

  /** Whether a vault has already been created in this storage. */
  static async exists(storage: VaultStorage): Promise<boolean> {
    return (await storage.load()) !== null
  }

  /**
   * Creates a brand-new, empty vault and persists it.
   * @throws Error if a vault already exists (use {@link Vault.open} instead).
   */
  static async create(
    storage: VaultStorage,
    password: string,
    now: string,
    deps?: CryptoDeps,
  ): Promise<Vault> {
    if (await Vault.exists(storage)) {
      throw new Error('A vault already exists in this storage')
    }
    const state = emptyVaultState(now)
    const vault = new Vault(storage, password, deps, state)
    await vault.persist()
    return vault
  }

  /**
   * Opens and decrypts the existing vault, migrating it to the current schema.
   * @throws Error if no vault exists, or if the password is wrong / the blob is corrupted.
   */
  static async open(
    storage: VaultStorage,
    password: string,
    now: string,
    deps?: CryptoDeps,
  ): Promise<Vault> {
    const blob = await storage.load()
    if (blob === null) throw new Error('No vault exists in this storage')
    const plaintext = await decryptString(blob, password, deps)
    let parsed: unknown
    try {
      parsed = JSON.parse(plaintext)
    } catch {
      throw new Error('Vault content is not valid JSON')
    }
    return new Vault(storage, password, deps, migrate(parsed, now))
  }

  /** The current in-memory state (a deep copy, so callers cannot mutate it in place). */
  get state(): VaultState {
    return structuredClone(this.current)
  }

  /** Replaces the state, stamps `updatedAt`, and persists it encrypted. */
  async save(next: VaultState, now: string): Promise<void> {
    this.current = { ...structuredClone(next), schemaVersion: SCHEMA_VERSION, updatedAt: now }
    await this.persist()
  }

  /** Wipes the vault from storage (forget-my-data). The in-memory copy is untouched. */
  async clear(): Promise<void> {
    await this.storage.clear()
  }

  private async persist(): Promise<void> {
    const blob = await encryptString(JSON.stringify(this.current), this.password, this.deps)
    await this.storage.save(blob)
  }
}
