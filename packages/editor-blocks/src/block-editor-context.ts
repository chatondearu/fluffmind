import type { InjectionKey, Ref } from 'vue'

export interface BlockEditorContext {
  blockIndex: Ref<number | null>
  registerSurface: (blockId: string, surface: { focus: (offset?: number) => void }) => void
  unregisterSurface: (blockId: string) => void
}

export const blockEditorContextKey: InjectionKey<BlockEditorContext> = Symbol('blockEditorContext')
