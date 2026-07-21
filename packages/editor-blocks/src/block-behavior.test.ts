import { describe, expect, it } from 'vitest'

import { blockPlainText, createEmptyBlock, isBlockEmpty, setBlockPlainText } from './block-text'
import { blocksToMarkdown } from './blocks-to-markdown'
import { promoteBlockFromMarkdown } from './block-markdown'
import {
  applyListEnter,
  applyListShiftTab,
  applyListTab,
  applyTaskToggle,
} from './list-behavior'
import { parseMarkdownToDocument } from './document'

describe('createEmptyBlock + plain text for new types', () => {
  it('creates taskList unchecked by default', () => {
    const block = createEmptyBlock('taskList')
    expect(block.type).toBe('taskList')
    expect(block.checked).toBe(false)
    expect(block.indent).toBe(0)
  })

  it('round-trips plain text on blockquote, callout, mermaid, image alt', () => {
    expect(blockPlainText(setBlockPlainText(createEmptyBlock('blockquote'), 'quoted'))).toBe('quoted')
    expect(blockPlainText(setBlockPlainText(createEmptyBlock('mermaid'), 'A-->B'))).toBe('A-->B')

    const callout = setBlockPlainText(createEmptyBlock('callout'), 'Title\nBody')
    expect(callout.text).toBe('Title')
    expect(blockPlainText(callout)).toContain('Body')

    const image = setBlockPlainText(createEmptyBlock('image'), 'Alt text')
    expect(image.alt).toBe('Alt text')
  })

  it('treats divider as non-empty and image without url as empty', () => {
    expect(isBlockEmpty(createEmptyBlock('divider'))).toBe(false)
    expect(isBlockEmpty(createEmptyBlock('image'))).toBe(true)
    expect(isBlockEmpty({ ...createEmptyBlock('image'), url: 'https://x.test/a.png' })).toBe(false)
  })
})

describe('list-behavior (Enter / Tab / tasks)', () => {
  it('Enter on filled bullet creates a sibling with same indent', () => {
    const first = setBlockPlainText(createEmptyBlock('bulletList'), 'alpha')
    const mutation = applyListEnter([first], 0, 'alpha'.length)
    expect(mutation).not.toBeNull()
    expect(mutation!.blocks).toHaveLength(2)
    expect(mutation!.blocks[1]?.type).toBe('bulletList')
    expect(mutation!.blocks[1]?.indent).toBe(0)
    expect(mutation!.focusIndex).toBe(1)
  })

  it('Enter splits text across two list items', () => {
    const first = setBlockPlainText(createEmptyBlock('bulletList'), 'hello world')
    const mutation = applyListEnter([first], 0, 5)
    expect(blockPlainText(mutation!.blocks[0]!)).toBe('hello')
    expect(blockPlainText(mutation!.blocks[1]!)).toBe(' world')
  })

  it('Enter on empty task at indent 0 exits to paragraph preserving id', () => {
    const task = createEmptyBlock('taskList')
    const id = task.id
    const mutation = applyListEnter([task], 0, 0)
    expect(mutation!.blocks).toHaveLength(1)
    expect(mutation!.blocks[0]?.type).toBe('paragraph')
    expect(mutation!.blocks[0]?.id).toBe(id)
  })

  it('Enter on empty nested list outdents instead of exiting', () => {
    const parent = setBlockPlainText(createEmptyBlock('bulletList'), 'parent')
    const child = createEmptyBlock('bulletList')
    child.indent = 1
    const mutation = applyListEnter([parent, child], 1, 0)
    expect(mutation!.blocks[1]?.type).toBe('bulletList')
    expect(mutation!.blocks[1]?.indent).toBe(0)
  })

  it('Enter on task creates unchecked sibling', () => {
    const task = setBlockPlainText(createEmptyBlock('taskList'), 'do it')
    task.checked = true
    const mutation = applyListEnter([task], 0, 5)
    expect(mutation!.blocks[1]?.type).toBe('taskList')
    expect(mutation!.blocks[1]?.checked).toBe(false)
  })

  it('Enter splits a marked list item by plain-text offset, preserving marks (C1)', () => {
    const first = createEmptyBlock('bulletList')
    first.children = [{
      id: first.children![0]!.id,
      type: 'listItem',
      children: [{
        id: first.children![0]!.children![0]!.id,
        type: 'paragraph',
        inlines: [
          { type: 'text', value: 'hello ' },
          { type: 'strong', value: '', children: [{ type: 'text', value: 'world' }] },
        ],
      }],
    }]

    // Plain offset 11 = end of "hello world"; the markdown string "hello **world**"
    // is 16 chars, so splitting by markdown offset here would corrupt the `**` marker.
    const mutation = applyListEnter([first], 0, 11)
    expect(blocksToMarkdown([mutation!.blocks[0]!])).toBe('- hello **world**')
    expect(blockPlainText(mutation!.blocks[1]!)).toBe('')
    expect(blocksToMarkdown([mutation!.blocks[1]!])).toBe('-')

    // Splitting mid-mark keeps the mark intact on both resulting items.
    const midSplit = applyListEnter([first], 0, 8)
    expect(blocksToMarkdown([midSplit!.blocks[0]!])).toBe('- hello **wo**')
    expect(blocksToMarkdown([midSplit!.blocks[1]!])).toBe('- **rld**')
  })

  it('Tab indents when previous sibling is a list', () => {
    const a = setBlockPlainText(createEmptyBlock('bulletList'), 'a')
    const b = setBlockPlainText(createEmptyBlock('bulletList'), 'b')
    const mutation = applyListTab([a, b], 1)
    expect(mutation!.blocks[1]?.indent).toBe(1)
  })

  it('Tab does nothing on first block', () => {
    const a = setBlockPlainText(createEmptyBlock('bulletList'), 'a')
    expect(applyListTab([a], 0)).toBeNull()
  })

  it('Shift+Tab outdents', () => {
    const a = setBlockPlainText(createEmptyBlock('bulletList'), 'a')
    const b = setBlockPlainText(createEmptyBlock('bulletList'), 'b')
    b.indent = 1
    const mutation = applyListShiftTab([a, b], 1)
    expect(mutation!.blocks[1]?.indent).toBe(0)
  })

  it('toggles task checked state', () => {
    const task = createEmptyBlock('taskList')
    const on = applyTaskToggle([task], 0)
    expect(on!.blocks[0]?.checked).toBe(true)
    const off = applyTaskToggle(on!.blocks, 0)
    expect(off!.blocks[0]?.checked).toBe(false)
  })
})

describe('promote markdown shortcuts for new blocks', () => {
  it('promotes > quote, ---, task, image, callout, mermaid fence', () => {
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '> hi'))[0]?.type)
      .toBe('blockquote')
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '---'))[0]?.type)
      .toBe('divider')
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '- [ ] todo'))[0]?.type)
      .toBe('taskList')
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '![a](https://x.test/a.png)'))[0]?.type)
      .toBe('image')
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '> [!note] Title'))[0]?.type)
      .toBe('callout')
    expect(promoteBlockFromMarkdown(setBlockPlainText(createEmptyBlock('paragraph'), '```mermaid\nA-->B\n```'))[0]?.type)
      .toBe('mermaid')
  })
})

describe('serialize + parse fidelity for editor mutations', () => {
  it('keeps adjacent tasks as a single list run after toggle', () => {
    const { blocks } = parseMarkdownToDocument('- [ ] a\n- [ ] b')
    const toggled = applyTaskToggle(blocks, 1)!
    expect(blocksToMarkdown(toggled.blocks)).toBe('- [ ] a\n- [x] b')
  })

  it('serializes indented bullet created via Tab', () => {
    const a = setBlockPlainText(createEmptyBlock('bulletList'), 'parent')
    const b = setBlockPlainText(createEmptyBlock('bulletList'), 'child')
    const indented = applyListTab([a, b], 1)!
    expect(blocksToMarkdown(indented.blocks)).toBe('- parent\n  - child')
  })
})
