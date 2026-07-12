import { describe, expect, it } from 'vitest'

import {
  FIXTURE_BULLET_LIST,
  FIXTURE_CODE_FENCE,
  FIXTURE_HEADING_PARAGRAPH,
  FIXTURE_INLINE_MARKS,
  FIXTURE_ORDERED_LIST,
  FIXTURE_TABLE,
  FIXTURE_WIKILINK,
} from './fixtures/spike-samples'
import { normalizeMarkdown, roundTripMarkdown } from './document'
import { expandTextWithWikilinks } from './wikilinks'

describe('roundTripMarkdown (P3 validation #65)', () => {
  it.each([
    ['heading + paragraph', FIXTURE_HEADING_PARAGRAPH],
    ['bullet list', FIXTURE_BULLET_LIST],
    ['ordered list', FIXTURE_ORDERED_LIST],
    ['fenced code', FIXTURE_CODE_FENCE],
    ['inline marks', FIXTURE_INLINE_MARKS],
    ['GFM table', FIXTURE_TABLE],
  ])('round-trips %s', (_label, input) => {
    const { output } = roundTripMarkdown(input)
    expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(input))
  })

  it('migrates legacy wikilinks to markdown note links', () => {
    const { output } = roundTripMarkdown(FIXTURE_WIKILINK)
    expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(
      'See [Feature catalog](/notes/foam/index) and [ADR-001](/notes/ADR-001).',
    ))
  })
})

describe('wikilinks', () => {
  it('parses target and alias', () => {
    const nodes = expandTextWithWikilinks('See [[foo/bar|Bar]] here')
    expect(nodes.some(n => n.type === 'wikilink' && n.target === 'foo/bar' && n.alias === 'Bar')).toBe(true)
  })
})

describe('defineBlock registry', () => {
  it('registers block types', async () => {
    const { clearBlockRegistry, defineBlock, getRegisteredBlockTypes } = await import('./registry')
    clearBlockRegistry()
    defineBlock({ type: 'paragraph', component: {} as never })
    expect(getRegisteredBlockTypes()).toContain('paragraph')
    clearBlockRegistry()
  })
})
