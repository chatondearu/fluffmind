import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

/** Shared markdown parser (GFM tables + standard mdast). */
export const markdownProcessor = remark().use(remarkGfm)
