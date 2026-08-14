/**
 * Storage port for the encrypted vault blob (the "adapter" seam).
 *
 * The vault is a single opaque string (a {@link ../vault/crypto.js Envelope}); this port
 * only needs to load it, save it, and clear it. Keeping the surface this small means the
 * browser adapter and any future one (IndexedDB for larger volumes, a Tauri filesystem /
 * OS-keychain store for the desktop app) are trivial swaps behind the same interface — the
 * orchestration in {@link ./vault.ts} never changes.
 *
 * The port is intentionally **synchronous-friendly but async-typed**: `localStorage` is
 * sync, IndexedDB and native stores are async, so returning promises keeps every adapter
 * uniform.
 */

/** Loads/saves/clears the single encrypted vault blob. */
export interface VaultStorage {
  /** Returns the stored blob, or `null` if no vault has been created yet. */
  load(): Promise<string | null>
  /** Persists (overwrites) the blob. */
  save(blob: string): Promise<void>
  /** Removes the vault entirely (e.g. "forget my data" / reset). */
  clear(): Promise<void>
}

/** In-memory adapter — the reference implementation, used by tests and ephemeral runs. */
export class MemoryVaultStorage implements VaultStorage {
  private blob: string | null

  constructor(initial: string | null = null) {
    this.blob = initial
  }

  load(): Promise<string | null> {
    return Promise.resolve(this.blob)
  }

  save(blob: string): Promise<void> {
    this.blob = blob
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.blob = null
    return Promise.resolve()
  }
}

/** The minimal `localStorage`-like surface the browser adapter depends on (injectable). */
export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Default storage key under which the encrypted blob is kept. */
export const DEFAULT_STORAGE_KEY = 'titirelire.vault.v1'

/**
 * Browser adapter backed by `localStorage` (or any {@link WebStorageLike}).
 *
 * The blob is already encrypted, so a single key holds the whole vault. For very large
 * transaction histories an IndexedDB adapter can replace this behind {@link VaultStorage}
 * without touching the rest of the app.
 */
export class WebVaultStorage implements VaultStorage {
  private readonly store: WebStorageLike
  private readonly key: string

  /**
   * @param store  The backing storage; defaults to the global `localStorage`.
   * @param key    The storage key; defaults to {@link DEFAULT_STORAGE_KEY}.
   * @throws Error if no storage is provided and none is available globally.
   */
  constructor(store?: WebStorageLike, key: string = DEFAULT_STORAGE_KEY) {
    const resolved = store ?? (globalThis as { localStorage?: WebStorageLike }).localStorage
    if (resolved === undefined) {
      throw new Error('No localStorage available; pass a WebStorageLike explicitly')
    }
    this.store = resolved
    this.key = key
  }

  load(): Promise<string | null> {
    return Promise.resolve(this.store.getItem(this.key))
  }

  save(blob: string): Promise<void> {
    this.store.setItem(this.key, blob)
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.store.removeItem(this.key)
    return Promise.resolve()
  }
}
