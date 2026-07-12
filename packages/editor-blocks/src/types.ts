/** Block document model for P3 editor (#56+). */

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'code'
  | 'table'
  | 'noteLink'
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
  level?: number
  lang?: string | null
  text?: string
  inlines?: InlineNode[]
  children?: BlockNode[]
  rows?: TableRow[]
  raw?: string
}

export interface BlockDocument {
  blocks: BlockNode[]
}

export interface RoundTripResult {
  input: string
  output: string
  blocks: BlockNode[]
}
