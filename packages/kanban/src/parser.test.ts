import { describe, expect, it } from 'vitest'

import { SAMPLE_BOARD, SAMPLE_WITH_SUFFIX } from './fixtures/boards'
import {
  isKanbanBoard,
  normalizeKanbanMarkdown,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
} from './parser'

describe('parseKanbanMarkdown', () => {
  it('detects kanban frontmatter', () => {
    const board = parseKanbanMarkdown(SAMPLE_BOARD)
    expect(isKanbanBoard(board.frontmatter)).toBe(true)
    expect(board.columns).toHaveLength(3)
    expect(board.columns[0]?.title).toBe('To Do')
    expect(board.columns[2]?.cards[0]?.checked).toBe(true)
  })

  it('round-trips standard board', () => {
    const board = parseKanbanMarkdown(SAMPLE_BOARD)
    const output = serializeKanbanMarkdown(board)
    expect(normalizeKanbanMarkdown(output)).toBe(normalizeKanbanMarkdown(SAMPLE_BOARD))
  })

  it('preserves suffix metadata blocks', () => {
    const board = parseKanbanMarkdown(SAMPLE_WITH_SUFFIX)
    expect(board.suffix).toContain('kanban:settings')
    const output = serializeKanbanMarkdown(board)
    expect(output).toContain('kanban:settings')
  })
})
