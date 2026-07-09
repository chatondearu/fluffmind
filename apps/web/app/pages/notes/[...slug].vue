<script setup lang="ts">
import { $fetch } from 'ofetch'
import { BlockEditor, parseMarkdownToDocument, serializeDocument } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import type { NoteSummary, ResolvedLink } from '../../../server/vault/index'

interface NoteDetailResponse {
  note: { id: string, title: string, frontmatter: Record<string, unknown>, content: string, html: string }
  links: ResolvedLink[]
  backlinks: NoteSummary[]
}

const route = useRoute()
const id = computed(() => {
  const slug = route.params.slug
  return Array.isArray(slug) ? slug.join('/') : String(slug)
})

const { data, error, refresh } = await useFetch<NoteDetailResponse>(() => `/api/notes/${id.value}`)

const editing = ref(false)
const blocks = ref<BlockNode[]>([])
const saving = ref(false)
const saveError = ref<string | null>(null)

function startEditing() {
  blocks.value = parseMarkdownToDocument(data.value?.note.content ?? '').blocks
  saveError.value = null
  editing.value = true
}

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.message ?? asRecord?.data?.statusMessage ?? asRecord?.statusMessage ?? 'Save failed.'
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    const content = serializeDocument({ blocks: blocks.value })
    await $fetch(`/api/notes/${id.value}`, { method: 'PUT', body: { content } })
    await refresh()
    editing.value = false
  } catch (err) {
    saveError.value = extractErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6">
    <NuxtLink to="/" class="text-sm text-primary hover:underline">← All notes</NuxtLink>

    <div v-if="error" class="mt-4 text-error">
      Note not found.
    </div>
    <template v-else-if="data">
      <div class="mb-4 mt-2 flex items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold text-on-surface">
          {{ data.note.title }}
        </h1>
        <FluffmindButton v-if="!editing" variant="text" @click="startEditing">
          Edit
        </FluffmindButton>
      </div>

      <template v-if="editing">
        <BlockEditor v-model="blocks" />
        <p v-if="saveError" class="mt-2 text-sm text-error">
          {{ saveError }}
        </p>
        <div class="mt-3 flex gap-2">
          <FluffmindButton :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </FluffmindButton>
          <FluffmindButton variant="outlined" :disabled="saving" @click="editing = false">
            Cancel
          </FluffmindButton>
        </div>
      </template>
      <!-- eslint-disable-next-line vue/no-v-html -- server-rendered from our own markdown, not user input -->
      <div v-else class="note-content text-on-surface" v-html="data.note.html" />

      <section v-if="!editing && data.backlinks.length" class="mt-8 border-t border-outline-variant pt-4">
        <h2 class="mb-2 text-sm font-medium uppercase text-on-surface-variant">
          Linked from
        </h2>
        <ul class="flex flex-col gap-1">
          <li v-for="backlink in data.backlinks" :key="backlink.id">
            <NuxtLink :to="`/notes/${backlink.id}`" class="text-primary hover:underline">
              {{ backlink.title }}
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style>
/* Not scoped on purpose: this styles server-rendered HTML injected via v-html,
   which scoped styles (data-v-* attributes) never reach. */
.note-content .dead-link {
  color: var(--md-error);
  text-decoration: underline dashed;
}
</style>
