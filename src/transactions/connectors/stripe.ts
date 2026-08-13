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
  /** If set and non-empty, keep only these balance-transaction types (e.g. `['charge']`). */
  includeTypes?: string[]
  /** Keep the raw Stripe object in `Transaction.raw`. Default false (data minimization). */
  keepRaw?: boolean
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates a FetchRange bound is an ISO date, throwing a clear local error otherwise. */
function assertIsoDate(date: string, field: string): void {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new RangeError(`Invalid FetchRange ${field}: ${date} (expected YYYY-MM-DD)`)
  }
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
  private readonly keepRaw: boolean

  constructor(config: StripeConfig) {
    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      throw new RangeError('Stripe apiKey is required')
    }
    this.apiKey = config.apiKey
    this.http = config.http ?? defaultHttpClient()
    this.baseUrl = (config.baseUrl ?? 'https://api.stripe.com/v1').replace(/\/$/, '')
    this.pageLimit = config.pageLimit ?? 100
    this.maxPages = config.maxPages ?? 100
    // An empty array means "no filter", not "exclude everything".
    this.includeTypes =
      config.includeTypes && config.includeTypes.length > 0 ? new Set(config.includeTypes) : undefined
    this.keepRaw = config.keepRaw ?? false
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
    if (range?.since !== undefined) assertIsoDate(range.since, 'since')
    if (range?.until !== undefined) assertIsoDate(range.until, 'until')

    const raws: RawTransaction[] = []
    let startingAfter: string | undefined
    let cursorId: string | undefined
    let moreRemaining = false

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = await this.http(this.buildUrl(range, startingAfter), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 500)
        throw new Error(`Stripe API error ${response.status}: ${body}`)
      }
      const list = (await response.json()) as StripeList
      const batch = Array.isArray(list.data) ? list.data : []

      for (const bt of batch) {
        cursorId = bt.id // cursor tracks the raw last item, even if filtered out below
        if (this.includeTypes !== undefined && !this.includeTypes.has(bt.type)) continue
        raws.push({
          id: bt.id,
          date: unixToIsoDate(bt.created),
          amount: bt.amount / 100, // minor units → currency units
          currency: bt.currency,
          label: bt.description ?? bt.type,
          category: bt.type,
          source: this.name,
          ...(this.keepRaw ? { raw: bt } : {}),
        })
      }

      moreRemaining = list.has_more === true && batch.length > 0 && cursorId !== undefined
      if (!moreRemaining) break
      startingAfter = cursorId
    }

    // Fail loudly rather than silently under-reporting turnover.
    if (moreRemaining) {
      throw new Error(
        `Stripe pagination exceeded maxPages=${this.maxPages}; results would be incomplete. ` +
          'Narrow the date range or raise maxPages.',
      )
    }

    return normalizeAll(raws)
  }
}
