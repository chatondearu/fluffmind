import { inlinesToMarkdown } from './inlines'
import type { BlockNode, TableRow } from './types'
import { notePageLinkToMarkdown } from './note-page-links'

/** Serialize block tree back to markdown (#58). */
export function blocksToMarkdown(blocks: BlockNode[]): string {
  return blocks.map(blockToMarkdown).join('\n\n').trim()
}

function blockToMarkdown(block: BlockNode): string {
  switch (block.type) {
    case 'paragraph':
      return inlinesToMarkdown(block.inlines ?? [])
    case 'heading': {
      const level = block.level ?? 1
      const prefix = '#'.repeat(Math.min(6, Math.max(1, level)))
      return `${prefix} ${inlinesToMarkdown(block.inlines ?? [])}`
    }
    case 'bulletList':
      return (block.children ?? [])
        .map(item => listItemToMarkdown(item, '-'))
        .join('\n')
    case 'orderedList':
      return (block.children ?? [])
        .map((item, index) => listItemToMarkdown(item, `${index + 1}.`))
        .join('\n')
    case 'listItem':
      return (block.children ?? []).map(blockToMarkdown).join('\n')
    case 'code': {
      const lang = block.lang ?? ''
      return `\`\`\`${lang}\n${block.text ?? ''}\n\`\`\``
    }
    case 'table':
      return tableToMarkdown(block.rows ?? [])
    case 'noteLink': {
      const link = block.inlines?.find(inline => inline.type === 'wikilink')
      return link ? notePageLinkToMarkdown(link) : ''
    }
    case 'fallback':
      return block.raw ?? ''
    default: {
      const _exhaustive: never = block.type
      return _exhaustive
    }
  }
}

function listItemToMarkdown(item: BlockNode, marker: string): string {
  const body = (item.children ?? []).map(blockToMarkdown).join('\n')
  const lines = body.split('\n')
  const [first, ...rest] = lines
  const head = `${marker} ${first ?? ''}`
  if (rest.length === 0) {
    return head
  }
  const indent = marker.startsWith('-') ? '  ' : '   '
  return [head, ...rest.map(line => `${indent}${line}`)].join('\n')
}

function tableToMarkdown(rows: TableRow[]): string {
  if (rows.length === 0) {
    return ''
  }
  const lines = rows.map(row =>
    `| ${row.cells.map(cell => inlinesToMarkdown(cell).replace(/\|/g, '\\|')).join(' | ')} |`,
  )
  if (lines.length > 1) {
    const separator = `| ${rows[0]!.cells.map(() => '---').join(' | ')} |`
    lines.splice(1, 0, separator)
  }
  return lines.join('\n')
}
