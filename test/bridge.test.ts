import { describe, expect, it } from 'vitest'

import { aggregateTurnover, BridgeConnector } from '../src/index.js'
import type { HttpClient, HttpResponse } from '../src/index.js'

interface BridgeList {
  resources: Array<{
    id: number
    amount: number
    date: string
    currency_code: string
    clean_description: string | null
    provider_description: string | null
    operation_type: string | null
    deleted: boolean
  }>
  pagination?: { next_uri?: string | null }
}

function bridgeTx(over: Partial<BridgeList['resources'][number]>): BridgeList['resources'][number] {
  return {
    id: 1,
    amount: 100,
    date: '2026-01-10',
    currency_code: 'EUR',
    clean_description: 'Paiement client',
    provider_description: 'RAW WORDING',
    operation_type: 'transfer',
    deleted: false,
    ...over,
  }
}

/** Mock HTTP client returning the given pages in order and recording URLs + headers. */
function mockHttp(pages: BridgeList[]): {
  http: HttpClient
  urls: string[]
  headers: Array<Record<string, string> | undefined>
} {
  const urls: string[] = []
  const headers: Array<Record<string, string> | undefined> = []
  let call = 0
  const http: HttpClient = async (url, init) => {
    urls.push(url)
    headers.push(init?.headers)
    const body: BridgeList = pages[call] ?? { resources: [] }
    call += 1
    const res: HttpResponse = {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
    return res
  }
  return { http, urls, headers }
}

const config = { accessToken: 'tok', clientId: 'cid', clientSecret: 'sec' }

describe('BridgeConnector', () => {
  it('requires credentials', () => {
    expect(() => new BridgeConnector({ accessToken: '', clientId: 'c', clientSecret: 's' })).toThrow(
      RangeError,
    )
  })

  it('maps signed bank amounts (credit +, debit −) to canonical transactions', async () => {
    const { http } = mockHttp([
      {
        resources: [
          bridgeTx({ id: 1, amount: 1200.5, clean_description: 'Vente' }),
          bridgeTx({ id: 2, amount: -80, clean_description: 'Achat' }),
        ],
      },
    ])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions()
    expect(txs.map((t) => [t.id, t.amount])).toEqual([
      ['1', 1200.5],
      ['2', -80],
    ])
    expect(txs[0]).toMatchObject({ currency: 'EUR', source: 'bridge', label: 'Vente', category: 'transfer' })
  })

  it('sends the Bridge auth headers', async () => {
    const { http, headers } = mockHttp([{ resources: [bridgeTx({})] }])
    await new BridgeConnector({ ...config, http }).fetchTransactions()
    expect(headers[0]).toMatchObject({
      Authorization: 'Bearer tok',
      'Client-Id': 'cid',
      'Client-Secret': 'sec',
      'Bridge-Version': '2025-01-15',
    })
  })

  it('follows next_uri pagination and passes the date range as min_date/max_date', async () => {
    const { http, urls } = mockHttp([
      { resources: [bridgeTx({ id: 1 })], pagination: { next_uri: '/v3/aggregation/transactions?after=abc' } },
      { resources: [bridgeTx({ id: 2 })], pagination: { next_uri: null } },
    ])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions({
      since: '2026-01-01',
      until: '2026-12-31',
    })
    expect(txs.map((t) => t.id)).toEqual(['1', '2'])
    expect(urls[0]).toContain('min_date=2026-01-01')
    expect(urls[0]).toContain('max_date=2026-12-31')
    expect(urls[1]).toBe('https://api.bridgeapi.io/v3/aggregation/transactions?after=abc')
  })

  it('skips deleted (tombstoned) transactions', async () => {
    const { http } = mockHttp([
      { resources: [bridgeTx({ id: 1 }), bridgeTx({ id: 2, deleted: true })] },
    ])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions()
    expect(txs.map((t) => t.id)).toEqual(['1'])
  })

  it('falls back to provider_description when clean_description is null', async () => {
    const { http } = mockHttp([{ resources: [bridgeTx({ clean_description: null })] }])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions()
    expect(txs[0]!.label).toBe('RAW WORDING')
  })

  it('throws instead of silently truncating at the page cap', async () => {
    let n = 0
    const http: HttpClient = async () => {
      n += 1
      const body: BridgeList = {
        resources: [bridgeTx({ id: n })],
        pagination: { next_uri: `/v3/aggregation/transactions?after=${n}` },
      }
      return { ok: true, status: 200, json: async () => body, text: async () => '' }
    }
    await expect(
      new BridgeConnector({ ...config, http, maxPages: 3 }).fetchTransactions(),
    ).rejects.toThrow(/maxPages=3/)
  })

  it('rejects an invalid FetchRange date locally', async () => {
    const { http } = mockHttp([{ resources: [bridgeTx({})] }])
    await expect(
      new BridgeConnector({ ...config, http }).fetchTransactions({ until: '2026-99-99' }),
    ).rejects.toThrow(RangeError)
  })

  it('throws on a non-ok response with a bounded body', async () => {
    const http: HttpClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'x'.repeat(2000),
    })
    await expect(new BridgeConnector({ ...config, http }).fetchTransactions()).rejects.toThrow(/401/)
  })

  it('returns [] for an empty page and for a missing resources key', async () => {
    const empty = await new BridgeConnector({ ...config, http: mockHttp([{ resources: [] }]).http }).fetchTransactions()
    expect(empty).toEqual([])
    const missing: HttpClient = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ pagination: { next_uri: null } }),
      text: async () => '{}',
    })
    expect(await new BridgeConnector({ ...config, http: missing }).fetchTransactions()).toEqual([])
  })

  it('maps every field correctly across pages, incl. fallback and deleted-skip on page 2', async () => {
    const { http } = mockHttp([
      { resources: [bridgeTx({ id: 1, amount: 1000, clean_description: 'P1' })], pagination: { next_uri: '/v3/aggregation/transactions?after=x' } },
      {
        resources: [
          bridgeTx({ id: 2, amount: -42.5, clean_description: null, operation_type: 'card' }),
          bridgeTx({ id: 3, deleted: true }),
        ],
        pagination: { next_uri: null },
      },
    ])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions()
    expect(txs).toHaveLength(2) // deleted row on page 2 dropped
    expect(txs[1]).toMatchObject({ id: '2', amount: -42.5, label: 'RAW WORDING', category: 'card' })
  })

  it('sends account_id only when configured', async () => {
    const set = mockHttp([{ resources: [bridgeTx({})] }])
    await new BridgeConnector({ ...config, http: set.http, accountId: 42 }).fetchTransactions()
    expect(set.urls[0]).toContain('account_id=42')
    const unset = mockHttp([{ resources: [bridgeTx({})] }])
    await new BridgeConnector({ ...config, http: unset.http }).fetchTransactions()
    expect(unset.urls[0]).not.toContain('account_id=')
  })

  it('rejects an inverted range and non-positive limits', async () => {
    const { http } = mockHttp([{ resources: [bridgeTx({})] }])
    await expect(
      new BridgeConnector({ ...config, http }).fetchTransactions({ since: '2026-12-31', until: '2026-01-01' }),
    ).rejects.toThrow(RangeError)
    expect(() => new BridgeConnector({ ...config, http, maxPages: 0 })).toThrow(RangeError)
    expect(() => new BridgeConnector({ ...config, http, pageLimit: -5 })).toThrow(RangeError)
  })

  it('throws on a stalled (repeated) next_uri instead of exhausting the page budget', async () => {
    const http: HttpClient = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ resources: [], pagination: { next_uri: '/same?after=stuck' } }),
      text: async () => '',
    })
    await expect(
      new BridgeConnector({ ...config, http, maxPages: 50 }).fetchTransactions(),
    ).rejects.toThrow(/stalled/)
  })

  it('feeds aggregation: revenue = credits, expenses = |debits|', async () => {
    const { http } = mockHttp([
      {
        resources: [
          bridgeTx({ id: 1, amount: 1000 }),
          bridgeTx({ id: 2, amount: 500 }),
          bridgeTx({ id: 3, amount: -200 }),
        ],
      },
    ])
    const txs = await new BridgeConnector({ ...config, http }).fetchTransactions()
    const summary = aggregateTurnover(txs, { year: 2026 })
    expect(summary.revenue).toBe(1500)
    expect(summary.expenses).toBe(200)
  })
})
