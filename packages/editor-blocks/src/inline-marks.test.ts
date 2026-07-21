import { describe, expect, it } from 'vitest'
import { inlinesToMarkdown, inlinesToPlainText } from './inlines'
import { selectionHasMark, splitInlinesAt, toggleMark, wrapLink, wrapWikilink } from './inline-marks'
import type { InlineNode } from './types'

const plain = (value: string): InlineNode[] => [{ type: 'text', value }]

const helloWorldBold: InlineNode[] = [
  { type: 'text', value: 'hello ' },
  { type: 'strong', value: '', children: [{ type: 'text', value: 'world' }] },
]

describe('toggleMark', () => {
  it('wraps selection in strong', () => {
    const next = toggleMark(plain('hello'), 0, 5, 'strong')
    expect(inlinesToMarkdown(next)).toBe('**hello**')
  })

  it('unwraps when selection already strong', () => {
    const start: InlineNode[] = [{
      type: 'strong',
      value: '',
      children: [{ type: 'text', value: 'hello' }],
    }]
    expect(selectionHasMark(start, 0, 5, 'strong')).toBe(true)
    expect(inlinesToMarkdown(toggleMark(start, 0, 5, 'strong'))).toBe('hello')
  })

  it('unwraps adjacent strong nodes across the selection', () => {
    const start: InlineNode[] = [
      {
        type: 'strong',
        value: '',
        children: [{ type: 'text', value: 'ab' }],
      },
      {
        type: 'strong',
        value: '',
        children: [{ type: 'text', value: 'cd' }],
      },
    ]
    expect(selectionHasMark(start, 0, 4, 'strong')).toBe(true)
    expect(inlinesToMarkdown(toggleMark(start, 0, 4, 'strong'))).toBe('abcd')
  })

  it('wraps partial text', () => {
    const next = toggleMark(plain('abcdef'), 2, 4, 'emphasis')
    expect(inlinesToMarkdown(next)).toBe('ab*cd*ef')
  })

  it('expands a partial wikilink selection before wrapping', () => {
    const start: InlineNode[] = [{
      type: 'wikilink',
      value: 'display',
      target: 'target',
      alias: 'display',
    }]
    const next = toggleMark(start, 1, 4, 'strong')
    expect(inlinesToMarkdown(next)).toBe('**[[target|display]]**')
  })

  it('wraps link and wikilink', () => {
    expect(inlinesToMarkdown(wrapLink(plain('n'), 0, 1, 'https://e.dev'))).toBe('[n](https://e.dev)')
    expect(inlinesToMarkdown(wrapWikilink(plain('n'), 0, 1, 'foam/index'))).toContain('[[foam/index')
  })
})

describe('splitInlinesAt (plain-text offsets, matches getSelectionOffset)', () => {
  it('splits before a mark, keeping the mark intact on the after side', () => {
    // Plain offset 6 = end of "hello " (markdown offset would be the same here,
    // but diverges once the split point moves inside/after the mark below).
    const { before, after } = splitInlinesAt(helloWorldBold, 6)
    expect(inlinesToMarkdown(before)).toBe('hello ')
    expect(inlinesToMarkdown(after)).toBe('**world**')
  })

  it('splits at the end of the full plain text, leaving a clean empty after side', () => {
    const total = inlinesToPlainText(helloWorldBold).length
    expect(total).toBe(11)
    const { before, after } = splitInlinesAt(helloWorldBold, total)
    expect(inlinesToMarkdown(before)).toBe('hello **world**')
    expect(after).toEqual([{ type: 'text', value: '' }])
  })

  it('splits at offset 0, leaving a clean empty before side', () => {
    const { before, after } = splitInlinesAt(helloWorldBold, 0)
    expect(before).toEqual([{ type: 'text', value: '' }])
    expect(inlinesToMarkdown(after)).toBe('hello **world**')
  })

  it('splits inside a mark, preserving the mark on both sides', () => {
    // Plain offset 8 = "hello wo|rld" -> splits "world" into "wo" / "rld".
    // Splitting the *markdown* string at this offset (the C1 bug) would instead
    // cut right after the opening `**`, producing corrupted markdown.
    const { before, after } = splitInlinesAt(helloWorldBold, 8)
    expect(inlinesToMarkdown(before)).toBe('hello **wo**')
    expect(inlinesToMarkdown(after)).toBe('**rld**')
  })

  it('clamps out-of-range offsets instead of throwing', () => {
    expect(inlinesToMarkdown(splitInlinesAt(helloWorldBold, 999).before)).toBe('hello **world**')
    expect(splitInlinesAt(helloWorldBold, -5).before).toEqual([{ type: 'text', value: '' }])
  })

  it('strips caret ZWSP artifacts before measuring/splitting', () => {
    const withZws: InlineNode[] = [{ type: 'text', value: 'ab\u200b' }]
    const { before, after } = splitInlinesAt(withZws, 2)
    expect(inlinesToMarkdown(before)).toBe('ab')
    expect(after).toEqual([{ type: 'text', value: '' }])
  })
})

describe('splitInlinesAt simulating BlockEditor Enter on a marked paragraph', () => {
  it('keeps marks on the first block and produces a clean, empty new block', () => {
    const plainLength = inlinesToPlainText(helloWorldBold).length
    const { before, after } = splitInlinesAt(helloWorldBold, plainLength)

    // Mirrors handleEnter: current block keeps `before`, new paragraph gets `after`.
    const currentBlock = { id: 'a', type: 'paragraph' as const, inlines: before }
    const newBlock = { id: 'b', type: 'paragraph' as const, inlines: after }

    expect(inlinesToMarkdown(currentBlock.inlines)).toBe('hello **world**')
    expect(inlinesToPlainText(newBlock.inlines)).toBe('')
    expect(newBlock.inlines).toEqual([{ type: 'text', value: '' }])
  })

  it('splits a mid-mark caret across both resulting blocks without corrupting markdown', () => {
    const { before, after } = splitInlinesAt(helloWorldBold, 8)
    const currentBlock = { id: 'a', type: 'paragraph' as const, inlines: before }
    const newBlock = { id: 'b', type: 'paragraph' as const, inlines: after }

    expect(inlinesToMarkdown(currentBlock.inlines)).toBe('hello **wo**')
    expect(inlinesToMarkdown(newBlock.inlines)).toBe('**rld**')
  })
})
