import type { BlockNode } from '@fluffmind/editor-blocks'
import { blockPlainText, createEmptyBlock, isBlockEmpty, setBlockPlainText } from '@fluffmind/editor-blocks'

export function splitTitleFromBlocks(blocks: BlockNode[]): { title: string, bodyBlocks: BlockNode[] } {
  const first = blocks[0]
  if (first?.type === 'heading' && (first.level ?? 1) === 1) {
    const title = blockPlainText(first).trim()
    return {
      title: title || 'Sans titre',
      bodyBlocks: blocks.slice(1),
    }
  }

  const fallback = blocks.find(block => block.type === 'heading')
    ?? blocks.find(block => block.type === 'paragraph')
  const title = fallback ? blockPlainText(fallback).split('\n')[0]?.trim() ?? '' : ''
  return {
    title: title || 'Sans titre',
    bodyBlocks: blocks,
  }
}

export function blocksWithTitle(title: string, bodyBlocks: BlockNode[]): BlockNode[] {
  const trimmed = title.trim() || 'Sans titre'
  const heading = setBlockPlainText(createEmptyBlock('heading', 1), trimmed)
  return [heading, ...bodyBlocks]
}

export function isBodyEmpty(blocks: BlockNode[]): boolean {
  const meaningful = blocks.filter(block => !(block.type === 'paragraph' && isBlockEmpty(block)))
  return meaningful.length === 0
}
