import { describe, expect, it } from 'vitest'

import {
  emptyVaultState,
  isVaultProfile,
  SCHEMA_VERSION,
  type VaultState,
} from '../src/vault/types.js'

describe('emptyVaultState', () => {
  it('creates a state at the current schema version', () => {
    const state = emptyVaultState('2026-08-14T10:00:00.000Z')
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.activeProfile).toBe('micro')
    expect(state.profileInputs).toEqual({})
    expect(state.transactions).toEqual([])
    expect(state.updatedAt).toBe('2026-08-14T10:00:00.000Z')
  })

  it('takes the timestamp from the caller (no hidden clock)', () => {
    expect(emptyVaultState('2020-01-01T00:00:00.000Z').updatedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('is pure JSON (round-trips through stringify/parse unchanged)', () => {
    const state = emptyVaultState('2026-08-14T10:00:00.000Z')
    const restored = JSON.parse(JSON.stringify(state)) as VaultState
    expect(restored).toEqual(state)
  })

  it('returns independent objects (no shared mutable references)', () => {
    const a = emptyVaultState('2026-08-14T10:00:00.000Z')
    const b = emptyVaultState('2026-08-14T10:00:00.000Z')
    a.transactions.push({
      id: '1',
      date: '2026-01-01',
      amount: 10,
      currency: 'EUR',
      label: 'x',
      source: 'test',
    })
    expect(b.transactions).toEqual([])
  })
})

describe('isVaultProfile', () => {
  it('accepts the three known profiles', () => {
    expect(isVaultProfile('micro')).toBe(true)
    expect(isVaultProfile('particulier')).toBe(true)
    expect(isVaultProfile('societe')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const bad of ['', 'MICRO', 'unknown', 42, null, undefined, {}]) {
      expect(isVaultProfile(bad)).toBe(false)
    }
  })
})
