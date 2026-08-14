/**
 * Minimal hash-based router for the multi-page app shell.
 *
 * Local-first and backend-free: navigation lives in the URL fragment (`#/transactions`), so it
 * survives reloads and needs no server. The browser bindings (`location`, `hashchange`) are
 * injected, so the whole thing is unit-testable without a DOM, and the router never assumes a
 * specific environment.
 *
 * Unknown or empty routes fall back to the default, so a hand-edited URL can never leave the
 * app on a blank page.
 */

/** The browser surface the router needs, injected for testability. */
export interface RouterEnv {
  getHash(): string
  setHash(hash: string): void
  /** Registers a hash-change listener; returns nothing (kept simple). */
  onHashChange(cb: () => void): void
}

export interface RouterOptions {
  /** The set of valid route ids (e.g. `['accueil', 'espace', …]`). */
  routes: readonly string[]
  /** Route used when the hash is empty or unknown. */
  defaultRoute: string
  /** Called with the resolved route whenever it changes (and once on {@link Router.start}). */
  onChange: (route: string) => void
  /** Browser bindings; defaults to the real `window`/`location`. */
  env?: RouterEnv
}

export interface Router {
  /** The current, resolved route. */
  current(): string
  /** Navigates to a route (writing the hash); no-op for an unknown route. */
  navigate(route: string): void
  /** Reads the initial hash and fires `onChange` once. Call after wiring the UI. */
  start(): void
}

/** Parses a route id out of a location hash (`#/x` or `#x` → `x`). */
export function routeFromHash(hash: string): string {
  return hash.replace(/^#\/?/, '').trim()
}

/** Binds {@link RouterEnv} to the real browser, or throws if unavailable. */
export function defaultRouterEnv(): RouterEnv {
  const w = globalThis as {
    location?: { hash: string }
    addEventListener?: (type: string, cb: () => void) => void
  }
  if (w.location === undefined || typeof w.addEventListener !== 'function') {
    throw new Error('No window/location available; pass a RouterEnv explicitly')
  }
  return {
    getHash: () => w.location!.hash,
    setHash: (hash) => {
      w.location!.hash = hash
    },
    onHashChange: (cb) => w.addEventListener!('hashchange', cb),
  }
}

/** Creates a router over the given routes. Call {@link Router.start} to activate it. */
export function createRouter(options: RouterOptions): Router {
  const env = options.env ?? defaultRouterEnv()
  const valid = new Set(options.routes)

  const resolve = (): string => {
    const route = routeFromHash(env.getHash())
    return valid.has(route) ? route : options.defaultRoute
  }

  let currentRoute = options.defaultRoute

  const apply = (): void => {
    const next = resolve()
    currentRoute = next
    options.onChange(next)
  }

  env.onHashChange(apply)

  return {
    current: () => currentRoute,
    navigate: (route) => {
      if (!valid.has(route)) return
      // Writing the hash triggers onHashChange → apply(); if the hash is unchanged
      // (already on the route), apply() explicitly to stay idempotent.
      if (routeFromHash(env.getHash()) === route) {
        apply()
      } else {
        env.setHash(`#/${route}`)
      }
    },
    start: apply,
  }
}
