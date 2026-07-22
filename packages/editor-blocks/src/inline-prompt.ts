export type InlinePromptKind = 'link' | 'wikilink'

export interface InlinePromptController {
  request: (kind: InlinePromptKind) => Promise<string | null>
  confirm: (value: string | null) => void
  dispose: () => void
}

export function createInlinePromptController(
  onRequest: (kind: InlinePromptKind) => void,
): InlinePromptController {
  let resolvePending: ((value: string | null) => void) | null = null

  function settle(value: string | null) {
    const resolve = resolvePending
    resolvePending = null
    resolve?.(value)
  }

  return {
    request(kind) {
      settle(null)
      return new Promise<string | null>((resolve) => {
        resolvePending = resolve
        onRequest(kind)
      })
    },
    confirm(value) {
      settle(value)
    },
    dispose() {
      settle(null)
    },
  }
}
