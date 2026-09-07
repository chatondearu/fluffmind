import type { InlineNode } from './types'

/** Schemes safe to render as a clickable link href. */
const SAFE_LINK_SCHEME = /^(?:https?|mailto|tel):/i
// Control chars + whitespace that can smuggle a scheme past detection (e.g. `java\tscript:`).
const URL_STRIP = /[\u0000-\u001F\u007F-\u009F\s]/g

/**
 * Neutralize dangerous link URLs before they reach a rendered `href`. Relative URLs,
 * fragments and query strings (no scheme) pass through untouched; absolute URLs are
 * only allowed for http(s)/mailto/tel. `javascript:`, `data:`, `vbscript:`, … collapse
 * to an empty href so a note synced from disk or a pasted link can't execute script.
 */
export function sanitizeLinkUrl(url: string | undefined): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  const stripped = raw.replace(URL_STRIP, '')
  // No leading scheme → relative/anchor/query, safe.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(stripped)) return raw
  return SAFE_LINK_SCHEME.test(stripped) ? raw : ''
}

const INLINE_CODE_CLASS = 'rounded bg-on-surface/8 px-1 font-mono text-[0.9em]'
const LINK_CLASS = 'text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
const WIKILINK_CLASS = 'rounded-sm px-0.5 font-medium underline underline-offset-2 text-primary decoration-primary/40 hover:decoration-primary'

function domChildrenToInlines(parent: ParentNode): InlineNode[] {
  const inlines: InlineNode[] = []

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3) {
      inlines.push({ type: 'text', value: child.nodeValue ?? '' })
      continue
    }

    if (child.nodeType !== 1) continue

    const element = child as HTMLElement
    const tagName = element.tagName

    if (tagName === 'BR') {
      inlines.push({ type: 'text', value: '\n' })
    }
    else if (tagName === 'STRONG' || tagName === 'B') {
      inlines.push({ type: 'strong', value: '', children: domChildrenToInlines(element) })
    }
    else if (tagName === 'EM' || tagName === 'I') {
      inlines.push({ type: 'emphasis', value: '', children: domChildrenToInlines(element) })
    }
    else if (tagName === 'CODE') {
      inlines.push({ type: 'inlineCode', value: element.textContent ?? '' })
    }
    else if (tagName === 'A' && element.dataset.wikilink === 'true') {
      const alias = element.dataset.alias
      const target = element.dataset.target ?? ''
      inlines.push({
        type: 'wikilink',
        value: alias ?? element.textContent ?? target,
        target,
        ...(alias === undefined ? {} : { alias }),
      })
    }
    else if (tagName === 'A' && element.hasAttribute('href')) {
      inlines.push({
        type: 'link',
        value: '',
        url: element.getAttribute('href') ?? '',
        children: domChildrenToInlines(element),
      })
    }
    else if (tagName === 'A') {
      inlines.push(...domChildrenToInlines(element))
    }
    else {
      inlines.push(...domChildrenToInlines(element))
    }
  }

  return inlines
}

/** Parse a contenteditable root into inline nodes. */
export function domToInlines(root: HTMLElement): InlineNode[] {
  return domChildrenToInlines(root)
}

function renderInline(document: Document, inline: InlineNode): Node {
  if (inline.type === 'text') {
    return document.createTextNode(inline.value)
  }

  if (inline.type === 'inlineCode') {
    const code = document.createElement('code')
    code.className = INLINE_CODE_CLASS
    code.textContent = inline.value
    return code
  }

  if (inline.type === 'wikilink') {
    const link = document.createElement('a')
    const target = inline.target ?? ''
    link.href = `/notes/${encodeURI(target)}`
    link.className = WIKILINK_CLASS
    link.dataset.wikilink = 'true'
    link.dataset.target = target
    if (inline.alias !== undefined) link.dataset.alias = inline.alias
    link.title = target
    link.textContent = inline.alias ?? (inline.value || target)
    return link
  }

  const element = document.createElement(inline.type === 'strong' ? 'strong' : inline.type === 'emphasis' ? 'em' : 'a')
  const children = inline.children?.length
    ? inline.children.map(child => renderInline(document, child))
    : [document.createTextNode(inline.value || inline.url || '')]
  element.append(...children)

  if (inline.type === 'link') {
    element.setAttribute('href', sanitizeLinkUrl(inline.url))
    element.className = LINK_CLASS
    element.setAttribute('target', '_blank')
    element.setAttribute('rel', 'noopener noreferrer')
  }

  return element
}

/** Replace root children with a DOM render of inlines (no Vue). */
export function writeInlinesToDom(root: HTMLElement, inlines: InlineNode[]): void {
  const document = root.ownerDocument
  root.replaceChildren(...inlines.map(inline => renderInline(document, inline)))
}
