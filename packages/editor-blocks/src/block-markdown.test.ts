import { describe, expect, it } from 'vitest'

import { createEmptyBlock, setBlockPlainText } from './block-text'
import { ensureTrailingSentinel, normalizeEditorBlocks, promoteBlockFromMarkdown, stripTrailingEmptyBlocks } from './block-markdown'

describe('block-markdown', () => {
  it('promotes heading markdown on blur', () => {
    const block = setBlockPlainText(createEmptyBlock('paragraph'), '## Hello')
    const promoted = promoteBlockFromMarkdown(block)
    expect(promoted).toHaveLength(1)
    expect(promoted[0]?.type).toBe('heading')
    expect(promoted[0]?.level).toBe(2)
  })

  it('keeps manually selected heading type on blur without markdown syntax', () => {
    const block = setBlockPlainText(createEmptyBlock('heading', 2), 'Hello')
    const promoted = promoteBlockFromMarkdown(block)
    expect(promoted).toHaveLength(1)
    expect(promoted[0]?.type).toBe('heading')
    expect(promoted[0]?.level).toBe(2)
  })

  it('re-parses heading block when markdown syntax is present', () => {
    const block = setBlockPlainText(createEmptyBlock('heading', 1), '## Subtitle')
    const promoted = promoteBlockFromMarkdown(block)
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

  it('reuses trailing sentinel id across text updates', () => {
    const sentinel = createEmptyBlock('paragraph')
    const blocks = [
      setBlockPlainText(createEmptyBlock('paragraph'), 'Hello'),
      sentinel,
    ]
    const first = ensureTrailingSentinel(blocks)
    const second = ensureTrailingSentinel([
      setBlockPlainText(first[0]!, 'Hello world'),
      sentinel,
    ])
    expect(second[1]?.id).toBe(sentinel.id)
  })

  it('strips all trailing empty paragraphs when leaving', () => {
    const blocks = [
      setBlockPlainText(createEmptyBlock('paragraph'), 'Hello'),
      createEmptyBlock('paragraph'),
    ]
    expect(stripTrailingEmptyBlocks(blocks)).toHaveLength(1)
  })
})
