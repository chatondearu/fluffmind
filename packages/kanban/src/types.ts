export interface KanbanCard {
  text: string
  checked: boolean
}

export interface KanbanColumn {
  title: string
  cards: KanbanCard[]
}

export interface KanbanBoard {
  frontmatter: Record<string, unknown>
  /** Markdown between frontmatter and the first `##` column (preserved). */
  prefix: string
  columns: KanbanColumn[]
  /** Trailing markdown after the last column (settings blocks, archive). */
  suffix: string
}
