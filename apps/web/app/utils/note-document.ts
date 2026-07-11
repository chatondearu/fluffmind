import type { BlockNode } from '@fluffmind/editor-blocks'
import { blockPlainText } from '@fluffmind/editor-blocks'

export function slugifyNoteId(text: string): string {
  const slug = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return slug || 'untitled'
}

export function noteTitleFromBlocks(blocks: BlockNode[]): string {
  const heading = blocks.find(block => block.type === 'heading')
  if (heading) {
    const title = blockPlainText(heading).trim()
    if (title) return title
  }

  const paragraph = blocks.find(block => block.type === 'paragraph')
  if (paragraph) {
    const line = blockPlainText(paragraph).split('\n')[0]?.trim() ?? ''
    if (line && !line.startsWith('/')) return line
  }

  return 'Sans titre'
}

export function noteIdFromBlocks(blocks: BlockNode[], folderPrefix: string | null = null): string {
  const slug = slugifyNoteId(noteTitleFromBlocks(blocks))
  if (!folderPrefix) return slug
  return `${folderPrefix}/${slug}`
}

export function isDocumentEmpty(blocks: BlockNode[]): boolean {
  if (blocks.length === 0) return true
  if (blocks.length > 1) return false
  const only = blocks[0]
  if (!only) return true
  const text = blockPlainText(only).trim()
  return text.length === 0 || text === '/'
}

export { sanitizeFolderQuery as sanitizeFolderFromQuery } from './vault-tree'
