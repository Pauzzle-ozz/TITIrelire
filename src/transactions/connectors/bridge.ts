/**
 * Bridge connector — reference Open Banking / DSP2 bank-aggregation source.
 *
 * Reads a user's aggregated bank transactions from Bridge
 * (`GET /v3/aggregation/transactions`) and maps them to canonical
 * {@link Transaction}s. Follows Bridge's cursor pagination (`pagination.next_uri`).
 * HTTP is injected so it is fully testable offline.
 *
 * ⚠️ Uses a user access token + client secret → run this server-side / self-hosted,
 * never in the browser (see ARCHITECTURE.md). Bank amounts are already signed
 * (negative = debit / money out, positive = credit / money in) and in currency units.
 */
import { normalizeAll } from '../normalize.js'
import type { RawTransaction, Transaction } from '../types.js'
import { defaultHttpClient, type FetchRange, type HttpClient, type TransactionSource } from './types.js'
import { assertIsoDate } from './util.js'

export interface BridgeConfig {
  /** Bridge user access token (Bearer). */
  accessToken: string
  /** Bridge application client id. */
  clientId: string
  /** Bridge application client secret. */
  clientSecret: string
  /** Injectable HTTP client (defaults to the platform `fetch`). */
  http?: HttpClient
  /** API base URL (override for tests/proxies). Default `https://api.bridgeapi.io`. */
  baseUrl?: string
  /** `Bridge-Version` header. Default `2025-01-15`. */
  version?: string
  /** Page size. Default 500. */
  pageLimit?: number
  /** Safety cap on the number of pages fetched. Default 100. */
  maxPages?: number
  /** Restrict to a single Bridge account id. */
  accountId?: number
  /** Keep the raw Bridge object in `Transaction.raw`. Default false (data minimization). */
  keepRaw?: boolean
}

/** One Bridge transaction (only the fields we use). */
interface BridgeTransaction {
  id: number
  amount: number // signed, currency units (negative = debit)
  date: string // ISO YYYY-MM-DD
  currency_code: string
  clean_description: string | null
  provider_description: string | null
  operation_type: string | null
  deleted: boolean
}

interface BridgeList {
  resources: BridgeTransaction[]
  pagination?: { next_uri?: string | null }
}

/** A connector that pulls transactions from Bridge (Open Banking / DSP2). */
export class BridgeConnector implements TransactionSource {
  readonly name = 'bridge'

  private readonly http: HttpClient
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly pageLimit: number
  private readonly maxPages: number
  private readonly accountId: number | undefined
  private readonly keepRaw: boolean

  constructor(config: BridgeConfig) {
    for (const [key, value] of [
      ['accessToken', config.accessToken],
      ['clientId', config.clientId],
      ['clientSecret', config.clientSecret],
    ] as const) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new RangeError(`Bridge ${key} is required`)
      }
    }
    this.http = config.http ?? defaultHttpClient()
    this.baseUrl = (config.baseUrl ?? 'https://api.bridgeapi.io').replace(/\/$/, '')
    this.headers = {
      Authorization: `Bearer ${config.accessToken}`,
      'Client-Id': config.clientId,
      'Client-Secret': config.clientSecret,
      'Bridge-Version': config.version ?? '2025-01-15',
    }
    this.pageLimit = config.pageLimit ?? 500
    this.maxPages = config.maxPages ?? 100
    this.accountId = config.accountId
    this.keepRaw = config.keepRaw ?? false
  }

  private buildFirstUrl(range: FetchRange | undefined): string {
    const params = new URLSearchParams()
    params.set('limit', String(this.pageLimit))
    if (range?.since !== undefined) params.set('min_date', range.since)
    if (range?.until !== undefined) params.set('max_date', range.until)
    if (this.accountId !== undefined) params.set('account_id', String(this.accountId))
    return `${this.baseUrl}/v3/aggregation/transactions?${params.toString()}`
  }

  async fetchTransactions(range?: FetchRange): Promise<Transaction[]> {
    if (range?.since !== undefined) assertIsoDate(range.since, 'since')
    if (range?.until !== undefined) assertIsoDate(range.until, 'until')

    const raws: RawTransaction[] = []
    let url = this.buildFirstUrl(range)
    let nextUri: string | null | undefined

    for (let page = 0; page < this.maxPages; page += 1) {
      const response = await this.http(url, { method: 'GET', headers: this.headers })
      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 500)
        throw new Error(`Bridge API error ${response.status}: ${body}`)
      }
      const list = (await response.json()) as BridgeList
      const batch = Array.isArray(list.resources) ? list.resources : []

      for (const bt of batch) {
        if (bt.deleted) continue // skip tombstoned transactions
        raws.push({
          id: String(bt.id),
          date: bt.date,
          amount: bt.amount, // already signed, in currency units
          currency: bt.currency_code,
          label: bt.clean_description ?? bt.provider_description ?? '',
          ...(bt.operation_type ? { category: bt.operation_type } : {}),
          source: this.name,
          ...(this.keepRaw ? { raw: bt } : {}),
        })
      }

      nextUri = list.pagination?.next_uri
      if (!nextUri) break
      url = `${this.baseUrl}${nextUri}`
    }

    // Fail loudly rather than silently under-reporting turnover.
    if (nextUri) {
      throw new Error(
        `Bridge pagination exceeded maxPages=${this.maxPages}; results would be incomplete. ` +
          'Narrow the date range or raise maxPages.',
      )
    }

    return normalizeAll(raws)
  }
}
