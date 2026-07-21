<script setup lang="ts">
import { computed, inject } from 'vue'

import { blockEditorContextKey } from '../block-editor-context'
import { inlinesToPlainText } from '../inlines'
import type { InlineNode } from '../types'

const props = withDefaults(defineProps<{
  inlines: InlineNode[]
  placeholder?: string
  textClass?: string
}>(), {
  placeholder: '',
  textClass: 'md3-body-md',
})

const emit = defineEmits<{
  activate: []
}>()

const editor = inject(blockEditorContextKey, null)

const isEmpty = computed(() => inlinesToPlainText(props.inlines).length === 0)

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

function onSurfaceClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a')) return
  emit('activate')
}
</script>

<template>
  <div
    class="rich-inline min-w-0 w-full cursor-text whitespace-pre-wrap break-words outline-none"
    :class="[textClass, { 'is-empty': isEmpty }]"
    :data-placeholder="placeholder"
    role="presentation"
    @click="onSurfaceClick"
  >
    <template v-if="!isEmpty">
      <template v-for="(node, index) in inlines" :key="index">
        <template v-if="node.type === 'text'">{{ node.value }}</template>
        <strong v-else-if="node.type === 'strong'">
          <RichInlineView
            v-if="node.children?.length"
            :inlines="node.children"
            text-class=""
          />
          <template v-else>{{ node.value }}</template>
        </strong>
        <em v-else-if="node.type === 'emphasis'">
          <RichInlineView
            v-if="node.children?.length"
            :inlines="node.children"
            text-class=""
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
        >{{ linkLabel(node) }}</a>
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
  </div>
</template>

<style scoped>
.rich-inline.is-empty:empty::before,
.rich-inline.is-empty::before {
  content: attr(data-placeholder);
  color: var(--md-on-surface-variant, #6b7280);
  pointer-events: none;
}
.rich-inline.is-empty:not(:empty)::before {
  content: none;
}
</style>
