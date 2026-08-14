import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STORAGE_KEY,
  MemoryVaultStorage,
  WebVaultStorage,
  type WebStorageLike,
} from '../src/vault/storage.js'

/** A tiny in-object localStorage stand-in. */
function fakeWebStorage(seed: Record<string, string> = {}): WebStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('MemoryVaultStorage', () => {
  it('returns null when empty', async () => {
    expect(await new MemoryVaultStorage().load()).toBeNull()
  })

  it('loads an initial blob if seeded', async () => {
    expect(await new MemoryVaultStorage('seed').load()).toBe('seed')
  })

  it('saves then loads the blob', async () => {
    const s = new MemoryVaultStorage()
    await s.save('blob-1')
    expect(await s.load()).toBe('blob-1')
  })

  it('overwrites on a second save', async () => {
    const s = new MemoryVaultStorage()
    await s.save('a')
    await s.save('b')
    expect(await s.load()).toBe('b')
  })

  it('clears back to null', async () => {
    const s = new MemoryVaultStorage('x')
    await s.clear()
    expect(await s.load()).toBeNull()
  })
})

describe('WebVaultStorage', () => {
  it('reads null when the key is absent', async () => {
    const s = new WebVaultStorage(fakeWebStorage())
    expect(await s.load()).toBeNull()
  })

  it('saves under the default key', async () => {
    const backing = fakeWebStorage()
    const s = new WebVaultStorage(backing)
    await s.save('blob')
    expect(backing.map.get(DEFAULT_STORAGE_KEY)).toBe('blob')
    expect(await s.load()).toBe('blob')
  })

  it('honors a custom key', async () => {
    const backing = fakeWebStorage()
    const s = new WebVaultStorage(backing, 'custom.key')
    await s.save('blob')
    expect(backing.map.get('custom.key')).toBe('blob')
    expect(backing.map.has(DEFAULT_STORAGE_KEY)).toBe(false)
  })

  it('clears only its own key', async () => {
    const backing = fakeWebStorage({ other: 'keep' })
    const s = new WebVaultStorage(backing)
    await s.save('blob')
    await s.clear()
    expect(await s.load()).toBeNull()
    expect(backing.map.get('other')).toBe('keep')
  })

  it('throws when no storage is available and none is injected', () => {
    const hadLocalStorage = 'localStorage' in globalThis
    // In the node test environment there is no global localStorage.
    if (!hadLocalStorage) {
      expect(() => new WebVaultStorage()).toThrow(/no localstorage/i)
    } else {
      expect(true).toBe(true)
    }
  })
})
