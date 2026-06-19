import { describe, expect, it } from 'vitest'
import {
  COMMAND_ERROR_CODES,
  DEFAULT_RUNTIME_CONFIG,
  canvasToViewport,
  isCommandErrorCode,
  isPointInsidePaneRect,
  normalizeRuntimeConfig,
  viewportToCanvas,
  type CanvasViewportTransform,
} from '../src/index'

// Pane at screen (100, 50); React Flow viewport panned (40, 40), zoom 1.
const T1: CanvasViewportTransform = {
  paneLeft: 100,
  paneTop: 50,
  translateX: 40,
  translateY: 40,
  scale: 1,
}

// Same pane, zoomed to 1.5 with a non-trivial pan — guards the scale path.
const T2: CanvasViewportTransform = {
  paneLeft: 100,
  paneTop: 50,
  translateX: -30,
  translateY: 10,
  scale: 1.5,
}

describe('canvasToViewport / viewportToCanvas', () => {
  it('maps a canvas point to viewport px at scale 1 (pane + translate + flow)', () => {
    // x = 100 + 40 + 0*1 = 140 ; y = 50 + 40 + 0*1 = 90
    expect(canvasToViewport(0, 0, T1)).toEqual({ x: 140, y: 90 })
    // x = 100 + 40 + 300 = 440 ; y = 50 + 40 + 200 = 290
    expect(canvasToViewport(300, 200, T1)).toEqual({ x: 440, y: 290 })
  })

  it('maps a canvas point to viewport px at scale != 1', () => {
    // x = 100 + (-30) + 200*1.5 = 370 ; y = 50 + 10 + 100*1.5 = 210
    expect(canvasToViewport(200, 100, T2)).toEqual({ x: 370, y: 210 })
  })

  it('round-trips canvas -> viewport -> canvas at scale 1 and scale != 1', () => {
    for (const t of [T1, T2]) {
      const vp = canvasToViewport(123, 456, t)
      const back = viewportToCanvas(vp.x, vp.y, t)
      expect(back.x).toBeCloseTo(123, 6)
      expect(back.y).toBeCloseTo(456, 6)
    }
  })

  it('treats a zero scale as 1 to avoid divide-by-zero', () => {
    const broken = { ...T1, scale: 0 }
    expect(() => viewportToCanvas(140, 90, broken)).not.toThrow()
    expect(viewportToCanvas(140, 90, broken)).toEqual({ x: 0, y: 0 })
  })
})

describe('isPointInsidePaneRect', () => {
  const pane = { left: 100, top: 50, right: 700, bottom: 450 }
  it('accepts interior and edge points (inclusive bounds)', () => {
    expect(isPointInsidePaneRect(400, 250, pane)).toBe(true)
    expect(isPointInsidePaneRect(100, 50, pane)).toBe(true)
    expect(isPointInsidePaneRect(700, 450, pane)).toBe(true)
  })
  it('rejects points beyond any edge', () => {
    expect(isPointInsidePaneRect(99, 250, pane)).toBe(false)
    expect(isPointInsidePaneRect(400, 451, pane)).toBe(false)
    expect(isPointInsidePaneRect(701, 250, pane)).toBe(false)
  })
})

describe('DESTINATION_OUTSIDE_CANVAS error code', () => {
  it('is a registered command error code', () => {
    expect(COMMAND_ERROR_CODES).toContain('DESTINATION_OUTSIDE_CANVAS')
    expect(isCommandErrorCode('DESTINATION_OUTSIDE_CANVAS')).toBe(true)
  })
})

describe('canvasDragNudgePx config coercion', () => {
  it('defaults to 0', () => {
    expect(DEFAULT_RUNTIME_CONFIG.canvasDragNudgePx).toBe(0)
    expect(normalizeRuntimeConfig(undefined).canvasDragNudgePx).toBe(0)
  })
  it('floors a positive float and clamps a negative to the default', () => {
    expect(normalizeRuntimeConfig({ canvasDragNudgePx: 2.9 }).canvasDragNudgePx).toBe(2)
    expect(normalizeRuntimeConfig({ canvasDragNudgePx: -5 }).canvasDragNudgePx).toBe(0)
    expect(normalizeRuntimeConfig({ canvasDragNudgePx: Number.NaN }).canvasDragNudgePx).toBe(0)
  })
})
