import { describe, expect, it } from 'vitest'

import { buildConnector, cliMain, configFromEnv, runConnector } from '../src/index.js'
import type { HttpClient, HttpResponse } from '../src/index.js'

/** Mock Stripe HTTP returning one charge. */
function stripeHttp(): HttpClient {
  const body = {
    data: [{ id: 'ch_1', amount: 2000, currency: 'eur', created: 1767960000, description: 'x', type: 'charge' }],
    has_more: false,
  }
  return async () => {
    const res: HttpResponse = {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
    return res
  }
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
})
