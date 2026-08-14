/**
 * TITI'relire mascot — a dwarf *lionhead* rabbit in profile, facing left (erect ear,
 * fluffy mane), drawn to match the owner's photo. It is the app's logo, favicon and the
 * frame source for the loading animation.
 *
 * The art is *data*: a pixel matrix of palette keys, kept deterministic and DOM-free so it
 * renders identically on the server, in the browser and in tests. The matrices were
 * authored with `tools/rabbit-studio.mjs` (a dev-only tool that also rasterises them to PNG
 * for visual review) and frozen here as the single source of truth.
 *
 * Rendering is pure: {@link renderRabbitSVG} turns a frame into a crisp, scalable SVG string
 * by merging equal horizontal pixels into run-length `<rect>`s (compact, no anti-alias seams).
 */

/** Sprite dimensions, in pixels. */
export const RABBIT_W = 32
export const RABBIT_H = 30

/**
 * Palette: single-char key → CSS colour. `'.'` is transparent and never emitted.
 * Sampled from the photo: warm whites, fauve tans, warm browns, a dark eye, a dusty nose.
 */
export const RABBIT_PALETTE: Readonly<Record<string, string>> = {
  D: '#3a2b1f', // outline (soft dark brown)
  B: '#8f5c34', // brown  (fauve foncé — back / brow / ear)
  T: '#c08a56', // tan    (fauve — main patches)
  t: '#ddb98a', // light tan (mane highlights)
  W: '#f7f3ea', // warm white (face / body)
  w: '#e6ddcb', // shadow white (underside)
  E: '#241c15', // eye
  G: '#ffffff', // eye glint
  N: '#cf8f88', // nose (dusty pink)
  P: '#eeb8b0', // inner ear (pale pink)
}

/** Transparent key — skipped by the renderer. */
export const TRANSPARENT = '.'

// Base frame: the neutral portrait. Every row is exactly RABBIT_W chars.
const BASE: readonly string[] = [
  '................DTTBD...........',
  '................DTTBD...........',
  '...............DDTTBDD..........',
  '...............DTPTBBD..........',
  '...........DDDDDTPTBBD..........',
  '.........DDDtDDtTPPBBDD.........',
  '......DDDDBtTDDBTPPBBBD.........',
  '......DBDtDTTDTBTPPBBDD.........',
  '......DtBtTTTBBBBBPBBBDDDD......',
  '......DtTTTTBBBBBBBBBDDDtD......',
  '.....DDBtTTTTBBBBBTBBtDBtD......',
  '...DDDtTWWTTTTTBTTTBTTTDtD......',
  'DDDDBBTWWWETTTTTTTTTTTTBDDD.....',
  'wwDDBTWWWEGEWWWWWWWTTTTTtBD.....',
  'DDDDDTWWWEEEWWWWWWWTTTTBBtD.....',
  'DDDwWWWWWEEEwWWTWWWTtTTTTDDDD...',
  'wwwwNWWWWwEwwwTTTTWWTTTTDTBBD...',
  'DDDNNWWWWWwwwwTTTTTtTTTBBDDDD...',
  'DDDwwWWWWwwwwwTTTTTTTTTTBD......',
  'DwwDWDWWWwwwwwTTTTTTTTTTDD......',
  'DDDDDDDDwwwwwwTTTTTTTttBBD......',
  '....DDDwwwwwwwwTwwTTTTDDDD......',
  '......DDtwwwwwwwTTtTtTtD........',
  '.......DtDBBwBTTTTBDBDtD........',
  '.......DDDDBttBTBtTDDDDD........',
  '.......DDTTTTTtTTTtTTTDD........',
  '.......DTTTWWWWWWWTTTTTD........',
  '.......DTWWWWWWWWWWWTTTD........',
  '.......DWWWWWWWWWWWWWTTD........',
  '.......DDWWWWWWWWWWWTTDD........',
]

/** A per-frame pixel override: `[x, y, key]`. */
type Overlay = readonly (readonly [number, number, string])[]

// Blink: eye + glint become face-white with a soft closed lid.
const BLINK: Overlay = [
  [10, 12, 'W'], [9, 13, 'W'], [10, 13, 'W'], [11, 13, 'W'],
  [8, 14, 'D'], [9, 14, 'D'], [10, 14, 'D'], [11, 14, 'D'], [12, 14, 'D'],
  [9, 15, 'W'], [10, 15, 'W'], [11, 15, 'W'], [10, 16, 'W'],
]

// Ear-flick: the ear tip perks up by one row.
const EAR_FLICK: Overlay = [
  [16, 0, 'T'], [20, 0, 'T'], [16, 1, 'T'], [20, 1, 'T'], [21, 1, 'T'], [16, 2, 'T'],
  [20, 2, 'B'], [21, 2, 'T'], [21, 3, 'T'], [21, 4, 'T'], [21, 5, 'B'], [21, 7, 'B'],
]

// Distinct frames, in canonical order. The animator decides the *play* sequence.
const OVERLAYS: readonly Overlay[] = [[], BLINK, EAR_FLICK]

/** Number of distinct sprite frames (0 = neutral, 1 = blink, 2 = ear-flick). */
export const RABBIT_FRAME_COUNT = OVERLAYS.length

/**
 * Builds the pixel matrix for a frame (base with its overlay applied).
 *
 * @throws RangeError if `frame` is not an integer in `[0, RABBIT_FRAME_COUNT)`.
 */
export function rabbitFrameMatrix(frame = 0): string[] {
  if (!Number.isInteger(frame) || frame < 0 || frame >= OVERLAYS.length) {
    throw new RangeError(`rabbit frame out of range: ${frame}`)
  }
  const rows = BASE.map((r) => r.split(''))
  for (const [x, y, key] of OVERLAYS[frame]!) rows[y]![x] = key
  return rows.map((r) => r.join(''))
}

/** One merged horizontal run of identical, non-transparent pixels. */
export interface SpriteRect {
  x: number
  y: number
  /** Run length (number of pixels merged). */
  w: number
  /** Palette key (never {@link TRANSPARENT}). */
  key: string
}

/**
 * Merges each row into run-length rectangles, skipping transparent pixels. Pure and
 * palette-agnostic, so it can be unit-tested on any matrix.
 */
export function spriteRects(matrix: readonly string[]): SpriteRect[] {
  const rects: SpriteRect[] = []
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y]!
    let x = 0
    while (x < row.length) {
      const key = row[x]!
      if (key === TRANSPARENT) {
        x++
        continue
      }
      let run = 1
      while (x + run < row.length && row[x + run] === key) run++
      rects.push({ x, y, w: run, key })
      x += run
    }
  }
  return rects
}

/** Escapes text placed inside the SVG `<title>`. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RabbitRenderOptions {
  /** If set, fixes the SVG to `RABBIT_W*pixel × RABBIT_H*pixel`. Otherwise size via CSS. */
  pixel?: number
  /** Extra class on the root `<svg>`. */
  className?: string
  /** Accessible name (used as `<title>` + `aria-label`). Default: the project name. */
  title?: string
  /** Optional background fill (hex) drawn behind the sprite. */
  background?: string
}

/**
 * Renders a rabbit frame as a self-contained, crisp SVG string. Deterministic: the same
 * frame + options always yields byte-identical output.
 *
 * @throws RangeError if `frame` is out of range (see {@link rabbitFrameMatrix}).
 */
export function renderRabbitSVG(frame = 0, opts: RabbitRenderOptions = {}): string {
  const title = opts.title ?? "TITI'relire"
  const rects = spriteRects(rabbitFrameMatrix(frame))

  const size =
    opts.pixel !== undefined
      ? ` width="${RABBIT_W * opts.pixel}" height="${RABBIT_H * opts.pixel}"`
      : ''
  const cls = opts.className !== undefined ? ` class="${escapeXml(opts.className)}"` : ''
  const bg =
    opts.background !== undefined
      ? `<rect x="0" y="0" width="${RABBIT_W}" height="${RABBIT_H}" fill="${opts.background}"/>`
      : ''
  const body = rects
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${RABBIT_PALETTE[r.key]}"/>`)
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RABBIT_W} ${RABBIT_H}"${size}${cls}` +
    ` role="img" aria-label="${escapeXml(title)}" shape-rendering="crispEdges">` +
    `<title>${escapeXml(title)}</title>${bg}${body}</svg>`
  )
}
