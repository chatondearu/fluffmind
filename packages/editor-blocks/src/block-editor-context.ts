import type { InjectionKey, Ref } from 'vue'

export interface BlockEditorContext {
  blockIndex: Ref<number | null>
  registerSurface: (blockId: string, surface: { focus: (offset?: number) => void, getOffset: () => number }) => void
  unregisterSurface: (blockId: string) => void
  vaultNotes: Ref<Array<{ id: string, title: string }>>
}

export const blockEditorContextKey: InjectionKey<BlockEditorContext> = Symbol('blockEditorContext')
