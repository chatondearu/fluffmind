<script setup lang="ts">
import { isKanbanBoard } from '@fluffmind/kanban'
import {
  FluffmindButton,
  FluffmindChip,
  FluffmindDialog,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

import { buildNoteSourceFile } from '../utils/note-source'

const open = defineModel<boolean>('open', { default: false })
const frontmatter = defineModel<Record<string, unknown>>('frontmatter', { required: true })

const tagInput = ref('')
const description = computed({
  get: () => typeof frontmatter.value.description === 'string' ? frontmatter.value.description : '',
  set: (value: string) => {
    if (value.trim()) {
      frontmatter.value = { ...frontmatter.value, description: value }
    } else {
      const next = { ...frontmatter.value }
      delete next.description
      frontmatter.value = next
    }
  },
})

const tags = computed({
  get: (): string[] => {
    const raw = frontmatter.value.tags
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
  },
  set: (value: string[]) => {
    if (value.length === 0) {
      const next = { ...frontmatter.value }
      delete next.tags
      frontmatter.value = next
      return
    }
    frontmatter.value = { ...frontmatter.value, tags: value }
  },
})

const customFields = computed(() => {
  const reserved = new Set(['tags', 'description', 'kanban-plugin'])
  return Object.entries(frontmatter.value)
    .filter(([key]) => !reserved.has(key))
    .map(([key, value]) => ({ key, value: stringifyFieldValue(value) }))
})

const isKanban = computed(() => isKanbanBoard(frontmatter.value))

const yamlPreview = computed(() => {
  const raw = buildNoteSourceFile(frontmatter.value, '')
  const lines = raw.trimEnd().split('\n')
  if (lines.length <= 1 && lines[0] === '---') return ''
  return lines.join('\n').replace(/\n---\s*$/, '').trimEnd()
})

function stringifyFieldValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

function parseFieldValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }
  return trimmed
}

function addTag() {
  const next = tagInput.value.trim()
  if (!next || tags.value.includes(next)) {
    tagInput.value = ''
    return
  }
  tags.value = [...tags.value, next]
  tagInput.value = ''
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(item => item !== tag)
}

function addCustomField() {
  let key = 'field'
  let index = 1
  while (key in frontmatter.value) {
    key = `field${index++}`
  }
  frontmatter.value = { ...frontmatter.value, [key]: '' }
}

function updateCustomField(oldKey: string, nextKey: string, value: string) {
  const next = { ...frontmatter.value }
  delete next[oldKey]
  const trimmedKey = nextKey.trim()
  if (trimmedKey) {
    next[trimmedKey] = parseFieldValue(value)
  }
  frontmatter.value = next
}

function removeCustomField(key: string) {
  const next = { ...frontmatter.value }
  delete next[key]
  frontmatter.value = next
}
</script>

<template>
  <FluffmindDialog
    :open="open"
    title="Propriétés"
    description="Tags, description et champs YAML personnalisés."
    @update:open="open = $event"
  >
    <div class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
      <div v-if="isKanban" class="flex items-center gap-2">
        <FluffmindChip>Tableau kanban</FluffmindChip>
        <span class="md3-body-sm text-on-surface-variant">Le frontmatter kanban est en lecture seule ici.</span>
      </div>

      <section class="flex flex-col gap-2">
        <h3 class="md3-label-lg">
          Tags
        </h3>
        <div class="flex flex-wrap gap-1">
          <FluffmindChip
            v-for="tag in tags"
            :key="tag"
            class="cursor-pointer"
            @click="removeTag(tag)"
          >
            {{ tag }} ×
          </FluffmindChip>
        </div>
        <form class="flex gap-2" @submit.prevent="addTag">
          <FluffmindTextField
            v-model="tagInput"
            placeholder="Ajouter un tag"
            class="min-w-0 flex-1"
          />
          <FluffmindButton type="submit" variant="tonal" size="sm">
            Ajouter
          </FluffmindButton>
        </form>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="md3-label-lg">
          Description
        </h3>
        <textarea
          v-model="description"
          rows="3"
          class="md3-field min-h-20 resize-y md3-body-md"
          placeholder="Résumé de la note…"
        />
      </section>

      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="md3-label-lg">
            Champs personnalisés
          </h3>
          <FluffmindButton variant="text" size="sm" type="button" @click="addCustomField">
            + Champ
          </FluffmindButton>
        </div>
        <div
          v-for="field in customFields"
          :key="field.key"
          class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2"
        >
          <FluffmindTextField
            :model-value="field.key"
            placeholder="Clé"
            @update:model-value="updateCustomField(field.key, $event, field.value)"
          />
          <FluffmindTextField
            :model-value="field.value"
            placeholder="Valeur"
            @update:model-value="updateCustomField(field.key, field.key, $event)"
          />
          <FluffmindButton variant="text" size="sm" type="button" @click="removeCustomField(field.key)">
            Suppr.
          </FluffmindButton>
        </div>
      </section>

      <section v-if="yamlPreview" class="flex flex-col gap-2">
        <h3 class="md3-label-lg">
          Aperçu YAML
        </h3>
        <pre class="md3-card overflow-x-auto p-3 font-mono md3-body-sm">{{ yamlPreview }}</pre>
      </section>
    </div>
  </FluffmindDialog>
</template>
