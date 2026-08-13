import { describe, expect, it } from 'vitest'

import { NAME, VERSION } from '../src/index.js'

describe('project scaffold', () => {
  it('exposes the canonical project name', () => {
    expect(NAME).toBe("TI'TIrelire")
  })

  it('exposes a semver-looking version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
