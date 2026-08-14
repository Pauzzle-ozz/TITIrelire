// @ts-nocheck
/**
 * Rabbit studio — DEV-ONLY tool (not shipped, not part of the app or test build).
 *
 * Composes the TI'TIrelire mascot — a dwarf *lionhead* rabbit seen in PROFILE, facing
 * left (erect ear, fluffy mane), matching the owner's photo — from pixel shapes, then:
 *   1. rasterises each frame to a scaled PNG so the art can be eyeballed against the photo;
 *   2. prints the frozen matrix (rows of palette keys) to paste into src/ui/sprite/rabbit.ts.
 *
 * Zero dependencies: the PNG encoder uses Node's built-in zlib. Run with `node`.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

// ── Palette ───────────────────────────────────────────────────────────────────
// Keys are single chars so a frame is a compact array of equal-length strings.
// '.' is transparent. Colours are sampled to match the photo: warm whites, fauve
// tans, warm browns, a dark eye and a dusty-pink nose.
const PALETTE = {
  '.': null, // transparent
  D: '#3a2b1f', // outline (soft dark brown)
  B: '#8f5c34', // brown  (fauve foncé — back / brow / ear patches)
  T: '#c08a56', // tan    (fauve — main patches)
  t: '#ddb98a', // light tan (mane highlights, patch edges)
  W: '#f7f3ea', // warm white (face / body)
  w: '#e6ddcb', // shadow white (underside)
  E: '#241c15', // eye
  G: '#ffffff', // eye glint
  N: '#cf8f88', // nose (dusty pink)
  P: '#eeb8b0', // inner ear (pale pink)
}

const W = 32
const H = 30
const SCALE = 18

// ── Seeded PRNG (reproducible fuzz for the mane edge) ───────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Grid + drawing helpers ──────────────────────────────────────────────────────
function blankGrid() {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => '.'))
}
const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H
function plot(g, x, y, key) {
  x = Math.round(x)
  y = Math.round(y)
  if (inBounds(x, y)) g[y][x] = key
}
function fillEllipse(g, cx, cy, rx, ry, key, pred = () => true) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1 && pred(x, y)) plot(g, x, y, key)
    }
  }
}
function line(g, x0, y0, x1, y1, key) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    plot(g, x0, y0, key)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}
/** Add a 1px dark outline around the whole silhouette (any non-transparent pixel). */
function outline(g, key) {
  const solid = (x, y) => inBounds(x, y) && g[y][x] !== '.'
  const out = g.map((r) => r.slice())
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== '.') continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ||
          solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1)) {
        out[y][x] = key
      }
    }
  }
  return out
}

// ── Compose the profile lionhead ────────────────────────────────────────────────
// A head-and-chest PORTRAIT facing left, like the photo: the fluffy lionhead mane is
// the star (tufted ring), with one erect ear, a defined muzzle/nose and a round eye.
const CX = 15 // mane centre x
const CY = 15 // mane centre y

/** Radial fur strands → a fluffy, tufted silhouette (not a smooth ball). */
function mane(g, rnd) {
  fillEllipse(g, CX, CY, 8.5, 8, 'T') // dense inner ruff
  fillEllipse(g, CX, CY, 8.5, 8, 't', (x, y) => (x * 2 + y) % 5 === 0) // highlight dappling
  for (let a = -Math.PI; a < Math.PI; a += 0.16) {
    const len = 9.2 + rnd() * 2.6 // varying strand length = fluff
    const tip = len - 1.4
    for (let r = 6.5; r <= len; r += 0.6) {
      const x = CX + Math.cos(a) * r * 1.02
      const y = CY + Math.sin(a) * r * 0.94
      plot(g, x, y, r >= tip ? (rnd() > 0.5 ? 'B' : 't') : 'T')
    }
  }
}

/** Remove fully isolated specks (no orthogonal neighbour) for a cleaner silhouette. */
function despeckle(g) {
  const solid = (x, y) => inBounds(x, y) && g[y][x] !== '.'
  const snapshot = g.map((r) => r.slice())
  const at = (x, y) => inBounds(x, y) && snapshot[y][x] !== '.'
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue
      if (!at(x - 1, y) && !at(x + 1, y) && !at(x, y - 1) && !at(x, y + 1)) g[y][x] = '.'
    }
  }
}

function compose() {
  const rnd = mulberry32(20260814)
  let g = blankGrid()

  // Chest / shoulder fluff at the bottom, grounding the portrait (kept low + rounded).
  fillEllipse(g, 15, 27, 7.5, 3.4, 'T')
  fillEllipse(g, 14, 28, 6, 2.6, 'W')

  mane(g, rnd)

  // Ear — erect, drawn ON TOP of the mane so it reads clearly, with a slight backward
  // (right) lean. Outer tan, darker back edge, thin pale-pink inner slit.
  fillEllipse(g, 18, 6, 2.3, 7, 'T')
  fillEllipse(g, 18.8, 6, 1.5, 6.4, 'B', (x) => x >= 18.6) // darker back of the ear
  fillEllipse(g, 17.3, 6.5, 0.85, 4.4, 'P') // inner ear (thin slit)
  // A couple of tan tufts at the ear base so it grows out of the ruff, not floats.
  plot(g, 16, 11, 'T'); plot(g, 20, 10, 'B'); plot(g, 19, 12, 'T')

  // Face — warm-white oval, pushed left so the muzzle clears the ruff.
  fillEllipse(g, 12, 16, 7, 6.6, 'W')
  fillEllipse(g, 12, 19, 6, 4, 'w') // soft jaw shadow
  // Muzzle — snout poking out to the left, past the mane.
  fillEllipse(g, 6, 17, 3.2, 2.6, 'W')

  // Fauve markings over the brow + ear base and a cheek patch, like the photo.
  fillEllipse(g, 14, 10, 4.5, 3, 'T', (x, y) => y <= 12)
  fillEllipse(g, 15, 9, 3, 2, 'B', (x, y) => y <= 11)
  fillEllipse(g, 15, 18, 3.5, 3, 'T', (x, y) => x >= 14) // cheek/side patch

  // Eye — dark almond with a single glint pixel inside.
  fillEllipse(g, 10, 14, 1.7, 2, 'E')
  plot(g, 10, 13, 'G')

  // Nose + mouth at the muzzle tip.
  plot(g, 3, 16, 'N'); plot(g, 4, 16, 'N'); plot(g, 3, 17, 'N'); plot(g, 4, 17, 'N')
  line(g, 4, 18, 5, 20, 'D') // philtrum
  line(g, 5, 20, 7, 20, 'D') // mouth

  // Whiskers — three subtle strands fanning left from the muzzle.
  line(g, 3, 15, -1, 12, 'w')
  line(g, 3, 16, -1, 16, 'w')
  line(g, 4, 18, -1, 20, 'w')

  despeckle(g)
  g = outline(g, 'D')
  return g
}

// ── PNG encoder (RGBA, zlib) ────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return (buf) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
})()
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body), 0)
  return Buffer.concat([len, body, crc])
}
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function encodePng(grid, scale, bg /* '#rrggbb' | null */) {
  const w = W * scale, h = H * scale
  const raw = Buffer.alloc((w * 4 + 1) * h)
  const bgRgb = bg ? hexToRgb(bg) : null
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const key = grid[Math.floor(y / scale)][Math.floor(x / scale)]
      const hex = PALETTE[key]
      let r, gg, b, a
      if (hex) { [r, gg, b] = hexToRgb(hex); a = 255 }
      else if (bgRgb) { [r, gg, b] = bgRgb; a = 255 }
      else { r = gg = b = a = 0 }
      const o = rowStart + 1 + x * 4
      raw[o] = r; raw[o + 1] = gg; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Animation frame variants (small, cheap, lively) ─────────────────────────────
/** Eyes-closed blink: replace the eye + glint with face-white and draw a soft lid. */
function blink(base) {
  const g = base.map((r) => r.slice())
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (g[y][x] === 'E' || g[y][x] === 'G') g[y][x] = 'W'
  line(g, 8, 14, 12, 14, 'D') // closed lid
  return g
}
/** Ear-flick: perk the ear tip up by one row for a bit of life. */
function earFlick(base) {
  const g = base.map((r) => r.slice())
  // Nudge the top rows of the ear column up by 1px (tip perks higher).
  for (let y = 0; y < 8; y++)
    for (let x = 16; x <= 21; x++) {
      const below = g[y + 1] && g[y + 1][x]
      if (below && below !== '.' && (g[y][x] === '.' || g[y][x] === 'D')) g[y][x] = below === 'D' ? 'T' : below
    }
  return g
}
/** Pixel-level diff of `variant` vs `base` → an overlay literal [x, y, 'k']. */
function diff(base, variant) {
  const out = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (variant[y][x] !== base[y][x]) out.push([x, y, variant[y][x]])
  return out
}

// ── Run ─────────────────────────────────────────────────────────────────────────
const grid = compose()
const frameBlink = blink(grid)
const frameEar = earFlick(grid)
mkdirSync('tools/_preview', { recursive: true })
writeFileSync('tools/_preview/rabbit-card.png', encodePng(grid, SCALE, '#fbf7ef'))
writeFileSync('tools/_preview/rabbit-ink.png', encodePng(grid, SCALE, '#20242e'))
writeFileSync('tools/_preview/rabbit-alpha.png', encodePng(grid, SCALE, null))
writeFileSync('tools/_preview/rabbit-blink.png', encodePng(frameBlink, SCALE, '#fbf7ef'))
writeFileSync('tools/_preview/rabbit-ear.png', encodePng(frameEar, SCALE, '#fbf7ef'))

const emitOverlay = (name, d) =>
  `const ${name} = [${d.map(([x, y, k]) => `[${x},${y},'${k}']`).join(', ')}]`

console.log(`\n// ${W}x${H} — paste into src/ui/sprite/rabbit.ts`)
console.log(`export const RABBIT_W = ${W}`)
console.log(`export const RABBIT_H = ${H}`)
console.log('const BASE = [')
for (const row of grid) console.log(`  '${row.join('')}',`)
console.log(']')
console.log(emitOverlay('BLINK', diff(grid, frameBlink)))
console.log(emitOverlay('EAR_FLICK', diff(grid, frameEar)))
