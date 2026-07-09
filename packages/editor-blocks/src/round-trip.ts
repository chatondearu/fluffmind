import { remark } from 'remark'

import { blocksToMarkdown } from './blocks-to-markdown.ts'
import { mdastToBlocks } from './mdast-to-blocks.ts'
import type { RoundTripResult } from './types.ts'

const processor = remark()

/** Parse markdown → mdast → blocks → markdown (P3 spike pipeline). */
export function roundTripMarkdown(input: string): RoundTripResult {
  const ast = processor.parse(input)
  const blocks = mdastToBlocks(ast)
  const output = blocksToMarkdown(blocks)
  return { input, output, blocks }
}

/** Normalize markdown for stable round-trip comparison in tests. */
export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}
