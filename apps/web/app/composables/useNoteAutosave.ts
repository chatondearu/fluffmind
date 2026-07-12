import { watchDebounced } from '@vueuse/core'
import { $fetch } from 'ofetch'
import { blockPlainText, serializeDocument } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'
import type { Ref } from 'vue'

import { isBodyEmpty, blocksWithTitle } from '../utils/note-title'
import { isDocumentEmpty, noteIdFromBlocks, sanitizeFolderFromQuery } from '../utils/note-document'
import { refreshVaultNotes } from './useVaultTree'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DEBOUNCE_MS = 1500
const AUTOSAVE_MAX_WAIT_MS = 8000

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.statusMessage ?? asRecord?.data?.message ?? asRecord?.statusMessage ?? 'Save failed.'
}

export function useNoteAutosave(options: {
  noteId: Ref<string>
  title: Ref<string>
  blocks: Ref<BlockNode[]>
  isNew: Ref<boolean>
  folderPrefix?: Ref<string | null>
  onCreated: (id: string) => void | Promise<void>
}) {
  const status = ref<AutosaveStatus>('idle')
  const errorMessage = ref<string | null>(null)
  let saveInFlight = false
  let saveQueued = false

  async function persist() {
    const documentBlocks = blocksWithTitle(options.title.value, options.blocks.value)
    if (isDocumentEmpty(documentBlocks) || (isBodyEmpty(options.blocks.value) && !options.title.value.trim())) {
      return
    }

    if (saveInFlight) {
      saveQueued = true
      return
    }

    saveInFlight = true
    status.value = 'saving'
    errorMessage.value = null

    try {
      const content = serializeDocument({ blocks: documentBlocks })

      if (options.isNew.value) {
        const folder = options.folderPrefix?.value ?? null
        let id = noteIdFromBlocks(documentBlocks, folder)
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
        await refreshVaultNotes()
        await options.onCreated(id)
      } else {
        await $fetch(`/api/notes/${options.noteId.value}`, { method: 'PUT', body: { content } })
        await refreshVaultNotes()
      }

      status.value = 'saved'
    } catch (error) {
      status.value = 'error'
      errorMessage.value = extractErrorMessage(error)
    } finally {
      saveInFlight = false
      if (saveQueued) {
        saveQueued = false
        void persist()
      }
    }
  }

  watchDebounced(
    () => [options.blocks.value, options.title.value] as const,
    () => { void persist() },
    { debounce: AUTOSAVE_DEBOUNCE_MS, maxWait: AUTOSAVE_MAX_WAIT_MS, deep: true },
  )

  onBeforeUnmount(() => {
    // Avoid triggering another reactive save cycle during teardown.
    void persist()
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
