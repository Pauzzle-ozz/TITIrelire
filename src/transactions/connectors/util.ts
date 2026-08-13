/**
 * Small shared helpers for connectors.
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates a FetchRange bound is an ISO date, throwing a clear local error otherwise. */
export function assertIsoDate(date: string, field: string): void {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new RangeError(`Invalid FetchRange ${field}: ${date} (expected YYYY-MM-DD)`)
  }
}
