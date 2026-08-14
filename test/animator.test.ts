// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RABBIT_LOOP,
  RabbitAnimator,
  mountRabbit,
  prefersReducedMotion,
} from '../src/ui/sprite/animator.js'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('RabbitAnimator', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // The DOM re-serialises SVG, so we assert on stable, semantic signals rather than
  // byte-equal markup: the eye colour (#241c15) appears only in the open-eyed neutral
  // frame and is removed by the blink.
  const EYE = '241c15'

  it('paints the neutral frame on construction', () => {
    const el = container()
    new RabbitAnimator(el, { reducedMotion: true })
    expect(el.querySelector('svg')).not.toBeNull()
    expect(el.querySelectorAll('rect').length).toBeGreaterThan(0)
    expect(el.innerHTML).toContain(EYE) // eye open → neutral frame
  })

  it('cycles through the sequence on the timer and wraps around', () => {
    const el = container()
    const seq = [0, 1, 0, 2]
    const a = new RabbitAnimator(el, { sequence: seq, frameMs: 100, reducedMotion: false }).start()
    expect(a.isRunning()).toBe(true)
    const seen = [a.currentFrame]
    for (let i = 0; i < seq.length; i++) {
      vi.advanceTimersByTime(100)
      seen.push(a.currentFrame)
    }
    expect(seen).toEqual([0, 1, 0, 2, 0]) // full loop, back to start
    a.stop()
  })

  it('swaps frame markup as it advances (neutral → blink → neutral)', () => {
    const el = container()
    const a = new RabbitAnimator(el, { sequence: [0, 1], frameMs: 50, reducedMotion: false }).start()
    expect(el.innerHTML).toContain(EYE) // neutral: eye open
    const neutral = el.innerHTML
    vi.advanceTimersByTime(50)
    expect(el.innerHTML).not.toContain(EYE) // blink: eye closed
    expect(el.innerHTML).not.toBe(neutral)
    vi.advanceTimersByTime(50)
    expect(el.innerHTML).toContain(EYE) // back to neutral
    a.stop()
  })

  it('freezes on the neutral frame under reduced motion', () => {
    const el = container()
    const a = new RabbitAnimator(el, { frameMs: 100, reducedMotion: true }).start()
    expect(a.isRunning()).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(a.currentFrame).toBe(0)
    expect(el.innerHTML).toContain(EYE) // still the neutral frame
  })

  it('start is idempotent — no duplicate timers', () => {
    const el = container()
    const a = new RabbitAnimator(el, { sequence: [0, 1], frameMs: 100, reducedMotion: false })
    a.start()
    a.start()
    vi.advanceTimersByTime(100)
    expect(a.currentFrame).toBe(1) // advanced once, not twice
    a.stop()
    expect(a.isRunning()).toBe(false)
  })

  it('stop halts advancement and destroy clears the container', () => {
    const el = container()
    const a = new RabbitAnimator(el, { sequence: [0, 1, 2], frameMs: 100, reducedMotion: false }).start()
    vi.advanceTimersByTime(100)
    expect(a.currentFrame).toBe(1)
    a.stop()
    vi.advanceTimersByTime(1000)
    expect(a.currentFrame).toBe(1) // frozen after stop
    a.destroy()
    expect(el.innerHTML).toBe('')
    expect(a.isRunning()).toBe(false)
  })

  it('does not start a single-frame sequence', () => {
    const el = container()
    const a = new RabbitAnimator(el, { sequence: [0], reducedMotion: false }).start()
    expect(a.isRunning()).toBe(false)
  })

  it.each([-1, 3, 1.5])('rejects an out-of-range sequence frame %s', (bad) => {
    expect(() => new RabbitAnimator(container(), { sequence: [0, bad] })).toThrow(RangeError)
  })

  it('rejects an empty sequence', () => {
    expect(() => new RabbitAnimator(container(), { sequence: [] })).toThrow(RangeError)
  })

  it('passes render options through (pixel size)', () => {
    const el = container()
    new RabbitAnimator(el, { pixel: 3, reducedMotion: true })
    expect(el.querySelector('svg')!.getAttribute('width')).toBe(String(32 * 3))
  })

  it('mountRabbit constructs and starts', () => {
    const el = container()
    const a = mountRabbit(el, { sequence: [0, 1], frameMs: 100, reducedMotion: false })
    expect(a.isRunning()).toBe(true)
    a.stop()
  })

  it('RABBIT_LOOP is a non-trivial, in-range loop', () => {
    expect(RABBIT_LOOP.length).toBeGreaterThan(1)
    for (const f of RABBIT_LOOP) {
      expect(Number.isInteger(f)).toBe(true)
      expect(f).toBeGreaterThanOrEqual(0)
    }
  })

  it('prefersReducedMotion returns a boolean', () => {
    expect(typeof prefersReducedMotion()).toBe('boolean')
  })
})
