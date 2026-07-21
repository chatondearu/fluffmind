import type { InlineNode } from './types'

export type InputRuleMatch =
  | { kind: 'strong' | 'emphasis' | 'inlineCode', start: number, end: number, content: string }
  | { kind: 'link', start: number, end: number, content: string, url: string }
  | { kind: 'wikilink', start: number, end: number, target: string, alias?: string }

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++
  }
  return backslashes % 2 === 1
}

function tryMatchWikilink(text: string, caret: number): InputRuleMatch | null {
  if (caret < 4 || text[caret - 1] !== ']' || text[caret - 2] !== ']') {
    return null
  }
  if (isEscaped(text, caret - 1) || isEscaped(text, caret - 2)) {
    return null
  }

  for (let i = caret - 3; i >= 1; i--) {
    if (text[i] !== '[' || text[i - 1] !== '[') {
      continue
    }
    if (isEscaped(text, i) || isEscaped(text, i - 1)) {
      continue
    }

    const inner = text.slice(i + 1, caret - 2)
    if (!inner) {
      return null
    }

    const pipeIndex = inner.indexOf('|')
    if (pipeIndex >= 0) {
      const target = inner.slice(0, pipeIndex)
      const alias = inner.slice(pipeIndex + 1)
      if (!target) {
        return null
      }
      return {
        kind: 'wikilink',
        start: i - 1,
        end: caret,
        target,
        alias: alias || undefined,
      }
    }

    return { kind: 'wikilink', start: i - 1, end: caret, target: inner }
  }

  return null
}

function tryMatchLink(text: string, caret: number): InputRuleMatch | null {
  if (caret < 4 || text[caret - 1] !== ')' || isEscaped(text, caret - 1)) {
    return null
  }

  let parenStart = -1
  for (let i = caret - 2; i >= 0; i--) {
    if (text[i] === '(' && !isEscaped(text, i)) {
      parenStart = i
      break
    }
  }
  if (parenStart < 1) {
    return null
  }

  const url = text.slice(parenStart + 1, caret - 1)
  if (!url) {
    return null
  }

  if (text[parenStart - 1] !== ']' || isEscaped(text, parenStart - 1)) {
    return null
  }

  let bracketStart = -1
  for (let i = parenStart - 2; i >= 0; i--) {
    if (text[i] === '[' && !isEscaped(text, i)) {
      bracketStart = i
      break
    }
  }
  if (bracketStart < 0) {
    return null
  }

  const content = text.slice(bracketStart + 1, parenStart - 1)
  if (!content) {
    return null
  }

  return { kind: 'link', start: bracketStart, end: caret, content, url }
}

function tryMatchStrong(text: string, caret: number): InputRuleMatch | null {
  for (const delimiter of ['**', '__'] as const) {
    if (caret < delimiter.length * 2) {
      continue
    }

    const closeStart = caret - delimiter.length
    if (text.slice(closeStart, caret) !== delimiter || isEscaped(text, closeStart)) {
      continue
    }

    for (let i = closeStart - delimiter.length; i >= 0; i--) {
      if (text.slice(i, i + delimiter.length) !== delimiter || isEscaped(text, i)) {
        continue
      }

      const content = text.slice(i + delimiter.length, closeStart)
      if (!content) {
        return null
      }

      return { kind: 'strong', start: i, end: caret, content }
    }
  }

  return null
}

function tryMatchInlineCode(text: string, caret: number): InputRuleMatch | null {
  if (caret < 2 || text[caret - 1] !== '`' || isEscaped(text, caret - 1)) {
    return null
  }

  for (let i = caret - 2; i >= 0; i--) {
    if (text[i] !== '`' || isEscaped(text, i)) {
      continue
    }

    const content = text.slice(i + 1, caret - 1)
    if (!content) {
      return null
    }

    return { kind: 'inlineCode', start: i, end: caret, content }
  }

  return null
}

function tryMatchEmphasis(text: string, caret: number): InputRuleMatch | null {
  if (caret < 2) {
    return null
  }

  const closeChar = text[caret - 1]
  if ((closeChar !== '*' && closeChar !== '_') || isEscaped(text, caret - 1)) {
    return null
  }

  if (
    (caret >= 2 && text[caret - 2] === closeChar)
    || (caret < text.length && text[caret] === closeChar)
  ) {
    return null
  }

  for (let i = caret - 2; i >= 0; i--) {
    if (text[i] !== closeChar || isEscaped(text, i)) {
      continue
    }
    if (
      (i > 0 && text[i - 1] === closeChar)
      || (i + 1 < text.length && text[i + 1] === closeChar)
    ) {
      continue
    }

    const content = text.slice(i + 1, caret - 1)
    if (!content) {
      return null
    }

    return { kind: 'emphasis', start: i, end: caret, content }
  }

  return null
}

/** Match a just-closed markdown mark ending at `caret` inside `text` (one text leaf). */
export function matchInputRule(text: string, caret: number): InputRuleMatch | null {
  if (caret < 0 || caret > text.length) {
    return null
  }

  return tryMatchWikilink(text, caret)
    ?? tryMatchLink(text, caret)
    ?? tryMatchStrong(text, caret)
    ?? tryMatchInlineCode(text, caret)
    ?? tryMatchEmphasis(text, caret)
}

function buildMarkNode(match: InputRuleMatch): InlineNode {
  switch (match.kind) {
    case 'strong':
      return { type: 'strong', value: '', children: [{ type: 'text', value: match.content }] }
    case 'emphasis':
      return { type: 'emphasis', value: '', children: [{ type: 'text', value: match.content }] }
    case 'inlineCode':
      return { type: 'inlineCode', value: match.content }
    case 'link':
      return {
        type: 'link',
        value: '',
        url: match.url,
        children: [{ type: 'text', value: match.content }],
      }
    case 'wikilink':
      return {
        type: 'wikilink',
        value: match.alias ?? match.target,
        target: match.target,
        ...(match.alias ? { alias: match.alias } : {}),
      }
  }
}

function plainContentLength(match: InputRuleMatch): number {
  switch (match.kind) {
    case 'strong':
    case 'emphasis':
    case 'inlineCode':
    case 'link':
      return match.content.length
    case 'wikilink':
      return (match.alias ?? match.target).length
  }
}

/** Replace the matched span in `text` with structured inlines; caret after the mark. */
export function applyInputRule(
  text: string,
  match: InputRuleMatch,
): { inlines: InlineNode[], caret: number } {
  const before = text.slice(0, match.start)
  const after = text.slice(match.end)
  const inlines: InlineNode[] = []

  if (before) {
    inlines.push({ type: 'text', value: before })
  }
  inlines.push(buildMarkNode(match))
  if (after) {
    inlines.push({ type: 'text', value: after })
  }

  return {
    inlines,
    caret: before.length + plainContentLength(match),
  }
}
