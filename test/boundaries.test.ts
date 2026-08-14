import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Guards the local-first boundary: the browser UI must not pull in the connectors
 * (which handle API secrets) or the top-level barrel (which re-exports them). We enforce
 * this at the source-import level rather than relying on the bundler's tree-shaking.
 *
 * The file list is discovered dynamically, so every current and future module under
 * src/ui/ is covered automatically — no hand-maintained allow-list to drift.
 */
const uiDir = fileURLToPath(new URL('../src/ui', import.meta.url))

const uiFiles = readdirSync(uiDir, { recursive: true })
  .map((f) => String(f).replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.ts'))
  .sort()

function read(rel: string): string {
  return readFileSync(`${uiDir}/${rel}`, 'utf8')
}

describe('browser/connector boundary', () => {
  it('discovers the UI modules to guard', () => {
    expect(uiFiles.length).toBeGreaterThanOrEqual(4)
    for (const expected of ['main.ts', 'view-model.ts', 'render.ts', 'sprite/rabbit.ts']) {
      expect(uiFiles).toContain(expected)
    }
  })

  it.each(uiFiles)('%s does not import the top-level barrel', (file) => {
    // The barrel (src/index.ts) re-exports the connectors, so no UI file may import it.
    expect(read(file)).not.toMatch(/from\s+['"][^'"]*\/index\.js['"]/)
  })

  it.each(uiFiles)('%s does not import connectors or provider SDKs', (file) => {
    // Inspect import specifiers only, not comments/identifiers.
    expect(read(file)).not.toMatch(/from\s+['"][^'"]*(connectors|stripe|bridge)[^'"]*['"]/i)
  })
})
