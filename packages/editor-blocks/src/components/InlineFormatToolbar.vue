<script setup lang="ts">
import { computed } from 'vue'

export interface InlineFormatActive {
  strong: boolean
  emphasis: boolean
  inlineCode: boolean
  link: boolean
  wikilink: boolean
}

const props = defineProps<{
  open: boolean
  anchorRect: DOMRect | null
  active: InlineFormatActive
}>()

const emit = defineEmits<{
  toggleStrong: []
  toggleEmphasis: []
  toggleInlineCode: []
  link: []
  wikilink: []
}>()

const style = computed(() => {
  if (!props.anchorRect) {
    return { top: '0px', left: '0px' }
  }
  return {
    top: `${props.anchorRect.top - 40}px`,
    left: `${props.anchorRect.left}px`,
  }
})

const buttons = computed(() => [
  {
    key: 'strong' as const,
    label: 'Gras',
    active: props.active.strong,
    action: () => emit('toggleStrong'),
  },
  {
    key: 'emphasis' as const,
    label: 'Italique',
    active: props.active.emphasis,
    action: () => emit('toggleEmphasis'),
  },
  {
    key: 'inlineCode' as const,
    label: 'Code',
    active: props.active.inlineCode,
    action: () => emit('toggleInlineCode'),
  },
  {
    key: 'link' as const,
    label: 'Lien',
    active: props.active.link,
    action: () => emit('link'),
  },
  {
    key: 'wikilink' as const,
    label: 'Wikilink',
    active: props.active.wikilink,
    action: () => emit('wikilink'),
  },
])
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="inline-format-toolbar md3-menu fixed z-50 flex items-center gap-0.5 p-1"
      :style="style"
      @mousedown.prevent
    >
      <button
        v-for="button in buttons"
        :key="button.key"
        type="button"
        class="md3-nav-item rounded-full px-3 py-1.5 text-sm"
        :class="{ 'md3-nav-item-active font-semibold': button.active }"
        :aria-pressed="button.active"
        @mousedown.prevent
        @click="button.action()"
      >
        {{ button.label }}
      </button>
    </div>
  </Teleport>
</template>
