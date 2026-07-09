import matter from 'gray-matter'

import type { KanbanBoard, KanbanCard, KanbanColumn } from './types'

const HEADING_RE = /^## (.+)$/
const CHECKBOX_ITEM_RE = /^- \[([ xX])\] (.*)$/
const PLAIN_ITEM_RE = /^- (.*)$/

/** True when frontmatter marks an Obsidian Kanban board file. */
export function isKanbanBoard(frontmatter: Record<string, unknown>): boolean {
  const marker = frontmatter['kanban-plugin']
  return marker === 'board' || marker === 'basic'
}

/** Parse a full markdown file into a Kanban board model. */
export function parseKanbanMarkdown(raw: string): KanbanBoard {
  const { data, content } = matter(raw)
  const parsed = parseKanbanBody(content)
  return {
    frontmatter: data as Record<string, unknown>,
    ...parsed,
  }
}

/** Serialize a board back to markdown (frontmatter + body). */
export function serializeKanbanMarkdown(board: KanbanBoard): string {
  const body = serializeKanbanBody(board)
  return matter.stringify(body, board.frontmatter)
}

function parseKanbanBody(body: string): Pick<KanbanBoard, 'prefix' | 'columns' | 'suffix'> {
  const lines = body.split('\n')
  let index = 0
  const prefixLines: string[] = []

  while (index < lines.length && !HEADING_RE.test(lines[index] ?? '')) {
    prefixLines.push(lines[index] ?? '')
    index++
  }

  const columns: KanbanColumn[] = []
  while (index < lines.length) {
    const headingLine = lines[index] ?? ''
    const headingMatch = headingLine.match(HEADING_RE)
    if (!headingMatch) {
      break
    }
    const title = headingMatch[1]!.trim()
    index++
    const cards: KanbanCard[] = []

    while (index < lines.length) {
      const line = lines[index] ?? ''
      if (HEADING_RE.test(line)) {
        break
      }
      if (line.trim() === '') {
        index++
        continue
      }

      const checkboxMatch = line.match(CHECKBOX_ITEM_RE)
      const plainMatch = line.match(PLAIN_ITEM_RE)
      if (!checkboxMatch && !plainMatch) {
        break
      }

      const checked = Boolean(checkboxMatch && /[xX]/.test(checkboxMatch[1]!))
      let text = (checkboxMatch?.[2] ?? plainMatch?.[1] ?? '').trimEnd()
      index++

      while (index < lines.length) {
        const continuation = lines[index] ?? ''
        if (HEADING_RE.test(continuation) || CHECKBOX_ITEM_RE.test(continuation) || PLAIN_ITEM_RE.test(continuation)) {
          break
        }
        if (continuation.trim() === '') {
          index++
          break
        }
        if (/^  /.test(continuation)) {
          text += `\n${continuation.trim()}`
          index++
          continue
        }
        break
      }

      cards.push({ text, checked })
    }

    columns.push({ title, cards })
  }

  const suffix = lines.slice(index).join('\n').trim()
  return {
    prefix: prefixLines.join('\n').trim(),
    columns,
    suffix,
  }
}

function serializeKanbanBody(board: KanbanBoard): string {
  const chunks: string[] = []
  if (board.prefix) {
    chunks.push(board.prefix)
  }
  for (const column of board.columns) {
    chunks.push(`## ${column.title}`)
    for (const card of column.cards) {
      const mark = card.checked ? 'x' : ' '
      const cardLines = card.text.split('\n')
      chunks.push(`- [${mark}] ${cardLines[0] ?? ''}`)
      for (const extra of cardLines.slice(1)) {
        chunks.push(`  ${extra}`)
      }
    }
    chunks.push('')
  }
  if (board.suffix) {
    chunks.push(board.suffix)
  }
  const result = `${chunks.join('\n').trim()}\n`
  if (!board.prefix && board.columns.length > 0) {
    return `\n${result}`
  }
  return result
}

/** Normalize markdown for stable test comparison. */
export function normalizeKanbanMarkdown(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim() + '\n'
}
