import { describe, expect, it } from 'vitest'

import {
  RABBIT_FRAME_COUNT,
  RABBIT_H,
  RABBIT_PALETTE,
  RABBIT_W,
  TRANSPARENT,
  rabbitFrameMatrix,
  renderRabbitSVG,
  spriteRects,
} from '../src/ui/sprite/rabbit.js'

const HEX = /^#[0-9a-f]{6}$/i

describe('rabbit sprite — data integrity', () => {
  it('base frame is a full RABBIT_W × RABBIT_H matrix', () => {
    const m = rabbitFrameMatrix(0)
    expect(m).toHaveLength(RABBIT_H)
    for (const row of m) expect(row).toHaveLength(RABBIT_W)
  })

  it('palette maps every key to a valid hex colour and has no transparent entry', () => {
    expect(Object.keys(RABBIT_PALETTE).length).toBeGreaterThan(0)
    for (const hex of Object.values(RABBIT_PALETTE)) expect(hex).toMatch(HEX)
    expect(RABBIT_PALETTE[TRANSPARENT]).toBeUndefined()
  })

  it('every pixel in every frame is a known palette key or transparent', () => {
    const known = new Set([TRANSPARENT, ...Object.keys(RABBIT_PALETTE)])
    for (let f = 0; f < RABBIT_FRAME_COUNT; f++) {
      for (const row of rabbitFrameMatrix(f)) {
        for (const ch of row) expect(known.has(ch)).toBe(true)
      }
    }
  })

  it('uses several colours and is mostly non-empty (a real, detailed sprite)', () => {
    const used = new Set<string>()
    let solid = 0
    for (const row of rabbitFrameMatrix(0)) {
      for (const ch of row) {
        if (ch !== TRANSPARENT) {
          used.add(ch)
          solid++
        }
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(6) // white, two tans, two browns, eye, nose…
    expect(solid).toBeGreaterThan(RABBIT_W * RABBIT_H * 0.3)
  })

  it('has an eye with a glint in the neutral frame', () => {
    const flat = rabbitFrameMatrix(0).join('')
    expect(flat).toContain('E') // eye
    expect(flat).toContain('G') // glint
    expect(flat).toContain('P') // inner ear (pink) — proves the erect ear is drawn
  })
})

describe('rabbit sprite — frames', () => {
  it('exposes exactly three distinct frames', () => {
    expect(RABBIT_FRAME_COUNT).toBe(3)
    const svgs = [0, 1, 2].map((f) => renderRabbitSVG(f))
    expect(new Set(svgs).size).toBe(3)
  })

  it('the blink frame closes the eye (no E/G left)', () => {
    const base = rabbitFrameMatrix(0).join('')
    const blink = rabbitFrameMatrix(1).join('')
    expect(base).not.toBe(blink)
    expect(blink).not.toContain('E')
    expect(blink).not.toContain('G')
  })

  it('the ear-flick frame only changes the top (ear) rows', () => {
    const base = rabbitFrameMatrix(0)
    const ear = rabbitFrameMatrix(2)
    for (let y = 0; y < RABBIT_H; y++) {
      if (y < 8) continue // ear region may differ
      expect(ear[y]).toBe(base[y])
    }
    expect(ear.slice(0, 8).join('')).not.toBe(base.slice(0, 8).join(''))
  })

  it('returns a fresh matrix each call (mutation-safe)', () => {
    const a = rabbitFrameMatrix(0)
    a[0] = 'X'.repeat(RABBIT_W)
    expect(rabbitFrameMatrix(0)[0]).not.toBe(a[0])
  })

  it.each([-1, 3, 1.5, NaN, Infinity])('throws RangeError for invalid frame %s', (bad) => {
    expect(() => rabbitFrameMatrix(bad as number)).toThrow(RangeError)
    expect(() => renderRabbitSVG(bad as number)).toThrow(RangeError)
  })
})

describe('spriteRects — run-length merging', () => {
  it('merges equal runs per row and skips transparent pixels', () => {
    const rects = spriteRects(['.AAB', 'A..A', '....'])
    expect(rects).toEqual([
      { x: 1, y: 0, w: 2, key: 'A' },
      { x: 3, y: 0, w: 1, key: 'B' },
      { x: 0, y: 1, w: 1, key: 'A' },
      { x: 3, y: 1, w: 1, key: 'A' },
    ])
  })

  it('covers exactly the non-transparent pixels of the base frame', () => {
    const matrix = rabbitFrameMatrix(0)
    const solid = matrix.join('').split('').filter((c) => c !== TRANSPARENT).length
    const rects = spriteRects(matrix)
    expect(rects.reduce((sum, r) => sum + r.w, 0)).toBe(solid)
    for (const r of rects) expect(r.key).not.toBe(TRANSPARENT)
  })
})

describe('renderRabbitSVG — output', () => {
  it('emits a well-formed, accessible SVG with only palette fills', () => {
    const svg = renderRabbitSVG(0)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toMatch(/<title>TITI(?:&#39;|')relire<\/title>/) // apostrophe may be escaped
    expect(svg).toContain('viewBox="0 0 32 30"')
    expect(svg).toContain('<rect')
    // No transparent pixels leaked as undefined/empty fills.
    expect(svg).not.toContain('undefined')
    expect(svg).not.toContain('fill=""')
    // Exactly one rect per merged run.
    const rectCount = (svg.match(/<rect/g) ?? []).length
    expect(rectCount).toBe(spriteRects(rabbitFrameMatrix(0)).length)
  })

  it('is deterministic', () => {
    expect(renderRabbitSVG(0)).toBe(renderRabbitSVG(0))
    expect(renderRabbitSVG(2)).toBe(renderRabbitSVG(2))
  })

  it('fixes the size only when pixel is given', () => {
    const svg = renderRabbitSVG(0)
    const openTag = svg.slice(0, svg.indexOf('>') + 1) // root <svg …> only
    expect(openTag).not.toContain('width=')
    const sized = renderRabbitSVG(0, { pixel: 4 })
    expect(sized).toContain(`width="${RABBIT_W * 4}"`)
    expect(sized).toContain(`height="${RABBIT_H * 4}"`)
  })

  it('draws a background rect when asked', () => {
    const svg = renderRabbitSVG(0, { background: '#123456' })
    expect(svg).toContain(`<rect x="0" y="0" width="${RABBIT_W}" height="${RABBIT_H}" fill="#123456"/>`)
  })

  it('escapes a hostile title (no raw markup injected)', () => {
    const svg = renderRabbitSVG(0, { title: '<script>"&\'' })
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('aria-label="&lt;script&gt;&quot;&amp;&#39;"')
  })

  it('adds a class when provided', () => {
    expect(renderRabbitSVG(0, { className: 'logo' })).toContain('class="logo"')
  })
})
