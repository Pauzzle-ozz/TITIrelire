import { describe, expect, it } from 'vitest'

import {
  decryptJson,
  decryptString,
  defaultCryptoDeps,
  encryptJson,
  encryptString,
  ENVELOPE_VERSION,
  type Envelope,
} from '../src/vault/crypto.js'

const PW = 'correct horse battery staple'

describe('encryptString / decryptString', () => {
  it('round-trips arbitrary UTF-8 text', async () => {
    const text = 'Facture n°12 — 1 234,56 € 🐇 日本語'
    const blob = await encryptString(text, PW)
    expect(await decryptString(blob, PW)).toBe(text)
  })

  it('round-trips the empty string (empty payload, not empty password)', async () => {
    const blob = await encryptString('', PW)
    expect(await decryptString(blob, PW)).toBe('')
  })

  it('produces a well-formed, versioned envelope', async () => {
    const blob = await encryptString('hello', PW)
    const env = JSON.parse(blob) as Envelope
    expect(env.v).toBe(ENVELOPE_VERSION)
    expect(env.kdf).toBe('PBKDF2-SHA256')
    expect(env.iter).toBeGreaterThan(100_000)
    expect(typeof env.salt).toBe('string')
    expect(typeof env.iv).toBe('string')
    expect(typeof env.ct).toBe('string')
  })

  it('uses a fresh salt and IV each time (no reuse)', async () => {
    const a = JSON.parse(await encryptString('same', PW)) as Envelope
    const b = JSON.parse(await encryptString('same', PW)) as Envelope
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct) // different IV → different ciphertext
  })

  it('rejects an empty master password on encrypt', async () => {
    await expect(encryptString('secret', '')).rejects.toThrow(/master password/i)
  })

  it('fails to decrypt with the wrong password', async () => {
    const blob = await encryptString('secret', PW)
    await expect(decryptString(blob, 'wrong password')).rejects.toThrow(/invalid master password/i)
  })

  it('fails to decrypt a tampered ciphertext (GCM authentication)', async () => {
    const env = JSON.parse(await encryptString('secret', PW)) as Envelope
    // Flip a character in the ciphertext.
    const tampered = { ...env, ct: (env.ct[0] === 'A' ? 'B' : 'A') + env.ct.slice(1) }
    await expect(decryptString(JSON.stringify(tampered), PW)).rejects.toThrow(/corrupted|invalid/i)
  })

  it('rejects non-JSON blobs', async () => {
    await expect(decryptString('not json', PW)).rejects.toThrow(/not valid json/i)
  })

  it('rejects blobs that are JSON but not an envelope', async () => {
    await expect(decryptString('{"foo":1}', PW)).rejects.toThrow(/recognized encrypted envelope/i)
  })

  it('refuses to decrypt an envelope from a newer format version', async () => {
    const env = JSON.parse(await encryptString('secret', PW)) as Envelope
    const future = { ...env, v: ENVELOPE_VERSION + 1 }
    await expect(decryptString(JSON.stringify(future), PW)).rejects.toThrow(/newer version/i)
  })
})

describe('encryptJson / decryptJson', () => {
  it('round-trips a structured value', async () => {
    const value = { a: 1, b: [true, 'x', null], c: { nested: 3.14 } }
    const blob = await encryptJson(value, PW)
    expect(await decryptJson(blob, PW)).toEqual(value)
  })
})

describe('defaultCryptoDeps', () => {
  it('binds to the platform WebCrypto', () => {
    const deps = defaultCryptoDeps()
    expect(typeof deps.subtle.encrypt).toBe('function')
    const filled = deps.getRandomValues(new Uint8Array(8))
    expect(filled).toHaveLength(8)
  })
})
