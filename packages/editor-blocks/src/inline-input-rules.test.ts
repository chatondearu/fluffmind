import { describe, expect, it } from 'vitest'
import { inlinesToMarkdown } from './inlines'
import { applyInputRule, matchInputRule, tryApplyInputRuleToInlines } from './inline-input-rules'
import type { InlineNode } from './types'

describe('matchInputRule', () => {
  it('matches bold with **', () => {
    expect(matchInputRule('say **hi**', 10)).toEqual({
      kind: 'strong',
      start: 4,
      end: 10,
      content: 'hi',
    })
  })

  it('matches bold with __', () => {
    expect(matchInputRule('__hi__', 6)?.kind).toBe('strong')
  })

  it('matches italic with * without consuming **', () => {
    expect(matchInputRule('x *y*', 5)).toMatchObject({ kind: 'emphasis', content: 'y' })
  })

  it('matches inline code', () => {
    expect(matchInputRule('a `b`', 5)).toMatchObject({ kind: 'inlineCode', content: 'b' })
  })

  it('matches markdown link', () => {
    expect(matchInputRule('[n](https://e.dev)', 18)).toMatchObject({
      kind: 'link',
      content: 'n',
      url: 'https://e.dev',
    })
  })

  it('matches wikilink with alias', () => {
    expect(matchInputRule('[[a|b]]', 7)).toMatchObject({
      kind: 'wikilink',
      target: 'a',
      alias: 'b',
    })
  })

  it('ignores escaped delimiters', () => {
    expect(matchInputRule('a \\*b*', 6)).toBeNull()
  })

  it('returns null when caret is not at end of a match', () => {
    expect(matchInputRule('**hi** there', 12)).toBeNull()
  })

  it('does not match emphasis when open delimiter starts **', () => {
    expect(matchInputRule('**y*', 4)).toBeNull()
  })

  it('does not match emphasis when open delimiter starts __', () => {
    expect(matchInputRule('__y_', 4)).toBeNull()
  })

  it('does not match emphasis when close delimiter is part of **', () => {
    expect(matchInputRule('*y**', 3)).toBeNull()
  })
})

describe('applyInputRule', () => {
  it('builds strong inlines and places caret after mark', () => {
    const match = matchInputRule('**hi**', 6)!
    const result = applyInputRule('**hi**', match)
    expect(result.inlines).toEqual([
      { type: 'strong', value: '', children: [{ type: 'text', value: 'hi' }] },
      { type: 'text', value: '' },
    ])
    expect(result.caret).toBe(2)
  })
})

describe('tryApplyInputRuleToInlines', () => {
  it('applies bold inside a text node without touching a preceding mark', () => {
    const inlines: InlineNode[] = [
      { type: 'strong', value: '', children: [{ type: 'text', value: 'A' }] },
      { type: 'text', value: ' **B**' },
    ]
    // plain text is "A **B**" (length 7); caret at the very end (7) sits inside
    // the trailing text node (" **B**", local offset 6).
    const result = tryApplyInputRuleToInlines(inlines, 7)
    expect(result).not.toBeNull()
    expect(inlinesToMarkdown(result!.inlines)).toBe('**A** **B**')
    expect(result!.caret).toBe(3)
  })

  it('returns null when caret sits inside a non-text top-level node', () => {
    const inlines: InlineNode[] = [
      { type: 'inlineCode', value: '**not bold**' },
    ]
    expect(tryApplyInputRuleToInlines(inlines, 5)).toBeNull()
  })

  it('returns null when the covering text node has no closing pattern', () => {
    const inlines: InlineNode[] = [{ type: 'text', value: 'plain text' }]
    expect(tryApplyInputRuleToInlines(inlines, 10)).toBeNull()
  })

  it('applies a rule on a plain (all-text) inline array', () => {
    const inlines: InlineNode[] = [{ type: 'text', value: 'say **hi**' }]
    const result = tryApplyInputRuleToInlines(inlines, 10)
    expect(result).not.toBeNull()
    expect(inlinesToMarkdown(result!.inlines)).toBe('say **hi**')
    expect(result!.caret).toBe(6)
  })
})
