/** Spike block document model for P3 round-trip validation (#55). */

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'code'
  | 'fallback'

export type InlineType = 'text' | 'strong' | 'emphasis' | 'inlineCode' | 'link'

export interface InlineNode {
  type: InlineType
  value: string
  url?: string
  children?: InlineNode[]
}

export interface BlockNode {
  type: BlockType
  /** Heading depth 1–6. */
  level?: number
  /** Fenced code language tag. */
  lang?: string | null
  /** Paragraph, heading, or code body text. */
  text?: string
  /** Inline content for paragraph / heading. */
  inlines?: InlineNode[]
  /** Nested blocks (lists, fallback). */
  children?: BlockNode[]
  /** Raw markdown preserved for unknown mdast nodes. */
  raw?: string
}

export interface RoundTripResult {
  input: string
  output: string
  blocks: BlockNode[]
}
