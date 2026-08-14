import { describe, expect, it } from 'vitest'

import { encryptString } from '../src/vault/crypto.js'
import { MemoryVaultStorage } from '../src/vault/storage.js'
import { SCHEMA_VERSION, type VaultState } from '../src/vault/types.js'
import { migrate, Vault } from '../src/vault/vault.js'

const PW = 'master-pass-1234'
const NOW = '2026-08-14T12:00:00.000Z'
const LATER = '2026-08-14T13:30:00.000Z'

const sampleTx = {
  id: 'tx-1',
  date: '2026-03-04',
  amount: 1200,
  currency: 'EUR',
  label: 'Facture 12',
  source: 'stripe',
}

describe('Vault.create / open round-trip', () => {
  it('creates an empty vault and persists it', async () => {
    const storage = new MemoryVaultStorage()
    const vault = await Vault.create(storage, PW, NOW)
    expect(vault.state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(vault.state.transactions).toEqual([])
    expect(await storage.load()).not.toBeNull()
  })

  it('refuses to create over an existing vault', async () => {
    const storage = new MemoryVaultStorage()
    await Vault.create(storage, PW, NOW)
    await expect(Vault.create(storage, PW, NOW)).rejects.toThrow(/already exists/i)
  })

  it('saves state and reopens it with the same password', async () => {
    const storage = new MemoryVaultStorage()
    const vault = await Vault.create(storage, PW, NOW)
    const next: VaultState = {
      ...vault.state,
      activeProfile: 'particulier',
      profileInputs: { micro: { revenue: 40000, parts: 1 } },
      transactions: [sampleTx],
    }
    await vault.save(next, LATER)

    const reopened = await Vault.open(storage, PW, NOW)
    expect(reopened.state.activeProfile).toBe('particulier')
    expect(reopened.state.profileInputs.micro).toEqual({ revenue: 40000, parts: 1 })
    expect(reopened.state.transactions).toHaveLength(1)
    expect(reopened.state.transactions[0]?.id).toBe('tx-1')
    expect(reopened.state.updatedAt).toBe(LATER)
  })

  it('stamps updatedAt and schemaVersion on save regardless of caller input', async () => {
    const storage = new MemoryVaultStorage()
    const vault = await Vault.create(storage, PW, NOW)
    await vault.save({ ...vault.state, schemaVersion: 999, updatedAt: 'garbage' }, LATER)
    expect(vault.state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(vault.state.updatedAt).toBe(LATER)
  })
})

describe('Vault error paths', () => {
  it('open fails when no vault exists', async () => {
    await expect(Vault.open(new MemoryVaultStorage(), PW, NOW)).rejects.toThrow(/no vault/i)
  })

  it('open fails with the wrong password', async () => {
    const storage = new MemoryVaultStorage()
    await Vault.create(storage, PW, NOW)
    await expect(Vault.open(storage, 'wrong', NOW)).rejects.toThrow(/invalid master password/i)
  })

  it('exists reflects storage state', async () => {
    const storage = new MemoryVaultStorage()
    expect(await Vault.exists(storage)).toBe(false)
    await Vault.create(storage, PW, NOW)
    expect(await Vault.exists(storage)).toBe(true)
  })

  it('clear removes the vault from storage', async () => {
    const storage = new MemoryVaultStorage()
    const vault = await Vault.create(storage, PW, NOW)
    await vault.clear()
    expect(await storage.load()).toBeNull()
    expect(await Vault.exists(storage)).toBe(false)
  })
})

describe('state immutability', () => {
  it('the getter returns a copy that cannot mutate the vault', async () => {
    const vault = await Vault.create(new MemoryVaultStorage(), PW, NOW)
    const snapshot = vault.state
    snapshot.transactions.push(sampleTx)
    snapshot.activeProfile = 'societe'
    expect(vault.state.transactions).toEqual([])
    expect(vault.state.activeProfile).toBe('micro')
  })
})

describe('migrate', () => {
  it('coerces an empty/garbage object to a fresh state', () => {
    const state = migrate(null, NOW)
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.activeProfile).toBe('micro')
    expect(state.transactions).toEqual([])
    expect(state.updatedAt).toBe(NOW)
  })

  it('keeps valid fields and defaults invalid ones', () => {
    const state = migrate(
      {
        schemaVersion: 1,
        activeProfile: 'not-a-profile',
        profileInputs: { micro: { revenue: 10 }, bogus: { x: 1 }, societe: 'nope' },
        transactions: 'not-an-array',
        updatedAt: 42,
      },
      NOW,
    )
    expect(state.activeProfile).toBe('micro') // invalid → default
    expect(state.profileInputs).toEqual({ micro: { revenue: 10 } }) // bogus keys/values dropped
    expect(state.transactions).toEqual([]) // invalid → empty
    expect(state.updatedAt).toBe(NOW) // non-string → injected now
  })

  it('drops corrupted transactions but keeps valid ones (de-duped)', () => {
    const state = migrate(
      {
        schemaVersion: 1,
        transactions: [
          sampleTx,
          { id: 'tx-1', date: '2026-03-05', amount: 5, currency: 'EUR', source: 'x' }, // dup id
          { id: '', date: 'bad' }, // invalid → dropped
          { id: 'tx-2', date: '2026-04-01', amount: -50, currency: 'EUR', source: 'x' },
        ],
      },
      NOW,
    )
    expect(state.transactions.map((t) => t.id)).toEqual(['tx-1', 'tx-2'])
  })

  it('refuses a schema version newer than supported', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }, NOW)).toThrow(/newer than supported/i)
  })

  it('open surfaces the future-schema refusal', async () => {
    const storage = new MemoryVaultStorage()
    const blob = await encryptString(JSON.stringify({ schemaVersion: 99 }), PW)
    await storage.save(blob)
    await expect(Vault.open(storage, PW, NOW)).rejects.toThrow(/newer than supported/i)
  })
})
