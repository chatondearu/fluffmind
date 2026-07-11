<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { SlashCommand } from '../slash-commands'

const props = defineProps<{
  commands: SlashCommand[]
  open: boolean
  anchorRect: DOMRect | null
}>()

const emit = defineEmits<{
  select: [command: SlashCommand]
  close: []
}>()

const activeIndex = ref(0)

const style = computed(() => {
  if (!props.anchorRect) {
    return { top: '0px', left: '0px' }
  }
  return {
    top: `${props.anchorRect.bottom + 4}px`,
    left: `${props.anchorRect.left}px`,
  }
})

watch(
  () => props.commands,
  () => {
    activeIndex.value = 0
  },
)

function onSelect(command: SlashCommand) {
  emit('select', command)
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open || props.commands.length === 0) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % props.commands.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + props.commands.length) % props.commands.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const command = props.commands[activeIndex.value]
    if (command) onSelect(command)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

defineExpose({ onKeydown })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && commands.length > 0"
      class="slash-menu fixed z-50 min-w-56 overflow-hidden rounded-lg border border-outline bg-surface shadow-lg"
      :style="style"
      @mousedown.prevent
    >
      <ul class="max-h-64 overflow-y-auto py-1">
        <li v-for="(command, index) in commands" :key="`${command.type}-${command.level ?? 0}-${command.label}`">
          <button
            type="button"
            class="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-primary/10"
            :class="{ 'bg-primary/10': index === activeIndex }"
            @click="onSelect(command)"
          >
            <span class="text-sm font-medium text-on-surface">{{ command.label }}</span>
            <span class="text-xs text-on-surface-variant">{{ command.description }}</span>
          </button>
        </li>
      </ul>
    </div>
  </Teleport>
</template>
