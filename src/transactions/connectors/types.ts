/**
 * Connector abstraction (the "port").
 *
 * A {@link TransactionSource} pulls records from a provider (Stripe, a bank via an
 * aggregator, a CRM…) and returns canonical {@link Transaction}s. Live connectors need
 * secrets, so — to protect the local-first promise — they are meant to run **outside the
 * browser** (a Node CLI or a self-hosted connector), never with an API key shipped to the
 * client. See ARCHITECTURE.md.
 *
 * HTTP is injected (`HttpClient`) so connectors are fully unit-testable offline; the
 * default is the platform `fetch`.
 */
import type { Transaction } from '../types.js'

/** Inclusive date range (ISO `YYYY-MM-DD`) to fetch. */
export interface FetchRange {
  since?: string
  until?: string
}

/** Minimal, `fetch`-compatible response shape a connector needs. */
export interface HttpResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

/** Minimal, `fetch`-compatible HTTP client. The global `fetch` satisfies this. */
export type HttpClient = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>

/** A source of transactions. */
export interface TransactionSource {
  /** Stable connector name (also used as the transactions' `source`). */
  readonly name: string
  /** Fetches and normalizes transactions for the given range (all if omitted). */
  fetchTransactions(range?: FetchRange): Promise<Transaction[]>
}

/** Returns the platform `fetch` as an {@link HttpClient}, or throws if unavailable. */
export function defaultHttpClient(): HttpClient {
  const f = (globalThis as { fetch?: unknown }).fetch
  if (typeof f !== 'function') {
    throw new Error('No global fetch available; pass an http client explicitly')
  }
  return f as HttpClient
}
