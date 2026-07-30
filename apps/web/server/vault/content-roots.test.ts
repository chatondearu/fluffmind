import { describe, expect, it } from 'vitest'
import {
  assertWithinContentRoots,
  ContentRootViolationError,
  InvalidContentRootError,
  isPathWithinContentRoots,
  normalizeContentRoots,
} from './content-roots'

describe('normalizeContentRoots', () => {
  it('returns [] for undefined / null / empty array', () => {
    expect(normalizeContentRoots(undefined)).toEqual([])
    expect(normalizeContentRoots(null)).toEqual([])
    expect(normalizeContentRoots([])).toEqual([])
  })

  it('strips leading slashes, trims, dedupes', () => {
    expect(normalizeContentRoots(['/foam', ' foam ', 'foam', 'docs'])).toEqual(['foam', 'docs'])
  })

  it('rejects .., empty segments, backslashes, non-strings', () => {
    expect(() => normalizeContentRoots(['foam/../x'])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots([''])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots(['foam//docs'])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots([123])).toThrow(InvalidContentRootError)
  })
})

describe('isPathWithinContentRoots', () => {
  it('allows everything when roots empty', () => {
    expect(isPathWithinContentRoots('src/readme', [])).toBe(true)
  })

  it('allows exact root and descendants only', () => {
    const roots = ['foam', 'docs']
    expect(isPathWithinContentRoots('foam', roots)).toBe(true)
    expect(isPathWithinContentRoots('foam/prd/foo', roots)).toBe(true)
    expect(isPathWithinContentRoots('docs/guide', roots)).toBe(true)
    expect(isPathWithinContentRoots('src/readme', roots)).toBe(false)
    expect(isPathWithinContentRoots('foamy', roots)).toBe(false)
  })
})

describe('assertWithinContentRoots', () => {
  it('throws ContentRootViolationError when outside', () => {
    expect(() => assertWithinContentRoots('src/x', ['foam'])).toThrow(ContentRootViolationError)
  })
})
