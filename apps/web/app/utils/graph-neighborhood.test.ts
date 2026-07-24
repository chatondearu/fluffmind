import { describe, expect, it } from 'vitest'

import {
  activeSeed,
  computeDegrees,
  neighborsOf,
  nodeRadius,
} from './graph-neighborhood'

describe('computeDegrees', () => {
  it('counts each incident endpoint once', () => {
    const degrees = computeDegrees([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ])
    expect(degrees.get('a')).toBe(2)
    expect(degrees.get('b')).toBe(2)
    expect(degrees.get('c')).toBe(2)
  })

  it('counts self-loops as one incident edge on that node', () => {
    const degrees = computeDegrees([{ source: 'a', target: 'a' }])
    expect(degrees.get('a')).toBe(1)
  })

  it('counts duplicate edges separately', () => {
    const degrees = computeDegrees([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ])
    expect(degrees.get('a')).toBe(2)
    expect(degrees.get('b')).toBe(2)
  })
})

describe('neighborsOf', () => {
  it('returns adjacent ids excluding self', () => {
    const n = neighborsOf('a', [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'a' },
      { source: 'b', target: 'c' },
      { source: 'a', target: 'a' },
    ])
    expect([...n].sort()).toEqual(['b', 'c'])
  })
})

describe('activeSeed', () => {
  it('prefers focusedId over hoveredId', () => {
    expect(activeSeed('a', 'b')).toBe('a')
    expect(activeSeed(null, 'b')).toBe('b')
    expect(activeSeed(null, null)).toBeNull()
  })
})

describe('nodeRadius', () => {
  it('clamps and scales with sqrt(degree)', () => {
    expect(nodeRadius(0)).toBe(10)
    expect(nodeRadius(0, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(10)
    expect(nodeRadius(9, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(19)
    expect(nodeRadius(1000, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(28)
  })
})
