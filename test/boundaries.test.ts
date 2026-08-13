import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * Guards the local-first boundary: the browser UI must not pull in the connectors
 * (which handle API secrets). We enforce this at the source-import level rather than
 * relying on the bundler's tree-shaking to drop connector code.
 */
function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('browser/connector boundary', () => {
  const uiFiles = ['../src/ui/main.ts', '../src/ui/view-model.ts']

  it.each(uiFiles)('%s does not import the top-level barrel', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/from ['"]\.\.\/index\.js['"]/)
  })

  it.each(uiFiles)('%s does not import connectors or provider SDKs', (file) => {
    const source = read(file)
    // Only inspect import specifiers, not comments/identifiers.
    expect(source).not.toMatch(/from\s+['"][^'"]*(connectors|stripe)[^'"]*['"]/i)
  })
})
