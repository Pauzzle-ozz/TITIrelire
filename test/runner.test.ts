import { describe, expect, it } from 'vitest'

import { buildConnector, cliMain, configFromEnv, runConnector } from '../src/index.js'
import type { HttpClient, HttpResponse } from '../src/index.js'

/** Mock Stripe HTTP returning one charge, recording requested URLs. */
function stripeHttp(): HttpClient & { urls: string[] } {
  const urls: string[] = []
  const body = {
    data: [{ id: 'ch_1', amount: 2000, currency: 'eur', created: 1767960000, description: 'x', type: 'charge' }],
    has_more: false,
  }
  const http = (async (url: string) => {
    urls.push(url)
    const res: HttpResponse = { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
    return res
  }) as HttpClient & { urls: string[] }
  http.urls = urls
  return http
}

/** Mock Bridge HTTP returning one transaction. */
function bridgeHttp(): HttpClient {
  const body = {
    resources: [
      { id: 7, amount: 1200.5, date: '2026-01-10', currency_code: 'EUR', clean_description: 'Vente', provider_description: '', operation_type: 'transfer', deleted: false },
    ],
    pagination: { next_uri: null },
  }
  return async () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })
}

const BRIDGE_ENV = {
  BRIDGE_ACCESS_TOKEN: 't',
  BRIDGE_CLIENT_ID: 'c',
  BRIDGE_CLIENT_SECRET: 's',
}

describe('buildConnector / runConnector', () => {
  it('builds a connector by name', () => {
    expect(buildConnector('stripe', { apiKey: 'sk' }).name).toBe('stripe')
    expect(buildConnector('bridge', { accessToken: 'a', clientId: 'c', clientSecret: 's' }).name).toBe('bridge')
  })

  it('throws on an unknown connector', () => {
    expect(() => buildConnector('sap', {})).toThrow(RangeError)
  })

  it('runs a connector and returns canonical transactions', async () => {
    const txs = await runConnector('stripe', { apiKey: 'sk' }, undefined, stripeHttp())
    expect(txs).toHaveLength(1)
    expect(txs[0]!.amount).toBe(20)
  })
})

describe('configFromEnv', () => {
  it('reads Stripe and Bridge secrets from the environment', () => {
    expect(configFromEnv('stripe', { STRIPE_API_KEY: 'sk_x' })).toEqual({ apiKey: 'sk_x' })
    expect(
      configFromEnv('bridge', {
        BRIDGE_ACCESS_TOKEN: 't',
        BRIDGE_CLIENT_ID: 'c',
        BRIDGE_CLIENT_SECRET: 's',
        BRIDGE_ACCOUNT_ID: '42',
      }),
    ).toEqual({ accessToken: 't', clientId: 'c', clientSecret: 's', accountId: 42 })
  })
})

describe('cliMain', () => {
  function capture() {
    const out: string[] = []
    const err: string[] = []
    return { out, err, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) }
  }

  it('fetches and prints canonical JSON, returning 0', async () => {
    const cap = capture()
    const code = await cliMain({
      argv: ['stripe', '--since', '2026-01-01'],
      env: { STRIPE_API_KEY: 'sk' },
      http: stripeHttp(),
      stdout: cap.stdout,
      stderr: cap.stderr,
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(cap.out.join('')) as Array<{ amount: number }>
    expect(parsed[0]!.amount).toBe(20)
  })

  it('returns 2 and prints usage when the connector is missing or unknown', async () => {
    const a = capture()
    expect(await cliMain({ argv: [], env: {}, stdout: a.stdout, stderr: a.stderr })).toBe(2)
    expect(a.err.join('')).toContain('Usage')

    const b = capture()
    expect(await cliMain({ argv: ['sap'], env: {}, stdout: b.stdout, stderr: b.stderr })).toBe(2)
    expect(b.err.join('')).toContain('Unknown connector')
  })

  it('returns 1 on a runtime error (missing secret)', async () => {
    const cap = capture()
    const code = await cliMain({ argv: ['stripe'], env: {}, stdout: cap.stdout, stderr: cap.stderr })
    expect(code).toBe(1)
    expect(cap.err.join('')).toMatch(/apiKey/i)
  })

  it('forwards --until to the connector (space and = forms are equivalent)', async () => {
    const space = stripeHttp()
    const cap1 = capture()
    await cliMain({ argv: ['stripe', '--until', '2026-06-30'], env: { STRIPE_API_KEY: 'sk' }, http: space, stdout: cap1.stdout, stderr: cap1.stderr })
    expect(space.urls[0]).toContain('created%5Blte%5D=') // created[lte]

    const eq = stripeHttp()
    const cap2 = capture()
    await cliMain({ argv: ['stripe', '--until=2026-06-30'], env: { STRIPE_API_KEY: 'sk' }, http: eq, stdout: cap2.stdout, stderr: cap2.stderr })
    expect(eq.urls[0]).toBe(space.urls[0])
  })

  it('rejects unknown flags and missing flag values with usage (exit 2)', async () => {
    for (const argv of [['stripe', '--foo', 'bar'], ['stripe', '--since'], ['stripe', 'positional']]) {
      const cap = capture()
      const code = await cliMain({ argv, env: { STRIPE_API_KEY: 'sk' }, http: stripeHttp(), stdout: cap.stdout, stderr: cap.stderr })
      expect(code).toBe(2)
      expect(cap.err.join('')).toContain('Usage')
    }
  })

  it('surfaces an invalid --until as a clean exit-1 error', async () => {
    const cap = capture()
    const code = await cliMain({ argv: ['stripe', '--until', 'nonsense'], env: { STRIPE_API_KEY: 'sk' }, http: stripeHttp(), stdout: cap.stdout, stderr: cap.stderr })
    expect(code).toBe(1)
    expect(cap.err.join('')).toMatch(/Invalid FetchRange until/)
  })

  it('runs the bridge connector end-to-end and never emits a raw field', async () => {
    const cap = capture()
    const code = await cliMain({ argv: ['bridge', '--since', '2026-01-01'], env: BRIDGE_ENV, http: bridgeHttp(), stdout: cap.stdout, stderr: cap.stderr })
    expect(code).toBe(0)
    const parsed = JSON.parse(cap.out.join('')) as Array<Record<string, unknown>>
    expect(parsed[0]).toMatchObject({ source: 'bridge', amount: 1200.5 })
    expect(parsed[0]!['raw']).toBeUndefined() // data minimization
  })

  it('rejects a malformed BRIDGE_ACCOUNT_ID (exit 1)', async () => {
    const cap = capture()
    const code = await cliMain({ argv: ['bridge'], env: { ...BRIDGE_ENV, BRIDGE_ACCOUNT_ID: 'abc' }, http: bridgeHttp(), stdout: cap.stdout, stderr: cap.stderr })
    expect(code).toBe(1)
    expect(cap.err.join('')).toMatch(/BRIDGE_ACCOUNT_ID/)
  })
})
