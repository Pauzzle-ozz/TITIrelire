/**
 * TITI'relire mascot — the owner's own dwarf rabbit, in profile (facing right, both ears up,
 * the sable-and-cream broken coat). It is the app's logo, favicon and loading animation.
 *
 * The art is *data*: a pixel matrix of palette keys. It was produced by pixelating the
 * owner's background-removed photo (`tools/rabbit-from-cutout.mjs` — the alpha channel is the
 * mask, so it is a faithful, deterministic downsample, not a redrawing) and frozen here as the
 * single source of truth. The raw photo is not committed; only this derived matrix ships.
 *
 * Rendering is pure: {@link renderRabbitSVG} turns the matrix into a crisp, scalable SVG string
 * by merging equal horizontal pixels into run-length `<rect>`s (compact, no anti-alias seams).
 * The loading "hop" is CSS (see the app stylesheet), disabled under `prefers-reduced-motion`.
 */

/** Sprite dimensions, in pixels. */
export const RABBIT_W = 72
export const RABBIT_H = 47

/**
 * Palette: single-char key → CSS colour. `'.'` is transparent and never emitted.
 * A muted sable/marten range (greyish warm browns) plus cream, sampled from the photo.
 */
export const RABBIT_PALETTE: Readonly<Record<string, string>> = {
  W: '#ece5d7', // cream highlight
  w: '#d8ccb8', // cream in shadow
  s: '#bdae98', // grey-cream transition
  t: '#a89a80', // light taupe
  T: '#877360', // taupe-brown
  B: '#655442', // brown
  D: '#423427', // deep brown (ear rim / deep shadow)
  E: '#241b14', // darkest fur / eye
}

/** Transparent key — skipped by the renderer. */
export const TRANSPARENT = '.'

// The sprite: one faithful pose. Every row is exactly RABBIT_W chars.
const BASE: readonly string[] = [
  '......................................................tT................',
  '................................................Tt...BDD................',
  '...............................................BDBB.BBDEE...............',
  '...............................................BDBBBBBDEE...............',
  '...............................................BDBBBBTBDDD..............',
  '...............................................BDBBBBTBBBB..............',
  '...............................................BDBBBBBTTTT..............',
  '...............................................BDDBBBDTTTTT.............',
  '...............................................BDDDBBDDBTTt.............',
  '.......................ttttsttttttt............TDDDDBDDDDBT.............',
  '.....................tttTttTtTTTtttttttts....sstDDDDDDEEEDTts...........',
  '..................sttTTTTTTTBBTTTTTTTTTtswwwssttBDDDDDEEEDBTw...........',
  '................sstTTTBBBBBBBBDDBBBBTBTttswwwsstTDDDDDEEEDDBtw..........',
  '...............stTBTBBBBBDDDDDDDDDDDDBTTTttssstTBBDDDDEEEEEDBtww........',
  '.............stTBBBBDDDDDDDDDDDDDDDDDBBTTTTttttTBBDDDDEEEEEEDBTww.......',
  '............ttBBDDDDDDDDDDDDDDDDDDDEEDDBTTTTTTtTBBBEDEEEEEEEEEDTww......',
  '...........tTBBDDDDDDDDDDDEEEEEEEEEEEEDBBTTTTTtTTTTDEEEEEEEEEEEDtw......',
  '..........tTDDDDDDDDEEDDDDEEEEEEEEEEEDDBBTTTTTTTtBDEEEEEEEEEEEDDBsw.....',
  '.........TTBDDDDDDDEDDDDDDDEEEEEEEEEEDBBBBBTTTTTsTDEEEEEEEEEEEEDDTsw....',
  '........TTBDDDDDDDDDDDDDDDDDEEEEEEEEDDBBBBTBBBTTTTBEEEEEEEEEEEEEEBsw....',
  '........TBDDDDDDDDDDDDDDDDDDDDDDEEEEDDBBBBBBBBBBTTBBDDDEEEEEEEEEEDtsw...',
  '.......TBDDDDDDDDDDDDDDDDBDDDDDDDEEEDDBTTTBTTTBTBBBTBBBBDEEEEEEEDDTssw..',
  '.......BDDDDDDDDDDDDDDDDDBBDDDDDDDEEDDBBTTTTTTTTTBTTBBBBDEEEEEDDEEBtsw..',
  '......TDDDDDDDDEDEDDDDDDDDDDDDDDDDDDDDBBTTTTTTTTTTTTTtTDEEEDEDDDDDBtsw..',
  '......BDDDDDDDEEEEEDDDDEDDDDDDDDDDDDDBBBTTTTTTTTTTTTTTBBDEEDDDDDDBBTsww.',
  '......DDDDDDEDEEEEEEEDDDEDDDDDDDDEDDDBBTTTTTTTTTTTTTTTTTBDEDDDDBTtTTssw.',
  '.....BDDDDDDEEEEEEDEEEDEDDDDDDDDDEDDDBBTTTTTTTTTTTTTTTTTBBDDBBBTTtttsssw',
  '.....DDDDDDDDEDEDEDEDDDDDDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTBBBDDBBTtsstsssw',
  '....TDDDDDDDDDDEDDDEDDDDEDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTTTTBBDBTttsssss.',
  '....TDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBTTTTTTTTTTTTBTTTTTTTTBBBTttssssw.',
  '....BDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTTTTTTTTttssww..',
  '....BDDDDDDDDDDDDDDDDDEDEDDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTTTTTTTttsswww..',
  '....BDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTTTTTttttssss...',
  '....BBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBTTTTTTTTTTTTTTTTTTTTTTtttsss.....',
  '...TBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBBTTTTTTTTTTTTTTTTTTTtttsss......',
  '..tTBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBBTTTTTTTTTTTTTTTTTTtttssww......',
  '.TTBBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBBBTTTTTTTTTTTTTTTTttttsww.......',
  '..TTBBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBBBTTTTTTTTTTTTTTTTttssww.......',
  '...TBDDDDDDDDDDDEDDDDDDDDDDDDDDDDDDDDDDBBBBBTTTTTTTTTTTTTTTttsww........',
  '....BDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBBBBBBTTTTTTTTTTTTTttssww........',
  '.....BBDDDDDDDDDDDDEDDDDDDEDDDDDDDDDDDDBBBBBBTTTTTTTTTTTTTttssww........',
  '......BDDDDDDDDDDDDDDDEEDDEEEEDDDDDDDDDBBBBBBBBBBTTTTTTTTTttsww.........',
  '........DDDDDDDDDDDDDDEEDEEEEEEDDDDDDDDDBBBBBBBBBBBTTTTTTTttsww.........',
  '..........DDDDEDDDDDDEEEEDEEEEEEEDDDDDDDBBBBBBBBBBBBBTTTTttssw..........',
  '............EEEEEDDEEEEEEEEEEEEEEEEEDDDDBBBBBBBBBBBBBBTTTTtsw...........',
  '...................EEEEEEEEE......EEEEDDDDDDBBBBBBDBBBBBBTt.............',
  '.........................................DDDDDDDDDDDD...................',
]

/** The sprite has a single faithful pose (the loading motion is a CSS hop). */
export const RABBIT_FRAME_COUNT = 1

/**
 * Returns the sprite's pixel matrix. `frame` exists for API symmetry; only 0 is valid.
 *
 * @throws RangeError if `frame` is not 0.
 */
export function rabbitFrameMatrix(frame = 0): string[] {
  if (frame !== 0) throw new RangeError(`rabbit frame out of range: ${frame}`)
  return BASE.slice()
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

/** Escapes text placed inside the SVG `<title>`/attributes. */
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
 * Renders the rabbit as a self-contained, crisp SVG string. Deterministic: the same options
 * always yield byte-identical output.
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
