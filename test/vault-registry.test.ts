import { describe, expect, it } from 'vitest'

import { SpaceRegistry, spaceStorageKey, type SpaceMeta } from '../src/vault/registry.js'
import type { WebStorageLike } from '../src/vault/storage.js'

function fakeStore(seed: Record<string, string> = {}): WebStorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

const meta = (over: Partial<SpaceMeta> = {}): SpaceMeta => ({
  id: 'a',
  name: 'Perso',
  createdAt: '2026-08-14T10:00:00.000Z',
  ...over,
})

describe('spaceStorageKey', () => {
  it('derives a unique per-space key', () => {
    expect(spaceStorageKey('abc')).toBe('titirelire.space.abc.v1')
    expect(spaceStorageKey('abc')).not.toBe(spaceStorageKey('def'))
  })
})

describe('SpaceRegistry', () => {
  it('starts empty', () => {
    const reg = new SpaceRegistry(fakeStore())
    expect(reg.list()).toEqual([])
    expect(reg.isEmpty()).toBe(true)
  })

  it('adds and lists spaces in order', () => {
    const reg = new SpaceRegistry(fakeStore())
    reg.add(meta({ id: 'a', name: 'Perso' }))
    reg.add(meta({ id: 'b', name: 'Activité' }))
    expect(reg.list().map((s) => s.name)).toEqual(['Perso', 'Activité'])
    expect(reg.isEmpty()).toBe(false)
  })

  it('gets a space by id', () => {
    const reg = new SpaceRegistry(fakeStore())
    reg.add(meta({ id: 'a' }))
    expect(reg.get('a')?.name).toBe('Perso')
    expect(reg.get('nope')).toBeUndefined()
  })

  it('rejects a duplicate id but allows duplicate names', () => {
    const reg = new SpaceRegistry(fakeStore())
    reg.add(meta({ id: 'a', name: 'Perso' }))
    expect(() => reg.add(meta({ id: 'a', name: 'Autre' }))).toThrow(/already exists/i)
    reg.add(meta({ id: 'b', name: 'Perso' })) // same name, different id → OK
    expect(reg.list()).toHaveLength(2)
  })

  it('renames, touches and removes', () => {
    const reg = new SpaceRegistry(fakeStore())
    reg.add(meta({ id: 'a', name: 'Perso' }))
    reg.rename('a', 'Perso 2')
    expect(reg.get('a')?.name).toBe('Perso 2')
    reg.touch('a', '2026-09-01T00:00:00.000Z')
    expect(reg.get('a')?.updatedAt).toBe('2026-09-01T00:00:00.000Z')
    reg.remove('a')
    expect(reg.list()).toEqual([])
  })

  it('persists through the backing store (survives a new instance)', () => {
    const store = fakeStore()
    new SpaceRegistry(store).add(meta({ id: 'a' }))
    expect(new SpaceRegistry(store).get('a')?.name).toBe('Perso')
  })

  it('ignores malformed / non-array registry content', () => {
    expect(new SpaceRegistry(fakeStore({ 'titirelire.spaces.v1': 'not json' })).list()).toEqual([])
    expect(new SpaceRegistry(fakeStore({ 'titirelire.spaces.v1': '{"x":1}' })).list()).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    const store = fakeStore({
      'titirelire.spaces.v1': JSON.stringify([
        { id: 'a', name: 'Ok', createdAt: '2026-08-14T10:00:00.000Z' },
        { id: '', name: 'bad' },
        { name: 'no-id', createdAt: 'x' },
      ]),
    })
    expect(new SpaceRegistry(store).list().map((s) => s.id)).toEqual(['a'])
  })
})
