import { describe, expect, it } from 'vitest'

import { aggregateTurnover, StripeConnector } from '../src/index.js'
import type { HttpClient, HttpResponse } from '../src/index.js'

const CREATED = Math.floor(Date.parse('2026-01-10T12:00:00Z') / 1000)

interface StripeList {
  data: Array<{
    id: string
    amount: number
    currency: string
    created: number
    description: string | null
    type: string
  }>
  has_more: boolean
}

/** Mock HTTP client that returns the given pages in order and records the URLs. */
function mockHttp(pages: StripeList[]): { http: HttpClient; urls: string[] } {
  const urls: string[] = []
  let call = 0
  const http: HttpClient = async (url) => {
    urls.push(url)
    const body: StripeList = pages[call] ?? { data: [], has_more: false }
    call += 1
    const res: HttpResponse = {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
    return res
  }
  return { http, urls }
}

const charge = { id: 'ch_1', amount: 2000, currency: 'eur', created: CREATED, description: 'Sub', type: 'charge' }
const refund = { id: 're_1', amount: -500, currency: 'eur', created: CREATED, description: null, type: 'refund' }
const payout = { id: 'po_1', amount: -1500, currency: 'eur', created: CREATED, description: null, type: 'payout' }

describe('StripeConnector', () => {
  it('requires an API key', () => {
    expect(() => new StripeConnector({ apiKey: '' })).toThrow(RangeError)
  })

  it('maps balance transactions to canonical transactions', async () => {
    const { http } = mockHttp([{ data: [charge], has_more: false }])
    const txs = await new StripeConnector({ apiKey: 'sk_test', http }).fetchTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({
      id: 'ch_1',
      date: '2026-01-10',
      amount: 20, // 2000 cents → 20 €
      currency: 'EUR',
      category: 'charge',
      source: 'stripe',
      label: 'Sub',
    })
  })

  it('follows cursor pagination across pages', async () => {
    const { http, urls } = mockHttp([
      { data: [charge, refund], has_more: true },
      { data: [payout], has_more: false },
    ])
    const txs = await new StripeConnector({ apiKey: 'sk_test', http }).fetchTransactions()
    expect(txs.map((t) => t.id)).toEqual(['ch_1', 're_1', 'po_1'])
    // Second request paginates after the last id of the first page.
    expect(urls[1]).toContain('starting_after=re_1')
  })

  it('filters by balance-transaction type when includeTypes is set', async () => {
    const { http } = mockHttp([{ data: [charge, refund, payout], has_more: false }])
    const txs = await new StripeConnector({
      apiKey: 'sk_test',
      http,
      includeTypes: ['charge'],
    }).fetchTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0]!.id).toBe('ch_1')
  })

  it('passes the date range as unix timestamps', async () => {
    const { http, urls } = mockHttp([{ data: [charge], has_more: false }])
    await new StripeConnector({ apiKey: 'sk_test', http }).fetchTransactions({
      since: '2026-01-01',
      until: '2026-12-31',
    })
    expect(urls[0]).toContain('created%5Bgte%5D=') // created[gte]
    expect(urls[0]).toContain('created%5Blte%5D=') // created[lte]
  })

  it('throws on a non-ok response', async () => {
    const http: HttpClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'Invalid API Key',
    })
    await expect(new StripeConnector({ apiKey: 'sk_bad', http }).fetchTransactions()).rejects.toThrow(
      /401/,
    )
  })

  it('throws instead of silently truncating when the page cap is hit', async () => {
    // Always report more pages available.
    let n = 0
    const http: HttpClient = async () => {
      n += 1
      const body = { data: [{ ...charge, id: `ch_${n}` }], has_more: true }
      return { ok: true, status: 200, json: async () => body, text: async () => '' }
    }
    await expect(
      new StripeConnector({ apiKey: 'sk_test', http, maxPages: 3 }).fetchTransactions(),
    ).rejects.toThrow(/maxPages=3/)
  })

  it('paginates using the raw last id even when it is filtered out', async () => {
    const charge2 = { ...charge, id: 'ch_2' }
    const { http, urls } = mockHttp([
      { data: [charge, payout], has_more: true }, // last item (payout) is filtered
      { data: [charge2], has_more: false },
    ])
    const txs = await new StripeConnector({
      apiKey: 'sk_test',
      http,
      includeTypes: ['charge'],
    }).fetchTransactions()
    expect(txs.map((t) => t.id)).toEqual(['ch_1', 'ch_2'])
    expect(urls[1]).toContain('starting_after=po_1') // cursor = filtered payout id
  })

  it('treats includeTypes: [] as no filter', async () => {
    const { http } = mockHttp([{ data: [charge, refund, payout], has_more: false }])
    const txs = await new StripeConnector({ apiKey: 'sk_test', http, includeTypes: [] }).fetchTransactions()
    expect(txs).toHaveLength(3)
  })

  it('rejects an invalid FetchRange date locally', async () => {
    const { http } = mockHttp([{ data: [charge], has_more: false }])
    await expect(
      new StripeConnector({ apiKey: 'sk_test', http }).fetchTransactions({ since: 'not-a-date' }),
    ).rejects.toThrow(RangeError)
  })

  it('feeds aggregation: revenue counts only customer payments', async () => {
    const { http } = mockHttp([{ data: [charge, refund, payout], has_more: false }])
    const txs = await new StripeConnector({ apiKey: 'sk_test', http }).fetchTransactions()
    const summary = aggregateTurnover(txs, { year: 2026 })
    expect(summary.revenue).toBe(20) // the charge only
    expect(summary.expenses).toBe(20) // 5 (refund) + 15 (payout)
  })
})
