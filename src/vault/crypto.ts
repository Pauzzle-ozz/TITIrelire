/**
 * Authenticated encryption for the vault blob.
 *
 * The whole vault is serialized to JSON and encrypted as a single string with
 * **AES-256-GCM**, using a key derived from the user's master password via
 * **PBKDF2-SHA256**. GCM is authenticated, so a wrong password or a tampered blob fails to
 * decrypt rather than returning garbage.
 *
 * Nothing secret is stored: only the ciphertext, a random per-vault salt (for the KDF) and
 * a random per-encryption IV travel inside the {@link Envelope}. The master password is
 * never persisted — losing it means the data is unrecoverable, which is the point.
 *
 * `SubtleCrypto` and the RNG are **injected** ({@link CryptoDeps}) so every path is unit
 * testable offline; the default binds to the platform WebCrypto (available in the browser,
 * in Node ≥ 20, and in happy-dom for tests).
 */

/** The crypto primitives the module needs, injected for testability. */
export interface CryptoDeps {
  subtle: SubtleCrypto
  getRandomValues: Crypto['getRandomValues']
}

/** Binds {@link CryptoDeps} to the platform WebCrypto, or throws if unavailable. */
export function defaultCryptoDeps(): CryptoDeps {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c === undefined || typeof c.subtle?.encrypt !== 'function') {
    throw new Error('WebCrypto (crypto.subtle) is not available in this environment')
  }
  return { subtle: c.subtle, getRandomValues: c.getRandomValues.bind(c) }
}

/** KDF work factor. PBKDF2-SHA256 iterations — high enough to slow brute force in 2026. */
export const KDF_ITERATIONS = 210_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256
/** Envelope format version — lets us evolve the KDF/cipher later without ambiguity. */
export const ENVELOPE_VERSION = 1

/** The serialized, self-describing encrypted container (all binary fields base64). */
export interface Envelope {
  /** Envelope format version. */
  v: number
  /** Key-derivation function identifier. */
  kdf: 'PBKDF2-SHA256'
  /** PBKDF2 iteration count actually used (so old blobs still decrypt after we raise it). */
  iter: number
  /** Base64 KDF salt. */
  salt: string
  /** Base64 AES-GCM initialization vector. */
  iv: string
  /** Base64 ciphertext (includes the GCM auth tag). */
  ct: string
}

// ── base64 (dependency-free, environment-independent) ─────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const len = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i] as string)
    const c1 = B64.indexOf(clean[i + 1] as string)
    const c2 = clean[i + 2] !== undefined ? B64.indexOf(clean[i + 2] as string) : -1
    const c3 = clean[i + 3] !== undefined ? B64.indexOf(clean[i + 3] as string) : -1
    if (p < len) out[p++] = (c0 << 2) | (c1 >> 4)
    if (c2 >= 0 && p < len) out[p++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (c3 >= 0 && p < len) out[p++] = ((c2 & 3) << 6) | c3
  }
  return out
}

/** Derives the AES-GCM key from a password + salt via PBKDF2. */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  subtle: SubtleCrypto,
): Promise<CryptoKey> {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypts a UTF-8 string, returning a serialized {@link Envelope} (JSON text).
 *
 * @throws Error if the password is empty (a vault must have a real master password).
 */
export async function encryptString(
  plaintext: string,
  password: string,
  deps: CryptoDeps = defaultCryptoDeps(),
): Promise<string> {
  if (password === '') throw new Error('A non-empty master password is required')
  const salt = deps.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = deps.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, KDF_ITERATIONS, deps.subtle)
  const ct = await deps.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA256',
    iter: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  }
  return JSON.stringify(envelope)
}

/** Runtime validation that a parsed blob is a well-formed {@link Envelope}. */
function parseEnvelope(blob: string): Envelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch {
    throw new Error('Vault blob is not valid JSON')
  }
  const e = parsed as Partial<Envelope>
  if (
    typeof e.v !== 'number' ||
    e.kdf !== 'PBKDF2-SHA256' ||
    typeof e.iter !== 'number' ||
    typeof e.salt !== 'string' ||
    typeof e.iv !== 'string' ||
    typeof e.ct !== 'string'
  ) {
    throw new Error('Vault blob is not a recognized encrypted envelope')
  }
  if (e.v > ENVELOPE_VERSION) {
    throw new Error(`Vault was written by a newer version (envelope v${e.v})`)
  }
  return e as Envelope
}

/**
 * Decrypts a serialized {@link Envelope} back to the original string.
 *
 * @throws Error with a clear message if the password is wrong or the blob is corrupted
 * (AES-GCM authentication failure is surfaced as an invalid-password error).
 */
export async function decryptString(
  blob: string,
  password: string,
  deps: CryptoDeps = defaultCryptoDeps(),
): Promise<string> {
  const envelope = parseEnvelope(blob)
  const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iter, deps.subtle)
  let plain: ArrayBuffer
  try {
    plain = await deps.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) as unknown as BufferSource },
      key,
      fromBase64(envelope.ct) as unknown as BufferSource,
    )
  } catch {
    throw new Error('Invalid master password or corrupted vault')
  }
  return new TextDecoder().decode(plain)
}

/** Convenience: encrypt any JSON-serializable value. */
export async function encryptJson(
  value: unknown,
  password: string,
  deps: CryptoDeps = defaultCryptoDeps(),
): Promise<string> {
  return encryptString(JSON.stringify(value), password, deps)
}

/** Convenience: decrypt and JSON-parse. @throws on wrong password or malformed content. */
export async function decryptJson(
  blob: string,
  password: string,
  deps: CryptoDeps = defaultCryptoDeps(),
): Promise<unknown> {
  return JSON.parse(await decryptString(blob, password, deps))
}
