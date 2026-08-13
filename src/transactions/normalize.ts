/**
 * Validation and normalization for canonical transactions.
 *
 * Connectors produce {@link RawTransaction} records; `normalizeTransaction` turns each
 * into a validated {@link Transaction} (or throws), and `normalizeAll` validates a batch
 * and de-duplicates by id. Locale-specific parsing (comma decimals, thousands separators,
 * date formats) belongs in the individual importers, not here.
 */
import type { RawTransaction, Transaction } from './types.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Rounds to the cent, avoiding binary-float artefacts. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Coerces an amount that may arrive as a number or a plain numeric string. */
function coerceAmount(value: number | string | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  throw new RangeError(`Invalid transaction amount: ${String(value)}`)
}

/** Validates and normalizes one raw transaction. @throws RangeError on invalid data. */
export function normalizeTransaction(raw: RawTransaction): Transaction {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '') throw new RangeError('Transaction id is required')

  const rawDate = typeof raw.date === 'string' ? raw.date.trim().slice(0, 10) : ''
  if (!ISO_DATE.test(rawDate)) {
    throw new RangeError(`Transaction date must be ISO YYYY-MM-DD, got: ${String(raw.date)}`)
  }
  const month = Number(rawDate.slice(5, 7))
  const day = Number(rawDate.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`Transaction date is out of range: ${rawDate}`)
  }

  const amount = coerceAmount(raw.amount)
  if (!Number.isFinite(amount)) throw new RangeError('Transaction amount must be finite')

  const currency = typeof raw.currency === 'string' && raw.currency.trim() !== ''
    ? raw.currency.trim().toUpperCase()
    : 'EUR'

  return {
    id,
    date: rawDate,
    amount: round2(amount),
    currency,
    label: typeof raw.label === 'string' ? raw.label.trim() : '',
    ...(raw.counterparty !== undefined ? { counterparty: raw.counterparty } : {}),
    ...(raw.category !== undefined ? { category: raw.category } : {}),
    source: typeof raw.source === 'string' && raw.source.trim() !== '' ? raw.source.trim() : 'unknown',
    ...(raw.raw !== undefined ? { raw: raw.raw } : {}),
  }
}

/**
 * Validates a batch and de-duplicates by `id` (first occurrence wins).
 *
 * @throws RangeError if any record is invalid (fail fast, so bad imports are visible).
 */
export function normalizeAll(raws: RawTransaction[]): Transaction[] {
  const seen = new Set<string>()
  const out: Transaction[] = []
  for (const raw of raws) {
    const tx = normalizeTransaction(raw)
    if (seen.has(tx.id)) continue
    seen.add(tx.id)
    out.push(tx)
  }
  return out
}
