/**
 * Loading animation: cycles the rabbit sprite's frames inside a container to bring the
 * mascot to life (blink, ear-flick) while the app boots or recomputes.
 *
 * Motion policy: frame cycling is *paused* when the user prefers reduced motion — the
 * mascot then sits on the neutral frame. The gentle vertical "hop" is pure CSS (see the
 * app stylesheet) and is likewise disabled under `prefers-reduced-motion`, so this module
 * stays DOM-only and easy to unit-test with fake timers.
 */
import { RABBIT_FRAME_COUNT, renderRabbitSVG } from './rabbit.js'

/** Default idle loop: mostly neutral, with an occasional blink and ear-flick. */
export const RABBIT_LOOP: readonly number[] = [0, 0, 1, 0, 0, 2]

/** Milliseconds each frame is held. */
const DEFAULT_FRAME_MS = 220

export interface RabbitAnimatorOptions {
  /** Frame hold time in ms. Default 220. */
  frameMs?: number
  /** Frame play sequence (indices into the sprite frames). Default {@link RABBIT_LOOP}. */
  sequence?: readonly number[]
  /** Force the reduced-motion branch. Default: the `prefers-reduced-motion` media query. */
  reducedMotion?: boolean
  /** Sprite pixel size passed to the renderer. */
  pixel?: number
  /** Accessible title for the sprite. */
  title?: string
  /** Class added to each rendered `<svg>`. */
  className?: string
}

/** True when the environment reports a reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Drives a rabbit loading animation inside `container`. Pre-renders every frame once, then
 * swaps the container's markup on a timer. Idempotent start/stop; safe to destroy.
 */
export class RabbitAnimator {
  private readonly container: HTMLElement
  private readonly sequence: readonly number[]
  private readonly frames: readonly string[]
  private readonly frameMs: number
  private readonly reduced: boolean
  private index = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(container: HTMLElement, opts: RabbitAnimatorOptions = {}) {
    this.container = container
    this.sequence = opts.sequence ?? RABBIT_LOOP
    if (this.sequence.length === 0) throw new RangeError('sequence must not be empty')
    for (const f of this.sequence) {
      if (!Number.isInteger(f) || f < 0 || f >= RABBIT_FRAME_COUNT) {
        throw new RangeError(`sequence frame out of range: ${f}`)
      }
    }
    this.frameMs = opts.frameMs ?? DEFAULT_FRAME_MS
    this.reduced = opts.reducedMotion ?? prefersReducedMotion()
    // Pre-render each frame in the sequence (deterministic; cheap).
    const render = (f: number): string =>
      renderRabbitSVG(f, {
        ...(opts.pixel !== undefined ? { pixel: opts.pixel } : {}),
        ...(opts.title !== undefined ? { title: opts.title } : {}),
        ...(opts.className !== undefined ? { className: opts.className } : {}),
      })
    this.frames = this.sequence.map(render)
    this.paint(0)
  }

  private paint(i: number): void {
    // Safe innerHTML: `frames` are our own deterministic SVG strings built from a fixed
    // palette and frozen matrix. The only caller-supplied values (title, className) are
    // escaped by renderRabbitSVG (escapeXml) before they reach the markup.
    this.container.innerHTML = this.frames[i]!
  }

  /** Starts cycling. No-op when already running, reduced-motion, or single-frame. */
  start(): this {
    if (this.timer !== null || this.reduced || this.sequence.length <= 1) return this
    this.timer = setInterval(() => {
      this.index = (this.index + 1) % this.sequence.length
      this.paint(this.index)
    }, this.frameMs)
    return this
  }

  /** Stops cycling, leaving the current frame in place. */
  stop(): this {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    return this
  }

  /** Stops and clears the container. */
  destroy(): void {
    this.stop()
    this.container.innerHTML = ''
  }

  /** Whether the frame timer is currently running. */
  isRunning(): boolean {
    return this.timer !== null
  }

  /** The sprite frame index currently shown. */
  get currentFrame(): number {
    return this.sequence[this.index]!
  }
}

/** Convenience: construct an animator and start it. */
export function mountRabbit(container: HTMLElement, opts: RabbitAnimatorOptions = {}): RabbitAnimator {
  return new RabbitAnimator(container, opts).start()
}
