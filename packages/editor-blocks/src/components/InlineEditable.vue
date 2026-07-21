<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { inlinesToMarkdown, parseInlineMarkdown } from '../inlines'
import type { InlineNode } from '../types'
import EditableSurface from './EditableSurface.vue'
import RichInlineView from './RichInlineView.vue'

const props = withDefaults(defineProps<{
  inlines: InlineNode[]
  placeholder?: string
  textClass?: string
  multiline?: boolean
}>(), {
  placeholder: '',
  textClass: 'md3-body-md',
  multiline: true,
})

const emit = defineEmits<{
  'update:inlines': [inlines: InlineNode[]]
  enter: [offset: number]
  shiftEnter: [offset: number]
  tab: []
  shiftTab: []
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}>()

const surface = ref<InstanceType<typeof EditableSurface> | null>(null)
const editing = ref(false)
const draft = ref(inlinesToMarkdown(props.inlines))

watch(
  () => props.inlines,
  (inlines) => {
    if (!editing.value) {
      draft.value = inlinesToMarkdown(inlines)
    }
  },
)

function commitDraft() {
  emit('update:inlines', parseInlineMarkdown(draft.value))
}

function startEditing(offset?: number) {
  draft.value = inlinesToMarkdown(props.inlines)
  editing.value = true
  emit('focus')
  nextTick(() => surface.value?.focus(offset))
}

function onBlur() {
  commitDraft()
  editing.value = false
  emit('blur')
}

function onEnter(offset: number) {
  commitDraft()
  emit('enter', offset)
}

function onShiftEnter(offset: number) {
  commitDraft()
  emit('shiftEnter', offset)
}

function onBackspaceEmpty() {
  commitDraft()
  emit('backspaceEmpty')
}

function onDeleteBlock() {
  commitDraft()
  emit('deleteBlock')
}

defineExpose({
  focus(offset?: number) {
    startEditing(offset)
  },
  getOffset() {
    return surface.value?.getOffset() ?? draft.value.length
  },
})
</script>

<template>
  <EditableSurface
    v-if="editing"
    ref="surface"
    v-model="draft"
    :placeholder="placeholder"
    :text-class="textClass"
    :multiline="multiline"
    @enter="onEnter"
    @shift-enter="onShiftEnter"
    @tab="emit('tab')"
    @shift-tab="emit('shiftTab')"
    @backspace-empty="onBackspaceEmpty"
    @delete-block="onDeleteBlock"
    @slash-change="emit('slashChange', $event)"
    @blur="onBlur"
    @focus="emit('focus')"
  />
  <RichInlineView
    v-else
    :inlines="inlines"
    :placeholder="placeholder"
    :text-class="textClass"
    @activate="startEditing()"
  />
</template>
