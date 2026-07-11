import { describe, expect, it } from 'vitest'

import { splitTextAt } from './block-text'

describe('splitTextAt', () => {
  it('splits at offset', () => {
    expect(splitTextAt('hello', 2)).toEqual(['he', 'llo'])
  })

  it('clamps offset to text bounds', () => {
    expect(splitTextAt('hi', 99)).toEqual(['hi', ''])
    expect(splitTextAt('hi', -3)).toEqual(['', 'hi'])
  })
})
