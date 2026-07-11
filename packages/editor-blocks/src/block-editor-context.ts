import type { InjectionKey, Ref } from 'vue'

export interface BlockEditorContext {
  blockIndex: Ref<number | null>
  registerSurface: (index: number, surface: { focus: (offset?: number) => void }) => void
  unregisterSurface: (index: number) => void
}

export const blockEditorContextKey: InjectionKey<BlockEditorContext> = Symbol('blockEditorContext')
