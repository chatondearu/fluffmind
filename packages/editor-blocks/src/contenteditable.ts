export function isSelectionCollapsed(element: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return true
  }
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) {
    return true
  }
  return range.collapsed
}

export function getSelectionOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return element.innerText.length
  }
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) {
    return element.innerText.length
  }
  const preRange = range.cloneRange()
  preRange.selectNodeContents(element)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

export function setSelectionOffset(element: HTMLElement, offset: number): void {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode()

  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const parent = node.parentElement
      if (remaining === length && parent?.matches('strong, b, em, i, code, a')) {
        range.setStartAfter(parent)
      }
      else {
        range.setStart(node, remaining)
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }

  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function focusElement(element: HTMLElement | null | undefined, offset?: number): void {
  if (!element) return
  element.focus()
  if (offset !== undefined) {
    requestAnimationFrame(() => setSelectionOffset(element, offset))
  }
}
