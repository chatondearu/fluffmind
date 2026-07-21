/** Block document model for P3 editor (#56+). */

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'listItem'
  | 'code'
  | 'table'
  | 'noteLink'
  | 'blockquote'
  | 'divider'
  | 'image'
  | 'callout'
  | 'mermaid'
  | 'fallback'

export type InlineType =
  | 'text'
  | 'strong'
  | 'emphasis'
  | 'inlineCode'
  | 'link'
  | 'wikilink'

export interface InlineNode {
  type: InlineType
  value: string
  url?: string
  target?: string
  alias?: string
  children?: InlineNode[]
}

export interface TableRow {
  cells: InlineNode[][]
}

export interface BlockNode {
  id: string
  type: BlockType
  /** Heading depth (1–6). */
  level?: number
  /**
   * Nesting depth for list item blocks (0 = top-level).
   * Used by bulletList / orderedList / taskList when each block is a single list item.
   */
  indent?: number
  /** GFM task list checked state. */
  checked?: boolean
  lang?: string | null
  text?: string
  inlines?: InlineNode[]
  children?: BlockNode[]
  rows?: TableRow[]
  raw?: string
  /** Image / link URL. */
  url?: string
  /** Image alt text. */
  alt?: string
  /** Image title attribute. */
  title?: string
  /** Obsidian callout kind (`note`, `tip`, `warning`, …). */
  calloutKind?: string
}

export interface BlockDocument {
  blocks: BlockNode[]
}

export interface RoundTripResult {
  input: string
  output: string
  blocks: BlockNode[]
}
