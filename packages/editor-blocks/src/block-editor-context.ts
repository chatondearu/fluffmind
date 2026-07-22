import type { InjectionKey, Ref } from 'vue'

import type { InlinePromptKind } from './inline-prompt'
import type { BlockNode } from './types'

export interface BlockEditorContext {
  blockIndex: Ref<number | null>
  blocks: Ref<BlockNode[]>
  registerSurface: (blockId: string, surface: { focus: (offset?: number) => void, getOffset: () => number }) => void
  unregisterSurface: (blockId: string) => void
  vaultNotes: Ref<Array<{ id: string, title: string }>>
  requestInlinePrompt: (kind: InlinePromptKind) => Promise<string | null>
}

export const blockEditorContextKey: InjectionKey<BlockEditorContext> = Symbol('blockEditorContext')
