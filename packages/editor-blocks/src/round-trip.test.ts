import { describe, expect, it } from 'vitest'

import {
  FIXTURE_BULLET_LIST,
  FIXTURE_CODE_FENCE,
  FIXTURE_HEADING_PARAGRAPH,
  FIXTURE_INLINE_MARKS,
  FIXTURE_ORDERED_LIST,
} from './fixtures/spike-samples.ts'
import { normalizeMarkdown, roundTripMarkdown } from './round-trip.ts'

describe('roundTripMarkdown (spike #55)', () => {
  it.each([
    ['heading + paragraph', FIXTURE_HEADING_PARAGRAPH],
    ['bullet list', FIXTURE_BULLET_LIST],
    ['ordered list', FIXTURE_ORDERED_LIST],
    ['fenced code', FIXTURE_CODE_FENCE],
    ['inline marks', FIXTURE_INLINE_MARKS],
  ])('round-trips %s', (_label, input) => {
    const { output } = roundTripMarkdown(input)
    expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(input))
  })

  it('documents block count for a mixed note', () => {
    const { blocks } = roundTripMarkdown(FIXTURE_CODE_FENCE)
    expect(blocks.length).toBeGreaterThan(2)
    expect(blocks.some(b => b.type === 'code')).toBe(true)
  })
})
