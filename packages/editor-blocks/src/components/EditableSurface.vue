<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { focusElement, getSelectionOffset, setSelectionOffset } from '../contenteditable'
import { matchSlashQuery } from '../slash-commands'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  multiline?: boolean
  autofocus?: boolean
  textClass?: string
}>(), {
  placeholder: '',
  multiline: true,
  autofocus: false,
  textClass: 'md3-body-md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: [offset: number]
  shiftEnter: [offset: number]
  backspaceEmpty: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}>()

const root = ref<HTMLElement | null>(null)
const isUnmounting = ref(false)
const isEmpty = computed(() => props.modelValue.length === 0)

function readText(): string {
  return root.value?.innerText.replace(/\u00a0/g, ' ') ?? ''
}

function syncFromDom() {
  const text = readText()
  emit('update:modelValue', text)
  const slash = matchSlashQuery(text)
  const rect = slash.active && root.value ? root.value.getBoundingClientRect() : null
  emit('slashChange', { active: slash.active, query: slash.query, rect })
}

function onInput() {
  syncFromDom()
}

function onFocus() {
  emit('focus')
}

function onBlur() {
  syncFromDom()
  if (!isUnmounting.value) {
    emit('blur')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const offset = getSelectionOffset(root.value!)
    emit('enter', offset)
    return
  }

  if (event.key === 'Enter' && event.shiftKey && props.multiline) {
    event.preventDefault()
    emit('shiftEnter', getSelectionOffset(root.value!))
    return
  }

  if (event.key === 'Backspace' && readText().length === 0) {
    event.preventDefault()
    emit('backspaceEmpty')
  }
}

function writeDom(value: string, preserveOffset = false) {
  if (!root.value) return
  const offset = preserveOffset ? getSelectionOffset(root.value) : value.length
  root.value.innerText = value
  nextTick(() => setSelectionOffset(root.value!, offset))
}

watch(
  () => props.modelValue,
  (value, previous) => {
    if (!root.value || readText() === value) return
    writeDom(value, previous !== undefined)
  },
)

onMounted(() => {
  writeDom(props.modelValue)
  if (props.autofocus) {
    nextTick(() => focusElement(root.value, props.modelValue.length))
  }
})

onBeforeUnmount(() => {
  isUnmounting.value = true
})

defineExpose({
  focus(offset?: number) {
    focusElement(root.value, offset ?? props.modelValue.length)
  },
  getOffset() {
    return root.value ? getSelectionOffset(root.value) : 0
  },
})
</script>

<template>
  <div class="relative w-full">
    <div
      ref="root"
      contenteditable
      role="textbox"
      tabindex="0"
      class="editable-surface min-w-0 whitespace-pre-wrap break-words outline-none"
      :class="[textClass, { 'is-empty': isEmpty }]"
      :data-placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
.editable-surface.is-empty:empty::before,
.editable-surface.is-empty:not(:focus):has(br:only-child)::before {
  content: attr(data-placeholder);
  color: var(--md-on-surface-variant, #6b7280);
  pointer-events: none;
}
</style>
