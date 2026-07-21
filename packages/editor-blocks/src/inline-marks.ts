import { inlinesToPlainText } from './inlines'
import type { InlineNode } from './types'

export type ToggleableMark = 'strong' | 'emphasis' | 'inlineCode'

function nodePlainLength(node: InlineNode): number {
  return inlinesToPlainText([node]).length
}

function mergeAdjacentText(inlines: InlineNode[]): InlineNode[] {
  const result: InlineNode[] = []
  for (const node of inlines) {
    const prev = result[result.length - 1]
    if (prev?.type === 'text' && node.type === 'text') {
      prev.value += node.value
    }
    else {
      result.push({ ...node })
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

  if (node.type === 'wikilink') {
    return {
      left: {
        type: 'wikilink',
        value: node.value.slice(0, offset),
        target: node.target ?? node.value,
        ...(node.alias ? { alias: node.alias } : {}),
      },
      right: {
        type: 'wikilink',
        value: node.value.slice(offset),
        target: node.target ?? node.value,
        ...(node.alias ? { alias: node.alias } : {}),
      },
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

function extractRange(
  inlines: InlineNode[],
  from: number,
  to: number,
): { left: InlineNode[], middle: InlineNode[], right: InlineNode[] } {
  const { left, right: fromToEnd } = splitInlines(inlines, from)
  const { left: middle, right } = splitInlines(fromToEnd, to - from)
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
    return middle.length === 1
      && middle[0]!.type === 'inlineCode'
      && middle[0]!.value === plain
  }

  return middle.length === 1
    && middle[0]!.type === mark
    && inlinesToPlainText(middle[0]!.children ?? []) === plain
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
  return mergeAdjacentText(result)
}

function wrapMark(nodes: InlineNode[], mark: ToggleableMark): InlineNode[] {
  const plain = inlinesToPlainText(nodes)
  if (!plain) {
    return nodes
  }
  if (mark === 'inlineCode') {
    return [{ type: 'inlineCode', value: plain }]
  }
  return [{ type: mark, value: '', children: nodes }]
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
  return mergeAdjacentText([...left, ...nextMiddle, ...right])
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
  return mergeAdjacentText([...left, linkNode, ...right])
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
  return mergeAdjacentText([...left, wikilink, ...right])
}
