<script setup lang="ts">
import type { NoteSummary, ResolvedLink } from '../../../server/vault/index'

interface NoteDetailResponse {
  note: { id: string, title: string, frontmatter: Record<string, unknown>, html: string }
  links: ResolvedLink[]
  backlinks: NoteSummary[]
}

const route = useRoute()
const id = computed(() => {
  const slug = route.params.slug
  return Array.isArray(slug) ? slug.join('/') : String(slug)
})

const { data, error } = await useFetch<NoteDetailResponse>(() => `/api/notes/${id.value}`)
</script>

<template>
  <main class="mx-auto max-w-2xl p-6">
    <NuxtLink to="/" class="text-sm text-primary hover:underline">← All notes</NuxtLink>

    <div v-if="error" class="mt-4 text-error">
      Note not found.
    </div>
    <template v-else-if="data">
      <h1 class="mb-4 mt-2 text-2xl font-semibold text-on-surface">
        {{ data.note.title }}
      </h1>
      <!-- eslint-disable-next-line vue/no-v-html -- server-rendered from our own markdown, not user input -->
      <div class="note-content text-on-surface" v-html="data.note.html" />
      <section v-if="data.backlinks.length" class="mt-8 border-t border-outline-variant pt-4">
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
