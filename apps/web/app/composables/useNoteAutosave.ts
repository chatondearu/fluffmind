import { $fetch } from 'ofetch'
import { blockPlainText, serializeDocument } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'
import type { Ref } from 'vue'

import { isDocumentEmpty, noteIdFromBlocks } from '../utils/note-document'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.statusMessage ?? asRecord?.data?.message ?? asRecord?.statusMessage ?? 'Save failed.'
}

export function useNoteAutosave(options: {
  noteId: Ref<string>
  blocks: Ref<BlockNode[]>
  isNew: Ref<boolean>
  onCreated: (id: string) => void | Promise<void>
}) {
  const status = ref<AutosaveStatus>('idle')
  const errorMessage = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function persist() {
    if (isDocumentEmpty(options.blocks.value)) {
      return
    }

    status.value = 'saving'
    errorMessage.value = null

    try {
      const content = serializeDocument({ blocks: options.blocks.value })

      if (options.isNew.value) {
        let id = noteIdFromBlocks(options.blocks.value)
        try {
          await $fetch('/api/notes', { method: 'POST', body: { id, content } })
        } catch (error) {
          const asRecord = error as { statusCode?: number }
          if (asRecord.statusCode === 409) {
            id = `${id}-${Date.now().toString(36).slice(-4)}`
            await $fetch('/api/notes', { method: 'POST', body: { id, content } })
          } else {
            throw error
          }
        }
        options.isNew.value = false
        options.noteId.value = id
        await options.onCreated(id)
      } else {
        await $fetch(`/api/notes/${options.noteId.value}`, { method: 'PUT', body: { content } })
      }

      status.value = 'saved'
    } catch (error) {
      status.value = 'error'
      errorMessage.value = extractErrorMessage(error)
    }
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void persist()
    }, 800)
  }

  watch(
    () => options.blocks.value,
    () => scheduleSave(),
    { deep: true },
  )

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    status,
    errorMessage,
    saveNow: persist,
  }
}

export function displayTitleFromBlocks(blocks: BlockNode[]): string {
  const heading = blocks.find(block => block.type === 'heading')
  if (heading) {
    const title = blockPlainText(heading).trim()
    if (title) return title
  }
  const paragraph = blocks.find(block => block.type === 'paragraph')
  if (paragraph) {
    const line = blockPlainText(paragraph).split('\n')[0]?.trim() ?? ''
    if (line && !line.startsWith('/')) return line
  }
  return 'Sans titre'
}
