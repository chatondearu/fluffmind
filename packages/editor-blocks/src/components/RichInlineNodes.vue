<script setup lang="ts">
import { computed, inject } from 'vue'

import { blockEditorContextKey } from '../block-editor-context'
import { inlinesToPlainText } from '../inlines'
import type { InlineNode } from '../types'

defineProps<{
  inlines: InlineNode[]
}>()

const editor = inject(blockEditorContextKey, null)

const noteIds = computed(() => new Set((editor?.vaultNotes.value ?? []).map(note => note.id)))

function isBrokenWikilink(node: InlineNode): boolean {
  if (node.type !== 'wikilink' || !node.target) return false
  if (!editor) return false
  return !noteIds.value.has(node.target)
}

function wikilinkHref(node: InlineNode): string {
  return `/notes/${encodeURI(node.target ?? '')}`
}

function linkLabel(node: InlineNode): string {
  if (node.children?.length) {
    return inlinesToPlainText(node.children)
  }
  return node.value || node.url || ''
}

function wikilinkLabel(node: InlineNode): string {
  return node.alias ?? node.value ?? node.target ?? ''
}
</script>

<template>
  <template v-for="(node, index) in inlines" :key="index">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <strong v-else-if="node.type === 'strong'">
      <RichInlineNodes
        v-if="node.children?.length"
        :inlines="node.children"
      />
      <template v-else>{{ node.value }}</template>
    </strong>
    <em v-else-if="node.type === 'emphasis'">
      <RichInlineNodes
        v-if="node.children?.length"
        :inlines="node.children"
      />
      <template v-else>{{ node.value }}</template>
    </em>
    <code
      v-else-if="node.type === 'inlineCode'"
      class="rounded bg-on-surface/8 px-1 font-mono text-[0.9em]"
    >{{ node.value }}</code>
    <a
      v-else-if="node.type === 'link'"
      :href="node.url"
      class="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      target="_blank"
      rel="noopener noreferrer"
      @click.stop
    >
      <RichInlineNodes
        v-if="node.children?.length"
        :inlines="node.children"
      />
      <template v-else>{{ linkLabel(node) }}</template>
    </a>
    <a
      v-else-if="node.type === 'wikilink'"
      :href="wikilinkHref(node)"
      class="rounded-sm px-0.5 font-medium underline underline-offset-2"
      :class="isBrokenWikilink(node)
        ? 'text-error decoration-error/50'
        : 'text-primary decoration-primary/40 hover:decoration-primary'"
      :title="node.target"
      @click.stop
    >{{ wikilinkLabel(node) }}</a>
  </template>
</template>
