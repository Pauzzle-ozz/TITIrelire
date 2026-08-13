/**
 * Self-hosted connector runner.
 *
 * This is how live connectors are meant to be used: **outside the browser**. A small
 * Node process (or CLI) builds a connector from a config (secrets from the environment),
 * fetches transactions, and emits canonical JSON that the local-first app then consumes.
 * Secrets never touch the client.
 *
 * The CLI logic (`cliMain`) is a pure, dependency-injected function so it is fully
 * testable without a real network, environment or process.
 */
import type { Transaction } from '../types.js'
import { BridgeConnector, type BridgeConfig } from './bridge.js'
import { StripeConnector, type StripeConfig } from './stripe.js'
import type { FetchRange, HttpClient, TransactionSource } from './types.js'

/** Names of the connectors the runner can build. */
export const CONNECTORS = ['stripe', 'bridge'] as const
export type ConnectorName = (typeof CONNECTORS)[number]

/** Builds a connector by name from a plain config object. */
export function buildConnector(
  name: string,
  config: Record<string, unknown>,
  http?: HttpClient,
): TransactionSource {
  const withHttp = http ? { http } : {}
  switch (name) {
    case 'stripe':
      return new StripeConnector({ ...(config as unknown as StripeConfig), ...withHttp })
    case 'bridge':
      return new BridgeConnector({ ...(config as unknown as BridgeConfig), ...withHttp })
    default:
      throw new RangeError(`Unknown connector: ${name} (expected one of ${CONNECTORS.join(', ')})`)
  }
}

/** Builds a connector and fetches its transactions for the given range. */
export function runConnector(
  name: string,
  config: Record<string, unknown>,
  range?: FetchRange,
  http?: HttpClient,
): Promise<Transaction[]> {
  return buildConnector(name, config, http).fetchTransactions(range)
}

/** Reads the config for a connector from environment variables. */
export function configFromEnv(
  name: string,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  switch (name) {
    case 'stripe':
      return { apiKey: env['STRIPE_API_KEY'] ?? '' }
    case 'bridge': {
      const config: Record<string, unknown> = {
        accessToken: env['BRIDGE_ACCESS_TOKEN'] ?? '',
        clientId: env['BRIDGE_CLIENT_ID'] ?? '',
        clientSecret: env['BRIDGE_CLIENT_SECRET'] ?? '',
      }
      if (env['BRIDGE_ACCOUNT_ID'] !== undefined) {
        const accountId = Number(env['BRIDGE_ACCOUNT_ID'])
        if (!Number.isInteger(accountId) || accountId < 1) {
          throw new RangeError('BRIDGE_ACCOUNT_ID must be a positive integer')
        }
        config['accountId'] = accountId
      }
      return config
    }
    default:
      throw new RangeError(`Unknown connector: ${name} (expected one of ${CONNECTORS.join(', ')})`)
  }
}

/** Injected dependencies for {@link cliMain} (no direct process/network access). */
export interface CliDeps {
  argv: string[]
  env: Record<string, string | undefined>
  stdout: (text: string) => void
  stderr: (text: string) => void
  http?: HttpClient
}

const USAGE =
  'Usage: titirelire-connect <stripe|bridge> [--since YYYY-MM-DD] [--until YYYY-MM-DD]\n' +
  'Secrets are read from the environment (e.g. STRIPE_API_KEY, BRIDGE_ACCESS_TOKEN…).'

const KNOWN_FLAGS = new Set(['since', 'until'])

/**
 * Parses `--key value` and `--key=value` flags into a map. Only known flags are accepted;
 * an unknown flag, a stray positional, or a flag with no value throws (surfaced as a usage
 * error). Silent drops would mean a wider-than-intended fetch — so we fail loudly.
 */
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!
    if (!arg.startsWith('--')) throw new RangeError(`Unexpected argument: ${arg}`)

    const eq = arg.indexOf('=')
    let key: string
    let value: string | undefined
    if (eq !== -1) {
      key = arg.slice(2, eq)
      value = arg.slice(eq + 1)
    } else {
      key = arg.slice(2)
      const next = args[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new RangeError(`Flag --${key} requires a value`)
      }
      value = next
      i += 1
    }
    if (!KNOWN_FLAGS.has(key)) throw new RangeError(`Unknown flag: --${key}`)
    flags[key] = value
  }
  return flags
}

/**
 * CLI entry point: fetches a connector's transactions and writes canonical JSON to stdout.
 * Returns a process exit code (0 ok, 1 runtime error, 2 usage error).
 */
export async function cliMain(deps: CliDeps): Promise<number> {
  const [name, ...rest] = deps.argv
  if (name === undefined || name === '--help' || name === '-h') {
    deps.stderr(USAGE)
    return 2
  }
  if (!CONNECTORS.includes(name as ConnectorName)) {
    deps.stderr(`Unknown connector: ${name}\n${USAGE}`)
    return 2
  }

  let flags: Record<string, string>
  try {
    flags = parseFlags(rest)
  } catch (error) {
    deps.stderr(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const range: FetchRange = {
    ...(flags['since'] !== undefined ? { since: flags['since'] } : {}),
    ...(flags['until'] !== undefined ? { until: flags['until'] } : {}),
  }

  try {
    const config = configFromEnv(name, deps.env)
    const transactions = await runConnector(name, config, range, deps.http)
    deps.stdout(JSON.stringify(transactions, null, 2))
    return 0
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : String(error))
    return 1
  }
}
