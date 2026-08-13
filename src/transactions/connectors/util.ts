/**
 * Small shared helpers for connectors.
 */
import type { FetchRange } from './types.js'

/** ISO calendar date, `YYYY-MM-DD`. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates a FetchRange bound is an ISO date, throwing a clear local error otherwise. */
export function assertIsoDate(date: string, field: string): void {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new RangeError(`Invalid FetchRange ${field}: ${date} (expected YYYY-MM-DD)`)
  }
}

/** Validates a whole range: each bound is ISO, and `since` is not after `until`. */
export function assertRange(range: FetchRange | undefined): void {
  if (range?.since !== undefined) assertIsoDate(range.since, 'since')
  if (range?.until !== undefined) assertIsoDate(range.until, 'until')
  if (range?.since !== undefined && range.until !== undefined && range.since > range.until) {
    throw new RangeError(`FetchRange since (${range.since}) must not be after until (${range.until})`)
  }
}

/** Resolves a config value (or its default) to a positive integer, throwing otherwise. */
export function positiveIntOption(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return resolved
}
