// @ts-nocheck
/**
 * Rabbit from cutout — DEV-ONLY tool. Turns the owner's BACKGROUND-REMOVED photo (a
 * transparent PNG) into a faithful pixel sprite: the alpha channel is the mask (no
 * segmentation to guess), so it auto-crops to the rabbit, area-downsamples to a small grid
 * (small pixels), and quantises the fur to the mascot palette.
 *
 * The photo is the owner's own pet and is processed locally — it is NOT committed; only the
 * derived pixel matrix ships. Prepare the input once with:
 *   sips --resampleWidth 512 <cutout>.png --out /tmp/titi_cut.png
 * Zero dependencies (Node zlib only).
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SRC = '/tmp/titi_cut.png'
const GRID_W = 72 // sprite width in pixels (height derived from the rabbit's aspect)
const SCALE = 6
const ALPHA_ON = 128 // a cell is opaque fur when its average alpha ≥ this

// Muted sable/marten palette (greyish warm brown + cream), matching the photo.
const PALETTE = {
  W: '#ece5d7', // cream highlight
  w: '#d8ccb8', // cream in shadow
  s: '#bdae98', // grey-cream transition
  t: '#a89a80', // light taupe
  T: '#877360', // taupe-brown
  B: '#655442', // brown
  D: '#42342789'.slice(0, 7), // deep brown (ear rim / deep shadow)
  E: '#241b14', // eye
}
PALETTE.D = '#423427'

// ── PNG decode (8-bit RGB/RGBA) ─────────────────────────────────────────────────
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (ch === 0) throw new Error('unsupported PNG colour type ' + colorType)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * ch, out = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  let p = 0
  for (let y = 0; y < height; y++) {
    const f = raw[p++]
    for (let x = 0; x < stride; x++) {
      const rb = raw[p++]
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
      let v
      switch (f) {
        case 0: v = rb; break
        case 1: v = rb + a; break
        case 2: v = rb + b; break
        case 3: v = rb + ((a + b) >> 1); break
        case 4: v = rb + paeth(a, b, c); break
        default: throw new Error('bad filter ' + f)
      }
      out[y * stride + x] = v & 0xff
    }
  }
  return { width, height, ch, data: out }
}

// ── PNG encode (RGBA) ───────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
function encodePng(cells, W, H, scale, bg) {
  const w = W * scale, h = H * scale, raw = Buffer.alloc((w * 4 + 1) * h), bgRgb = bg ? hexRgb(bg) : null
  for (let y = 0; y < h; y++) {
    const rs = y * (w * 4 + 1); raw[rs] = 0
    for (let x = 0; x < w; x++) {
      const cell = cells[Math.floor(y / scale) * W + Math.floor(x / scale)]
      let r, g, b, a
      if (cell && cell !== '.') { [r, g, b] = hexRgb(PALETTE[cell]); a = 255 }
      else if (bgRgb) { [r, g, b] = bgRgb; a = 255 }
      else { r = g = b = a = 0 }
      const o = rs + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ── Auto-crop to the alpha bounding box ─────────────────────────────────────────
const img = decodePng(readFileSync(SRC))
const A = (x, y) => (img.ch === 4 ? img.data[(y * img.width + x) * img.ch + 3] : 255)
let minX = img.width, minY = img.height, maxX = 0, maxY = 0
for (let y = 0; y < img.height; y++)
  for (let x = 0; x < img.width; x++)
    if (A(x, y) > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
const pad = 2
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
maxX = Math.min(img.width - 1, maxX + pad); maxY = Math.min(img.height - 1, maxY + pad)
const cropW = maxX - minX + 1, cropH = maxY - minY + 1
const GRID_H = Math.round((GRID_W * cropH) / cropW)

// ── Downsample (alpha-weighted average) + quantise ──────────────────────────────
const FUR = Object.entries(PALETTE)
function quantise(r, g, b) {
  let best = 'W', bd = Infinity
  for (const [k, hex] of FUR) {
    const [pr, pg, pb] = hexRgb(hex)
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (d < bd) { bd = d; best = k }
  }
  return best
}
const cells = new Array(GRID_W * GRID_H).fill('.')
for (let cy = 0; cy < GRID_H; cy++) {
  for (let cx = 0; cx < GRID_W; cx++) {
    const sx0 = minX + (cx / GRID_W) * cropW, sx1 = minX + ((cx + 1) / GRID_W) * cropW
    const sy0 = minY + (cy / GRID_H) * cropH, sy1 = minY + ((cy + 1) / GRID_H) * cropH
    let r = 0, g = 0, b = 0, aw = 0, asum = 0, n = 0
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
      for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
        const a = A(x, y), o = (y * img.width + x) * img.ch
        r += img.data[o] * a; g += img.data[o + 1] * a; b += img.data[o + 2] * a
        aw += a; asum += a; n++
      }
    }
    if (n === 0 || asum / n < ALPHA_ON) continue // transparent cell
    cells[cy * GRID_W + cx] = quantise(r / aw, g / aw, b / aw)
  }
}

// Despeckle: drop cells with no orthogonal fur neighbour.
{
  const idx = (x, y) => y * GRID_W + x
  const solid = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && cells[idx(x, y)] !== '.'
  const snap = cells.slice()
  const at = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && snap[idx(x, y)] !== '.'
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++)
    if (solid(x, y) && !at(x - 1, y) && !at(x + 1, y) && !at(x, y - 1) && !at(x, y + 1)) cells[idx(x, y)] = '.'
}

// ── Output ──────────────────────────────────────────────────────────────────────
mkdirSync('tools/_preview', { recursive: true })
writeFileSync('tools/_preview/titi-cutout-card.png', encodePng(cells, GRID_W, GRID_H, SCALE, '#fbf8f1'))
writeFileSync('tools/_preview/titi-cutout-ink.png', encodePng(cells, GRID_W, GRID_H, SCALE, '#20242e'))
const solid = cells.filter((c) => c !== '.').length
console.log(`grid ${GRID_W}×${GRID_H}, solid ${solid}/${cells.length} (${Math.round((100 * solid) / cells.length)}%)`)
console.log('const BASE = [')
for (let y = 0; y < GRID_H; y++) console.log(`  '${cells.slice(y * GRID_W, (y + 1) * GRID_W).join('')}',`)
console.log(']')
