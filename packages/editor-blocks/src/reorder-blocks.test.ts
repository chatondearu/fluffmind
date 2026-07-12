import { describe, expect, it } from 'vitest'

import { reorderBlocksById } from './reorder-blocks'

describe('reorderBlocksById', () => {
  const blocks = [
    { id: 'a', value: 1 },
    { id: 'b', value: 2 },
    { id: 'c', value: 3 },
  ]

  it('moves a block down by id', () => {
    expect(reorderBlocksById(blocks, 'a', 'c').map(block => block.id)).toEqual(['b', 'a', 'c'])
  })

  it('moves a block up by id', () => {
    expect(reorderBlocksById(blocks, 'c', 'a').map(block => block.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns a copy when ids are missing or equal', () => {
    expect(reorderBlocksById(blocks, 'a', 'a')).toEqual(blocks)
    expect(reorderBlocksById(blocks, 'missing', 'a')).toEqual(blocks)
  })
})
