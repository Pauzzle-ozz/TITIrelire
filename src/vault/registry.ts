/**
 * Registry of personal spaces.
 *
 * A "space" (espace) is a named, password-protected vault. Several can coexist on the same
 * device — one per person or per activity — so the registry keeps the **list of spaces**
 * (their id + name, non-secret) while each space's encrypted blob lives under its own storage
 * key. The name is what identifies a space in the UI; there is no server account (local-first).
 *
 * Only metadata is stored here in clear text (names, timestamps) — never a password or any
 * financial data, which stay inside each space's encrypted vault. The registry is pure over an
 * injected {@link WebStorageLike}, so it is fully unit-testable.
 */
import type { WebStorageLike } from './storage.js'

/** Non-secret metadata describing one space. */
export interface SpaceMeta {
  /** Stable unique id (used to derive the storage key). */
  id: string
  /** Human name that identifies the space (e.g. "Perso", "Mon activité"). */
  name: string
  /** ISO datetime the space was created. */
  createdAt: string
  /** ISO datetime of the last save into the space, when known. */
  updatedAt?: string
}

/** Storage key holding the registry index (the list of spaces). */
export const SPACES_KEY = 'titirelire.spaces.v1'

/** Derives the storage key for a space's encrypted vault blob. */
export function spaceStorageKey(id: string): string {
  return `titirelire.space.${id}.v1`
}

/** Validates one parsed registry entry, or returns null if malformed. */
function coerceMeta(value: unknown): SpaceMeta | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, name, createdAt, updatedAt } = value as Partial<SpaceMeta>
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || typeof createdAt !== 'string') {
    return null
  }
  return { id, name, createdAt, ...(typeof updatedAt === 'string' ? { updatedAt } : {}) }
}

/**
 * The list of spaces, persisted as a JSON array under {@link SPACES_KEY}. Reads validate and
 * drop malformed entries; writes replace the whole list (it is tiny).
 */
export class SpaceRegistry {
  private readonly store: WebStorageLike
  private readonly key: string

  constructor(store?: WebStorageLike, key: string = SPACES_KEY) {
    const resolved = store ?? (globalThis as { localStorage?: WebStorageLike }).localStorage
    if (resolved === undefined) {
      throw new Error('No localStorage available; pass a WebStorageLike explicitly')
    }
    this.store = resolved
    this.key = key
  }

  /** Returns all spaces (validated), in stored order. */
  list(): SpaceMeta[] {
    const raw = this.store.getItem(this.key)
    if (raw === null) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
    if (!Array.isArray(parsed)) return []
    return parsed.map(coerceMeta).filter((m): m is SpaceMeta => m !== null)
  }

  /** Returns one space by id, or undefined. */
  get(id: string): SpaceMeta | undefined {
    return this.list().find((s) => s.id === id)
  }

  /** Whether any space exists. */
  isEmpty(): boolean {
    return this.list().length === 0
  }

  private write(spaces: SpaceMeta[]): void {
    this.store.setItem(this.key, JSON.stringify(spaces))
  }

  /**
   * Adds a space. @throws if the id already exists (ids must be unique). Names may repeat —
   * two "Perso" spaces are allowed, since the id disambiguates them.
   */
  add(meta: SpaceMeta): void {
    const spaces = this.list()
    if (spaces.some((s) => s.id === meta.id)) {
      throw new Error(`A space with id ${meta.id} already exists`)
    }
    this.write([...spaces, meta])
  }

  /** Renames a space (no-op if the id is unknown). */
  rename(id: string, name: string): void {
    this.write(this.list().map((s) => (s.id === id ? { ...s, name } : s)))
  }

  /** Updates a space's `updatedAt` (no-op if the id is unknown). */
  touch(id: string, updatedAt: string): void {
    this.write(this.list().map((s) => (s.id === id ? { ...s, updatedAt } : s)))
  }

  /** Removes a space from the index (the caller clears its vault blob separately). */
  remove(id: string): void {
    this.write(this.list().filter((s) => s.id !== id))
  }
}
