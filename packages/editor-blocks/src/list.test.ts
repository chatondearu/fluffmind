import { describe, expect, it } from 'vitest'

import { createEmptyBlock, setBlockPlainText } from './block-text'
import { blocksToMarkdown } from './blocks-to-markdown'
import { parseMarkdownToDocument } from './document'
import { clampListIndent, orderedListNumber } from './list-utils'

describe('list flatten (mdast → blocks)', () => {
  it('expands a multi-item bullet list into one block per item', () => {
    const { blocks } = parseMarkdownToDocument('- alpha\n- beta\n- gamma')
    expect(blocks).toHaveLength(3)
    expect(blocks.every(block => block.type === 'bulletList')).toBe(true)
    expect(blocks.map(block => block.indent ?? 0)).toEqual([0, 0, 0])
    expect(blocks.map(block => block.children?.[0]?.children?.[0]?.inlines?.[0]?.value)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })

  it('flattens nested lists into sibling blocks with indent', () => {
    const { blocks } = parseMarkdownToDocument('- parent\n  - child\n- sibling')
    expect(blocks).toHaveLength(3)
    expect(blocks.map(block => ({ type: block.type, indent: block.indent ?? 0 }))).toEqual([
      { type: 'bulletList', indent: 0 },
      { type: 'bulletList', indent: 1 },
      { type: 'bulletList', indent: 0 },
    ])
  })
})

describe('list serialize', () => {
  it('joins adjacent list blocks without a blank line', () => {
    const first = setBlockPlainText(createEmptyBlock('bulletList'), 'a')
    const second = setBlockPlainText(createEmptyBlock('bulletList'), 'b')
    expect(blocksToMarkdown([first, second])).toBe('- a\n- b')
  })

  it('serializes nested indents and ordered numbering', () => {
    const a = setBlockPlainText(createEmptyBlock('orderedList'), 'a')
    const b = setBlockPlainText(createEmptyBlock('orderedList'), 'b')
    b.indent = 1
    const c = setBlockPlainText(createEmptyBlock('orderedList'), 'c')
    expect(blocksToMarkdown([a, b, c])).toBe('1. a\n  1. b\n2. c')
  })

  it('separates a list run from a following paragraph with a blank line', () => {
    const item = setBlockPlainText(createEmptyBlock('bulletList'), 'item')
    const paragraph = setBlockPlainText(createEmptyBlock('paragraph'), 'after')
    expect(blocksToMarkdown([item, paragraph])).toBe('- item\n\nafter')
  })
})

describe('list-utils', () => {
  it('computes ordered numbers across nest boundaries', () => {
    const blocks = [
      setBlockPlainText(createEmptyBlock('orderedList'), 'a'),
      setBlockPlainText(createEmptyBlock('orderedList'), 'b'),
      setBlockPlainText(createEmptyBlock('orderedList'), 'c'),
    ]
    blocks[1]!.indent = 1
    expect(orderedListNumber(blocks, 0)).toBe(1)
    expect(orderedListNumber(blocks, 1)).toBe(1)
    expect(orderedListNumber(blocks, 2)).toBe(2)
  })

  it('clamps indent to previous list sibling + 1', () => {
    const blocks = [
      setBlockPlainText(createEmptyBlock('bulletList'), 'a'),
      setBlockPlainText(createEmptyBlock('bulletList'), 'b'),
    ]
    expect(clampListIndent(blocks, 1, 5)).toBe(1)
    expect(clampListIndent(blocks, 0, 2)).toBe(0)
  })
})
