import { inlinesToPlainText, stripCaretArtifacts } from './inlines'
import type { InlineNode } from './types'

export type ToggleableMark = 'strong' | 'emphasis' | 'inlineCode'

function nodePlainLength(node: InlineNode): number {
  return inlinesToPlainText([node]).length
}

function normalizeInlines(inlines: InlineNode[]): InlineNode[] {
  const result: InlineNode[] = []
  for (const node of inlines) {
    const normalized = node.children
      ? { ...node, children: normalizeInlines(node.children) }
      : { ...node }
    const prev = result[result.length - 1]
    if (prev?.type === 'text' && normalized.type === 'text') {
      prev.value += normalized.value
    }
    else if (
      prev
      && (normalized.type === 'strong' || normalized.type === 'emphasis')
      && prev.type === normalized.type
    ) {
      prev.children = normalizeInlines([
        ...(prev.children ?? [{ type: 'text', value: prev.value }]),
        ...(normalized.children ?? [{ type: 'text', value: normalized.value }]),
      ])
      prev.value = ''
    }
    else if (prev?.type === 'inlineCode' && normalized.type === 'inlineCode') {
      prev.value += normalized.value
    }
    else {
      result.push(normalized)
    }
  }
  return result
}

function splitNode(node: InlineNode, offset: number): { left: InlineNode | null, right: InlineNode | null } {
  const len = nodePlainLength(node)
  if (offset <= 0) {
    return { left: null, right: node }
  }
  if (offset >= len) {
    return { left: node, right: null }
  }

  if (node.type === 'text') {
    return {
      left: { type: 'text', value: node.value.slice(0, offset) },
      right: { type: 'text', value: node.value.slice(offset) },
    }
  }

  if (node.type === 'inlineCode') {
    return {
      left: { type: 'inlineCode', value: node.value.slice(0, offset) },
      right: { type: 'inlineCode', value: node.value.slice(offset) },
    }
  }

  if (node.children?.length) {
    const { left: leftChildren, right: rightChildren } = splitInlines(node.children, offset)
    const left = leftChildren.length > 0
      ? { ...node, value: '', children: leftChildren }
      : null
    const right = rightChildren.length > 0
      ? { ...node, value: '', children: rightChildren }
      : null
    return { left, right }
  }

  return { left: node, right: null }
}

function splitInlines(inlines: InlineNode[], offset: number): { left: InlineNode[], right: InlineNode[] } {
  if (offset <= 0) {
    return { left: [], right: inlines }
  }

  const left: InlineNode[] = []
  let remaining = offset

  for (let i = 0; i < inlines.length; i++) {
    const node = inlines[i]!
    const len = nodePlainLength(node)
    if (remaining >= len) {
      left.push(node)
      remaining -= len
      continue
    }

    const { left: nodeLeft, right: nodeRight } = splitNode(node, remaining)
    if (nodeLeft) {
      left.push(nodeLeft)
    }
    const right = nodeRight ? [nodeRight, ...inlines.slice(i + 1)] : inlines.slice(i + 1)
    return { left, right }
  }

  return { left, right: [] }
}

/**
 * Split inline nodes at a plain-text caret offset (same offset space as
 * `getSelectionOffset`), unlike `blockEditableText` which is markdown.
 * Used by Enter/Shift+Enter so marks aren't corrupted by mismatched offsets.
 */
export function splitInlinesAt(
  inlines: InlineNode[],
  offset: number,
): { before: InlineNode[], after: InlineNode[] } {
  const clean = stripCaretArtifacts(inlines)
  const total = inlinesToPlainText(clean).length
  const clamped = Math.max(0, Math.min(offset, total))
  const { left, right } = splitInlines(clean, clamped)
  return {
    before: left.length > 0 ? normalizeInlines(left) : [{ type: 'text', value: '' }],
    after: right.length > 0 ? normalizeInlines(right) : [{ type: 'text', value: '' }],
  }
}

interface PlainRange {
  start: number
  end: number
}

function atomicRanges(inlines: InlineNode[], offset = 0): PlainRange[] {
  const ranges: PlainRange[] = []
  let cursor = offset
  for (const node of inlines) {
    const length = nodePlainLength(node)
    if (node.type === 'link' || node.type === 'wikilink') {
      ranges.push({ start: cursor, end: cursor + length })
    }
    else if (node.children?.length) {
      ranges.push(...atomicRanges(node.children, cursor))
    }
    cursor += length
  }
  return ranges
}

function expandAcrossAtomicNodes(
  inlines: InlineNode[],
  from: number,
  to: number,
): { from: number, to: number } {
  let expandedFrom = from
  let expandedTo = to
  for (const range of atomicRanges(inlines)) {
    if (expandedFrom > range.start && expandedFrom < range.end) {
      expandedFrom = range.start
    }
    if (expandedTo > range.start && expandedTo < range.end) {
      expandedTo = range.end
    }
  }
  return { from: expandedFrom, to: expandedTo }
}

function extractRange(
  inlines: InlineNode[],
  from: number,
  to: number,
): { left: InlineNode[], middle: InlineNode[], right: InlineNode[] } {
  const expanded = expandAcrossAtomicNodes(inlines, from, to)
  const { left, right: fromToEnd } = splitInlines(inlines, expanded.from)
  const { left: middle, right } = splitInlines(fromToEnd, expanded.to - expanded.from)
  return { left, middle, right }
}

export function selectionHasMark(
  inlines: InlineNode[],
  from: number,
  to: number,
  mark: ToggleableMark,
): boolean {
  const { middle } = extractRange(inlines, from, to)
  const plain = inlinesToPlainText(middle)
  if (!plain) {
    return false
  }

  if (mark === 'inlineCode') {
    return middle.every(node => node.type === 'inlineCode')
  }

  return middle.every(node => node.type === mark)
}

function unwrapMark(nodes: InlineNode[], mark: ToggleableMark): InlineNode[] {
  const result: InlineNode[] = []
  for (const node of nodes) {
    if (node.type === mark) {
      if (mark === 'inlineCode') {
        result.push({ type: 'text', value: node.value })
      }
      else {
        result.push(...(node.children ?? [{ type: 'text', value: node.value }]))
      }
    }
    else {
      result.push(node)
    }
  }
  return normalizeInlines(result)
}

function wrapMark(nodes: InlineNode[], mark: ToggleableMark): InlineNode[] {
  const plain = inlinesToPlainText(nodes)
  if (!plain) {
    return nodes
  }
  if (mark === 'inlineCode') {
    return [{ type: 'inlineCode', value: plain }]
  }
  const children = nodes.flatMap(node => node.type === mark
    ? node.children ?? [{ type: 'text' as const, value: node.value }]
    : [node])
  return [{ type: mark, value: '', children: normalizeInlines(children) }]
}

export function toggleMark(
  inlines: InlineNode[],
  from: number,
  to: number,
  mark: ToggleableMark,
): InlineNode[] {
  const { left, middle, right } = extractRange(inlines, from, to)
  const nextMiddle = selectionHasMark(inlines, from, to, mark)
    ? unwrapMark(middle, mark)
    : wrapMark(middle, mark)
  return normalizeInlines([...left, ...nextMiddle, ...right])
}

export function wrapLink(
  inlines: InlineNode[],
  from: number,
  to: number,
  url: string,
): InlineNode[] {
  const { left, middle, right } = extractRange(inlines, from, to)
  const plain = inlinesToPlainText(middle)
  if (!plain) {
    return inlines
  }
  const linkNode: InlineNode = {
    type: 'link',
    value: '',
    url,
    children: middle.length > 0 ? middle : [{ type: 'text', value: plain }],
  }
  return normalizeInlines([...left, linkNode, ...right])
}

export function wrapWikilink(
  inlines: InlineNode[],
  from: number,
  to: number,
  target: string,
  alias?: string,
): InlineNode[] {
  const { left, middle, right } = extractRange(inlines, from, to)
  const plain = inlinesToPlainText(middle)
  if (!plain) {
    return inlines
  }
  const wikilink: InlineNode = {
    type: 'wikilink',
    value: alias ?? plain,
    target,
    ...(alias ? { alias } : {}),
  }
  return normalizeInlines([...left, wikilink, ...right])
}
