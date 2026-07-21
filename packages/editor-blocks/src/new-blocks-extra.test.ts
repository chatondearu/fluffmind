import { describe, expect, it } from 'vitest'

import { createEmptyBlock, setBlockPlainText } from './block-text'
import { blocksToMarkdown } from './blocks-to-markdown'
import { parseMarkdownToDocument } from './document'

describe('new markdown blocks', () => {
  it('parses blockquote into a blockquote block', () => {
    const { blocks } = parseMarkdownToDocument('> hello quote')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('blockquote')
  })

  it('parses thematic break as divider', () => {
    const { blocks } = parseMarkdownToDocument('---')
    expect(blocks[0]?.type).toBe('divider')
    expect(blocksToMarkdown(blocks)).toBe('---')
  })

  it('parses GFM tasks into taskList blocks', () => {
    const { blocks } = parseMarkdownToDocument('- [ ] one\n- [x] two')
    expect(blocks.map(b => ({ type: b.type, checked: b.checked }))).toEqual([
      { type: 'taskList', checked: false },
      { type: 'taskList', checked: true },
    ])
  })

  it('parses standalone image paragraph as image block', () => {
    const { blocks } = parseMarkdownToDocument('![Alt](https://example.com/a.png)')
    expect(blocks[0]?.type).toBe('image')
    expect(blocks[0]?.url).toBe('https://example.com/a.png')
    expect(blocks[0]?.alt).toBe('Alt')
  })

  it('detects Obsidian callouts from blockquotes', () => {
    const { blocks } = parseMarkdownToDocument('> [!warning] Careful\n> body text')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('callout')
    expect(blocks[0]?.calloutKind).toBe('warning')
    expect(blocks[0]?.text).toBe('Careful')
  })

  it('maps mermaid fences to mermaid blocks', () => {
    const { blocks } = parseMarkdownToDocument('```mermaid\nflowchart TD\n  A --> B\n```')
    expect(blocks[0]?.type).toBe('mermaid')
    expect(blocks[0]?.text).toContain('flowchart TD')
  })

  it('serializes callout and mermaid blocks', () => {
    const callout = createEmptyBlock('callout')
    callout.calloutKind = 'tip'
    callout.text = 'Hint'
    callout.inlines = [{ type: 'text', value: 'Do this' }]
    const mermaid = setBlockPlainText(createEmptyBlock('mermaid'), 'flowchart TD\n  A --> B')
    expect(blocksToMarkdown([callout])).toBe('> [!tip] Hint\n> Do this')
    expect(blocksToMarkdown([mermaid])).toContain('```mermaid')
  })
})
