import { describe, expect, it, vi } from 'vitest'

import { createRouter, defaultRouterEnv, routeFromHash, type RouterEnv } from '../src/ui/router.js'

/** A fake hash environment that records listeners so tests can drive hash changes. */
function fakeEnv(initial = ''): RouterEnv & { fire: () => void; hash: string } {
  const state = { hash: initial, cb: (): void => {} }
  return {
    get hash() {
      return state.hash
    },
    getHash: () => state.hash,
    setHash: (h: string) => {
      state.hash = h
      state.cb()
    },
    onHashChange: (cb) => {
      state.cb = cb
    },
    fire: () => state.cb(),
  }
}

const ROUTES = ['accueil', 'espace', 'transactions'] as const

describe('routeFromHash', () => {
  it('parses #/x and #x and blanks', () => {
    expect(routeFromHash('#/transactions')).toBe('transactions')
    expect(routeFromHash('#espace')).toBe('espace')
    expect(routeFromHash('')).toBe('')
    expect(routeFromHash('#/')).toBe('')
  })
})

describe('createRouter', () => {
  it('starts on the default route when the hash is empty', () => {
    const onChange = vi.fn()
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange, env: fakeEnv('') })
    router.start()
    expect(router.current()).toBe('accueil')
    expect(onChange).toHaveBeenCalledWith('accueil')
  })

  it('resolves the initial hash on start', () => {
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange: () => {}, env: fakeEnv('#/espace') })
    router.start()
    expect(router.current()).toBe('espace')
  })

  it('falls back to the default for an unknown hash', () => {
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange: () => {}, env: fakeEnv('#/nope') })
    router.start()
    expect(router.current()).toBe('accueil')
  })

  it('navigates and notifies on change', () => {
    const onChange = vi.fn()
    const env = fakeEnv('')
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange, env })
    router.start()
    onChange.mockClear()
    router.navigate('transactions')
    expect(router.current()).toBe('transactions')
    expect(onChange).toHaveBeenLastCalledWith('transactions')
    expect(env.hash).toBe('#/transactions')
  })

  it('ignores navigation to an unknown route', () => {
    const onChange = vi.fn()
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange, env: fakeEnv('') })
    router.start()
    onChange.mockClear()
    router.navigate('bogus')
    expect(router.current()).toBe('accueil')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reacts to external hash changes (back/forward)', () => {
    const onChange = vi.fn()
    const env = fakeEnv('')
    createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange, env })
    env.setHash('#/espace')
    expect(onChange).toHaveBeenLastCalledWith('espace')
  })

  it('is idempotent when navigating to the current route', () => {
    const onChange = vi.fn()
    const env = fakeEnv('#/espace')
    const router = createRouter({ routes: ROUTES, defaultRoute: 'accueil', onChange, env })
    router.start()
    onChange.mockClear()
    router.navigate('espace')
    expect(router.current()).toBe('espace')
    expect(onChange).toHaveBeenCalledWith('espace')
  })
})

describe('defaultRouterEnv', () => {
  it('throws when no window is available (node test env)', () => {
    const hasWindow = typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function'
    if (!hasWindow) {
      expect(() => defaultRouterEnv()).toThrow(/no window/i)
    } else {
      expect(true).toBe(true)
    }
  })
})
