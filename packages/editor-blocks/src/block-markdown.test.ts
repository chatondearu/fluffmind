import { describe, expect, it } from 'vitest'

import { createEmptyBlock, setBlockPlainText } from './block-text'
import { normalizeEditorBlocks, promoteBlockFromMarkdown, stripTrailingEmptyBlocks } from './block-markdown'

describe('block-markdown', () => {
  it('promotes heading markdown on blur', () => {
    const block = setBlockPlainText(createEmptyBlock('paragraph'), '## Hello')
    const promoted = promoteBlockFromMarkdown(block)
    expect(promoted).toHaveLength(1)
    expect(promoted[0]?.type).toBe('heading')
    expect(promoted[0]?.level).toBe(2)
  })

  it('keeps exactly one trailing empty paragraph while editing', () => {
    const blocks = [
      setBlockPlainText(createEmptyBlock('paragraph'), 'Hello'),
      createEmptyBlock('paragraph'),
      createEmptyBlock('paragraph'),
    ]
    const normalized = normalizeEditorBlocks(blocks)
    expect(normalized).toHaveLength(2)
    expect(normalized[1]?.type).toBe('paragraph')
  })

  it('strips all trailing empty paragraphs when leaving', () => {
    const blocks = [
      setBlockPlainText(createEmptyBlock('paragraph'), 'Hello'),
      createEmptyBlock('paragraph'),
    ]
    expect(stripTrailingEmptyBlocks(blocks)).toHaveLength(1)
  })
})
