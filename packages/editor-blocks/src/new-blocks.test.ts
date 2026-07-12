import { describe, expect, it } from 'vitest'

import { createEmptyBlock } from './block-text'
import { blocksToMarkdown } from './blocks-to-markdown'
import { roundTripMarkdown } from './document'

describe('noteLink block', () => {
  it('serializes wikilink markdown', () => {
    const block = createEmptyBlock('noteLink')
    block.inlines = [{ type: 'wikilink', target: 'projets/roadmap', value: 'Roadmap', alias: 'Roadmap' }]
    expect(blocksToMarkdown([block])).toBe('[[projets/roadmap|Roadmap]]')
  })
})

describe('list enter behavior', () => {
  it('serializes consecutive bullet blocks as list items', () => {
    const first = createEmptyBlock('bulletList')
    const second = createEmptyBlock('bulletList')
    first.children![0]!.children![0] = {
      ...first.children![0]!.children![0]!,
      inlines: [{ type: 'text', value: 'item 1' }],
    }
    second.children![0]!.children![0] = {
      ...second.children![0]!.children![0]!,
      inlines: [{ type: 'text', value: 'item 2' }],
    }
    expect(blocksToMarkdown([first, second])).toBe('- item 1\n\n- item 2')
  })
})

describe('table block', () => {
  it('round-trips a 2x2 table block', () => {
    const block = createEmptyBlock('table')
    block.rows![0]!.cells[0] = [{ type: 'text', value: 'A' }]
    block.rows![0]!.cells[1] = [{ type: 'text', value: 'B' }]
    block.rows![1]!.cells[0] = [{ type: 'text', value: 'C' }]
    block.rows![1]!.cells[1] = [{ type: 'text', value: 'D' }]
    const markdown = blocksToMarkdown([block])
    const { output } = roundTripMarkdown(markdown)
    expect(output).toContain('A')
    expect(output).toContain('D')
  })
})
