/**
 * Stripe connector — the reference live-API connector.
 *
 * Reads Stripe *balance transactions* (charges, refunds, payouts…) and maps them to
 * canonical {@link Transaction}s. Follows Stripe's cursor pagination (`has_more` +
 * `starting_after`). HTTP is injected so it is fully testable offline.
 *
 * ⚠️ Uses a Stripe **secret key** → run this server-side / self-hosted, never in the
 * browser (see ARCHITECTURE.md). For turnover, revenue = the positive amounts (customer
 * payments); Stripe payouts appear as negative movements — filter with `includeTypes`
 * if you only want customer-facing income.
 */
import { normalizeAll } from '../normalize.js'
import type { RawTransaction, Transaction } from '../types.js'
import { defaultHttpClient, type FetchRange, type HttpClient, type TransactionSource } from './types.js'

export interface StripeConfig {
  /** Stripe secret API key (`sk_...`). */
  apiKey: string
  /** Injectable HTTP client (defaults to the platform `fetch`). */
  http?: HttpClient
  /** API base URL (override for tests/proxies). */
  baseUrl?: string
  /** Page size (Stripe max 100). Default 100. */
  pageLimit?: number
  /** Safety cap on the number of pages fetched. Default 100. */
  maxPages?: number
  /** If set, keep only these Stripe balance-transaction types (e.g. `['charge']`). */
  includeTypes?: string[]
}

/** One Stripe balance transaction (only the fields we use). */
interface StripeBalanceTransaction {
  id: string
  amount: number // minor units (cents), signed
  currency: string
  created: number // unix seconds
  description: string | null
  type: string
}

interface StripeList {
  data: StripeBalanceTransaction[]
  has_more: boolean
}

/** Converts a unix timestamp (seconds) to an ISO `YYYY-MM-DD` date (UTC). */
function unixToIsoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

/** Converts an ISO date to a unix timestamp (seconds) at the given UTC time-of-day. */
function isoDateToUnix(date: string, endOfDay: boolean): number {
  const iso = `${date}T${endOfDay ? '23:59:59' : '00:00:00'}Z`
  return Math.floor(Date.parse(iso) / 1000)
}

/** A connector that pulls transactions from Stripe. */
export class StripeConnector implements TransactionSource {
  readonly name = 'stripe'

  private readonly apiKey: string
  private readonly http: HttpClient
  private readonly baseUrl: string
  private readonly pageLimit: number
  private readonly maxPages: number
  private readonly includeTypes: Set<string> | undefined

  constructor(config: StripeConfig) {
    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      throw new RangeError('Stripe apiKey is required')
    }
    this.apiKey = config.apiKey
    this.http = config.http ?? defaultHttpClient()
    this.baseUrl = (config.baseUrl ?? 'https://api.stripe.com/v1').replace(/\/$/, '')
    this.pageLimit = config.pageLimit ?? 100
    this.maxPages = config.maxPages ?? 100
    this.includeTypes = config.includeTypes ? new Set(config.includeTypes) : undefined
  }

  private buildUrl(range: FetchRange | undefined, startingAfter: string | undefined): string {
    const params = new URLSearchParams()
    params.set('limit', String(this.pageLimit))
    if (range?.since !== undefined) params.set('created[gte]', String(isoDateToUnix(range.since, false)))
    if (range?.until !== undefined) params.set('created[lte]', String(isoDateToUnix(range.until, true)))
    if (startingAfter !== undefined) params.set('starting_after', startingAfter)
    return `${this.baseUrl}/balance_transactions?${params.toString()}`
  }

  async fetchTransactions(range?: FetchRange): Promise<Transaction[]> {
    const raws: RawTransaction[] = []
    let startingAfter: string | undefined
    let cursorId: string | undefined

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = await this.http(this.buildUrl(range, startingAfter), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Stripe API error ${response.status}: ${body}`)
      }
      const list = (await response.json()) as StripeList
      const batch = Array.isArray(list.data) ? list.data : []

      for (const bt of batch) {
        cursorId = bt.id
        if (this.includeTypes !== undefined && !this.includeTypes.has(bt.type)) continue
        raws.push({
          id: bt.id,
          date: unixToIsoDate(bt.created),
          amount: bt.amount / 100, // minor units → currency units
          currency: bt.currency,
          label: bt.description ?? bt.type,
          category: bt.type,
          source: this.name,
          raw: bt,
        })
      }

      if (!list.has_more || batch.length === 0 || cursorId === undefined) break
      startingAfter = cursorId
    }

    return normalizeAll(raws)
  }
}
