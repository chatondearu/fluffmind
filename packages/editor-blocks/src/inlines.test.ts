import { describe, expect, it } from 'vitest'

import { blockEditableText, blockPlainText, setBlockPlainText, createEmptyBlock } from './block-text'
import { hasRichInlines, inlinesToMarkdown, inlinesToPlainText, parseInlineMarkdown, stripCaretArtifacts } from './inlines'
import { parseMarkdownToDocument } from './document'

describe('inline rich text helpers', () => {
  it('walks nested link children for plain text', () => {
    const text = inlinesToPlainText([
      { type: 'text', value: 'See ' },
      {
        type: 'link',
        value: '',
        url: 'https://example.com',
        children: [{ type: 'text', value: 'site' }],
      },
    ])
    expect(text).toBe('See site')
  })

  it('parses markdown links and wikilinks from editable text', () => {
    const inlines = parseInlineMarkdown('Go to [[foam/index|MoC]] and [docs](https://ex.test)')
    expect(hasRichInlines(inlines)).toBe(true)
    expect(inlines.some(n => n.type === 'wikilink' && n.target === 'foam/index')).toBe(true)
    expect(inlines.some(n => n.type === 'link' && n.url === 'https://ex.test')).toBe(true)
  })

  it('keeps editable markdown offsets aligned with caret splits', () => {
    const { blocks } = parseMarkdownToDocument('See [[a|Alias]] end')
    const block = blocks[0]!
    expect(blockEditableText(block)).toContain('[[a|Alias]]')
    expect(blockPlainText(block)).toBe('See Alias end')
  })

  it('re-parses marks when setting paragraph text', () => {
    const next = setBlockPlainText(createEmptyBlock('paragraph'), '**bold** and [[n]]')
    expect(next.inlines?.some(n => n.type === 'strong')).toBe(true)
    expect(next.inlines?.some(n => n.type === 'wikilink')).toBe(true)
  })

  it('strips caret artifacts before emitting or serializing inlines', () => {
    const inlines = [
      { type: 'strong' as const, value: '', children: [{ type: 'text' as const, value: 'hi' }] },
      { type: 'text' as const, value: '\u200bz' },
    ]

    expect(stripCaretArtifacts(inlines)).toEqual([
      { type: 'strong', value: '', children: [{ type: 'text', value: 'hi' }] },
      { type: 'text', value: 'z' },
    ])
    expect(inlinesToMarkdown(inlines)).toBe('**hi**z')
  })
})
