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
      class="slash-menu md3-menu fixed z-50 min-w-56"
      :style="style"
      @mousedown.prevent
    >
      <ul class="max-h-64 overflow-y-auto py-1">
        <li v-for="(command, index) in commands" :key="`${command.type}-${command.level ?? 0}-${command.label}`">
          <button
            type="button"
            class="md3-nav-item w-full flex-col items-start rounded-xl"
            :class="{ 'md3-nav-item-active': index === activeIndex }"
            @click="onSelect(command)"
          >
            <span class="md3-title-sm">{{ command.label }}</span>
            <span class="md3-label-md">{{ command.description }}</span>
          </button>
        </li>
      </ul>
    </div>
  </Teleport>
</template>
