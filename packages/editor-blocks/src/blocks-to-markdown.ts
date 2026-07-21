import { inlinesToMarkdown } from './inlines'
import { isListBlock, listIndent, orderedListNumber } from './list-utils'
import type { BlockNode, TableRow } from './types'
import { wikilinkToMarkdown } from './wikilinks'

/** Serialize block tree back to markdown (#58). */
export function blocksToMarkdown(blocks: BlockNode[]): string {
  const parts: string[] = []
  let i = 0

  while (i < blocks.length) {
    const current = blocks[i]!
    if (isListBlock(current)) {
      const start = i
      while (i < blocks.length && isListBlock(blocks[i]!)) {
        i++
      }
      parts.push(serializeListRun(blocks, start, i))
      continue
    }
    parts.push(blockToMarkdown(current))
    i++
  }

  return parts.filter(part => part.length > 0).join('\n\n').trim()
}

/** Contiguous list item blocks joined by single newlines (not blank lines). */
function serializeListRun(blocks: BlockNode[], start: number, end: number): string {
  const lines: string[] = []
  for (let index = start; index < end; index++) {
    lines.push(listItemLine(blocks[index]!, blocks, index))
  }
  return lines.join('\n')
}

function listItemLine(block: BlockNode, allBlocks: BlockNode[], index: number): string {
  const indent = listIndent(block)
  const prefix = '  '.repeat(indent)
  const body = listItemBody(block)
  const lines = body.split('\n')
  let marker = '-'
  if (block.type === 'orderedList') {
    marker = `${orderedListNumber(allBlocks, index)}.`
  }
  else if (block.type === 'taskList') {
    marker = block.checked ? '- [x]' : '- [ ]'
  }
  const head = `${prefix}${marker} ${lines[0] ?? ''}`
  if (lines.length <= 1) {
    return head
  }
  const continuationIndent = `${prefix}${' '.repeat(marker.length + 1)}`
  return [head, ...lines.slice(1).map(line => `${continuationIndent}${line}`)].join('\n')
}

function listItemBody(block: BlockNode): string {
  const item = block.children?.[0]
  if (!item) return ''
  return (item.children ?? []).map(blockToMarkdown).join('\n')
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
    case 'orderedList':
    case 'taskList':
      return listItemLine(block, [block], 0)
    case 'listItem':
      return (block.children ?? []).map(blockToMarkdown).join('\n')
    case 'code': {
      const lang = block.lang ?? ''
      return `\`\`\`${lang}\n${block.text ?? ''}\n\`\`\``
    }
    case 'mermaid':
      return `\`\`\`mermaid\n${block.text ?? ''}\n\`\`\``
    case 'table':
      return tableToMarkdown(block.rows ?? [])
    case 'noteLink': {
      const link = block.inlines?.find(inline => inline.type === 'wikilink')
      return link ? wikilinkToMarkdown(link) : ''
    }
    case 'blockquote': {
      const body = inlinesToMarkdown(block.inlines ?? [])
      if (!body) return '>'
      return body.split('\n').map(line => `> ${line}`).join('\n')
    }
    case 'callout': {
      const kind = block.calloutKind ?? 'note'
      const title = (block.text ?? '').trim()
      const head = title ? `> [!${kind}] ${title}` : `> [!${kind}]`
      const body = inlinesToMarkdown(block.inlines ?? [])
      if (!body.trim()) return head
      const bodyLines = body.split('\n').map(line => `> ${line}`)
      return [head, ...bodyLines].join('\n')
    }
    case 'divider':
      return '---'
    case 'image': {
      const alt = block.alt ?? ''
      const url = block.url ?? ''
      const title = block.title?.trim()
      if (title) {
        return `![${alt}](${url} "${title.replace(/"/g, '\\"')}")`
      }
      return `![${alt}](${url})`
    }
    case 'fallback':
      return block.raw ?? ''
    default: {
      const _exhaustive: never = block.type
      return _exhaustive
    }
  }
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
