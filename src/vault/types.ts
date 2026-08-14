/**
 * The persisted "vault" state — everything the user's personal space remembers so they
 * never re-enter their data or re-import their transactions.
 *
 * The vault is stored as a single encrypted blob (see {@link ./crypto.ts}). This file
 * defines the *plaintext* shape that is serialized, encrypted and later restored. It is
 * deliberately additive: new bricks (pro/perso classification, advice) will extend this
 * shape, so a {@link SCHEMA_VERSION} + migration path is in place from day one.
 *
 * Design notes:
 * - Everything here is plain JSON (no classes, no functions) so it round-trips through
 *   `JSON.stringify`/`parse` and through encryption without surprises.
 * - Fiscal inputs are kept as an opaque, per-profile record: the vault does not need to
 *   know the engine's input types, only to hand them back to the UI to prefill the form.
 *   This keeps the vault decoupled from the fiscal engine (same "ports" discipline as the
 *   data-connection layer).
 */
import type { Transaction } from '../transactions/types.js'

/**
 * Current on-disk schema version. Bump this whenever {@link VaultState} changes shape in a
 * way that needs a migration, and add a step to `migrate()` (see {@link ./vault.ts}).
 */
export const SCHEMA_VERSION = 1 as const

/** The fiscal profiles the personal space can remember inputs for. */
export type VaultProfile = 'micro' | 'particulier' | 'societe'

/**
 * Saved form inputs, one opaque record per profile. Values mirror the UI form fields
 * (numbers, booleans, strings); the vault stores and returns them verbatim and never
 * interprets them — the UI and the engine own their meaning.
 */
export type ProfileInputs = Partial<Record<VaultProfile, Record<string, unknown>>>

/** The full plaintext state held in a user's vault. */
export interface VaultState {
  /** Schema version this state was written with (used to migrate on load). */
  schemaVersion: number
  /** Which profile the user last had selected, so the UI reopens on it. */
  activeProfile: VaultProfile
  /** Remembered form inputs per profile — the "no re-typing" promise. */
  profileInputs: ProfileInputs
  /** Imported/normalized transactions the personal space keeps across sessions. */
  transactions: Transaction[]
  /** ISO datetime of the last save, for display and conflict/debug purposes. */
  updatedAt: string
}

/**
 * A fresh, empty vault at the current schema version. `updatedAt` is injected (rather than
 * read from the clock) so callers stay deterministic and testable.
 */
export function emptyVaultState(updatedAt: string): VaultState {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProfile: 'micro',
    profileInputs: {},
    transactions: [],
    updatedAt,
  }
}

/** The set of valid profile identifiers, for runtime validation. */
const PROFILES: readonly VaultProfile[] = ['micro', 'particulier', 'societe']

/** Narrowing guard for {@link VaultProfile}. */
export function isVaultProfile(value: unknown): value is VaultProfile {
  return typeof value === 'string' && (PROFILES as readonly string[]).includes(value)
}
