import { describe, expect, it } from 'vitest'

import {
  FIXTURE_BLOCKQUOTE,
  FIXTURE_BULLET_LIST,
  FIXTURE_CALLOUT,
  FIXTURE_CODE_FENCE,
  FIXTURE_DIVIDER,
  FIXTURE_HEADING_PARAGRAPH,
  FIXTURE_IMAGE,
  FIXTURE_INLINE_MARKS,
  FIXTURE_MERMAID,
  FIXTURE_NESTED_LIST,
  FIXTURE_ORDERED_LIST,
  FIXTURE_TABLE,
  FIXTURE_TASK_LIST,
  FIXTURE_WIKILINK,
} from './fixtures/spike-samples'
import { normalizeMarkdown, roundTripMarkdown } from './document'
import { expandTextWithWikilinks } from './wikilinks'

describe('roundTripMarkdown (P3 validation #65)', () => {
  it.each([
    ['heading + paragraph', FIXTURE_HEADING_PARAGRAPH],
    ['bullet list', FIXTURE_BULLET_LIST],
    ['ordered list', FIXTURE_ORDERED_LIST],
    ['nested list', FIXTURE_NESTED_LIST],
    ['fenced code', FIXTURE_CODE_FENCE],
    ['inline marks', FIXTURE_INLINE_MARKS],
    ['wikilink', FIXTURE_WIKILINK],
    ['GFM table', FIXTURE_TABLE],
    ['blockquote', FIXTURE_BLOCKQUOTE],
    ['divider', FIXTURE_DIVIDER],
    ['task list', FIXTURE_TASK_LIST],
    ['image', FIXTURE_IMAGE],
    ['callout', FIXTURE_CALLOUT],
    ['mermaid', FIXTURE_MERMAID],
  ])('round-trips %s', (_label, input) => {
    const { output } = roundTripMarkdown(input)
    expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(input))
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
