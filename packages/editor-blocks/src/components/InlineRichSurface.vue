<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { blockEditorContextKey } from '../block-editor-context'
import { focusElement, getSelectionOffset, isSelectionCollapsed, setSelectionOffset } from '../contenteditable'
import { domToInlines, writeInlinesToDom } from '../inline-dom'
import { tryApplyInputRuleToInlines } from '../inline-input-rules'
import { selectionHasMark, toggleMark, wrapLink, wrapWikilink } from '../inline-marks'
import type { ToggleableMark } from '../inline-marks'
import { inlinesToPlainText, stripCaretArtifacts } from '../inlines'
import { matchSlashQuery } from '../slash-commands'
import type { InlineNode } from '../types'
import InlineFormatToolbar from './InlineFormatToolbar.vue'
import type { InlineFormatActive } from './InlineFormatToolbar.vue'

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

const editor = inject(blockEditorContextKey, null)

const root = ref<HTMLElement | null>(null)
const isUnmounting = ref(false)
const isFocused = ref(false)
const isEmpty = computed(() => inlinesToPlainText(props.inlines).length === 0)

const toolbarOpen = ref(false)
const toolbarRect = ref<DOMRect | null>(null)
const toolbarActive = ref<InlineFormatActive>({
  strong: false,
  emphasis: false,
  inlineCode: false,
  link: false,
  wikilink: false,
})

interface PlainSelectionRange { from: number, to: number }

function getPlainSelectionRange(element: HTMLElement): PlainSelectionRange | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null

  const preStart = range.cloneRange()
  preStart.selectNodeContents(element)
  preStart.setEnd(range.startContainer, range.startOffset)

  const preEnd = range.cloneRange()
  preEnd.selectNodeContents(element)
  preEnd.setEnd(range.endContainer, range.endOffset)

  return { from: preStart.toString().length, to: preEnd.toString().length }
}

function anchorElementOf(node: Node): Element | null {
  return node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
}

function isRangeInsideLink(range: Range, wikilink: boolean): boolean {
  const element = anchorElementOf(range.commonAncestorContainer)
  const anchor = element?.closest('a')
  if (!anchor) return false
  return wikilink ? anchor.dataset.wikilink === 'true' : anchor.dataset.wikilink !== 'true'
}

function readPlainText(): string {
  return root.value?.innerText.replace(/\u00a0/g, ' ') ?? ''
}

function writeDom(inlines: InlineNode[]) {
  if (!root.value) return
  writeInlinesToDom(root.value, inlines)
}

function emitInlines(next: InlineNode[]) {
  emit('update:inlines', stripCaretArtifacts(next))
}

function refreshSlash() {
  if (!root.value) return
  const text = readPlainText()
  const slash = matchSlashQuery(text)
  const rect = slash.active ? root.value.getBoundingClientRect() : null
  emit('slashChange', { active: slash.active, query: slash.query, rect })
}

function updateToolbar() {
  if (!root.value) {
    toolbarOpen.value = false
    return
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    toolbarOpen.value = false
    return
  }

  const range = selection.getRangeAt(0)
  if (!root.value.contains(range.commonAncestorContainer)) {
    toolbarOpen.value = false
    return
  }

  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange || plainRange.from === plainRange.to) {
    toolbarOpen.value = false
    return
  }

  const current = domToInlines(root.value)
  toolbarActive.value = {
    strong: selectionHasMark(current, plainRange.from, plainRange.to, 'strong'),
    emphasis: selectionHasMark(current, plainRange.from, plainRange.to, 'emphasis'),
    inlineCode: selectionHasMark(current, plainRange.from, plainRange.to, 'inlineCode'),
    link: isRangeInsideLink(range, false),
    wikilink: isRangeInsideLink(range, true),
  }
  toolbarRect.value = range.getBoundingClientRect()
  toolbarOpen.value = true
}

function onInput(event: Event) {
  if (!root.value) return
  const current = domToInlines(root.value)
  const isComposing = (event as InputEvent).isComposing === true

  if (!isComposing) {
    const caret = getSelectionOffset(root.value)
    const applied = tryApplyInputRuleToInlines(current, caret)
    if (applied) {
      writeDom(applied.inlines)
      nextTick(() => setSelectionOffset(root.value!, applied.caret))
      emitInlines(applied.inlines)
      refreshSlash()
      return
    }
  }

  emitInlines(current)
  refreshSlash()
}

function applyToggle(mark: ToggleableMark) {
  if (!root.value) return
  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange) return
  const current = domToInlines(root.value)
  const next = toggleMark(current, plainRange.from, plainRange.to, mark)
  writeDom(next)
  nextTick(() => setSelectionOffset(root.value!, plainRange.to))
  emitInlines(next)
  updateToolbar()
}

async function promptLink() {
  if (!root.value || !editor) return
  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange || plainRange.from === plainRange.to) return
  const url = await editor.requestInlinePrompt('link')
  if (!url || !root.value) return
  const current = domToInlines(root.value)
  const next = wrapLink(current, plainRange.from, plainRange.to, url)
  writeDom(next)
  nextTick(() => setSelectionOffset(root.value!, plainRange.to))
  emitInlines(next)
  toolbarOpen.value = false
}

async function promptWikilink() {
  if (!root.value || !editor) return
  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange || plainRange.from === plainRange.to) return
  const target = await editor.requestInlinePrompt('wikilink')
  if (!target || !root.value) return
  const current = domToInlines(root.value)
  const next = wrapWikilink(current, plainRange.from, plainRange.to, target)
  writeDom(next)
  nextTick(() => setSelectionOffset(root.value!, plainRange.to))
  emitInlines(next)
  toolbarOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      applyToggle('strong')
      return
    }
    if (key === 'i') {
      event.preventDefault()
      applyToggle('emphasis')
      return
    }
    if (key === 'e') {
      event.preventDefault()
      applyToggle('inlineCode')
      return
    }
    if (key === 'k') {
      event.preventDefault()
      promptLink()
      return
    }
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    if (event.shiftKey) {
      emit('shiftTab')
    }
    else {
      emit('tab')
    }
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    emit('enter', getSelectionOffset(root.value!))
    return
  }

  if (event.key === 'Enter' && event.shiftKey && props.multiline) {
    event.preventDefault()
    emit('shiftEnter', getSelectionOffset(root.value!))
    return
  }

  if (event.key === 'Backspace' && readPlainText().length === 0) {
    event.preventDefault()
    emit('backspaceEmpty')
    return
  }

  if (event.key === 'Delete' && readPlainText().length > 0 && root.value && isSelectionCollapsed(root.value)) {
    event.preventDefault()
    emit('deleteBlock')
  }
}

function onLinkClick(event: MouseEvent) {
  if (!root.value) return
  const target = event.target as HTMLElement | null
  const anchor = target?.closest('a')
  if (!anchor || !root.value.contains(anchor)) return
  if (!isSelectionCollapsed(root.value)) {
    event.preventDefault()
  }
}

function onFocus() {
  isFocused.value = true
  emit('focus')
}

function onBlur() {
  isFocused.value = false
  toolbarOpen.value = false
  if (!isUnmounting.value) {
    emit('blur')
  }
}

watch(
  () => props.inlines,
  (next) => {
    if (isFocused.value) return
    writeDom(next)
  },
)

onMounted(() => {
  writeDom(props.inlines)
  document.addEventListener('selectionchange', updateToolbar)
})

onBeforeUnmount(() => {
  isUnmounting.value = true
  document.removeEventListener('selectionchange', updateToolbar)
})

defineExpose({
  focus(offset?: number) {
    if (!root.value) return
    if (document.activeElement === root.value) {
      if (offset !== undefined) {
        requestAnimationFrame(() => setSelectionOffset(root.value!, offset))
      }
      return
    }
    focusElement(root.value, offset)
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
      class="inline-rich-surface min-w-0 whitespace-pre-wrap break-words outline-none"
      :class="[textClass, { 'is-empty': isEmpty }]"
      :data-placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
      @mouseup="updateToolbar"
      @keyup="updateToolbar"
      @click="onLinkClick"
    />
    <InlineFormatToolbar
      :open="toolbarOpen"
      :anchor-rect="toolbarRect"
      :active="toolbarActive"
      @toggle-strong="applyToggle('strong')"
      @toggle-emphasis="applyToggle('emphasis')"
      @toggle-inline-code="applyToggle('inlineCode')"
      @link="promptLink"
      @wikilink="promptWikilink"
    />
  </div>
</template>

<style scoped>
.inline-rich-surface.is-empty:empty::before,
.inline-rich-surface.is-empty:not(:focus):has(br:only-child)::before {
  content: attr(data-placeholder);
  color: var(--md-on-surface-variant, #6b7280);
  pointer-events: none;
}
</style>
