<script setup lang="ts">
import { SLASH_COMMANDS, type SlashCommand } from '../slash-commands'

defineProps<{
  visible?: boolean
}>()

const emit = defineEmits<{
  delete: []
  copy: []
  changeType: [command: SlashCommand]
}>()

const typeMenuOpen = ref(false)

function selectType(command: SlashCommand) {
  emit('changeType', command)
  typeMenuOpen.value = false
}
</script>

<template>
  <div
    class="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-full border border-outline-variant bg-surface-container-low p-0.5 shadow-md3-1 transition-opacity"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
  >
    <button
      type="button"
      class="rounded-full px-2 py-1 text-xs text-on-surface-variant hover:bg-on-surface/8"
      title="Copier le bloc"
      @mousedown.prevent
      @click="emit('copy')"
    >
      Copier
    </button>
    <div class="relative">
      <button
        type="button"
        class="rounded-full px-2 py-1 text-xs text-on-surface-variant hover:bg-on-surface/8"
        title="Changer le type"
        @mousedown.prevent
        @click="typeMenuOpen = !typeMenuOpen"
      >
        Type ▾
      </button>
      <div
        v-if="typeMenuOpen"
        class="md3-menu absolute right-0 top-full z-20 mt-1 max-h-48 min-w-40 overflow-y-auto p-1"
      >
        <button
          v-for="command in SLASH_COMMANDS"
          :key="`${command.type}-${command.level ?? 0}`"
          type="button"
          class="md3-nav-item w-full rounded-xl text-left"
          @mousedown.prevent
          @click="selectType(command)"
        >
          {{ command.label }}
        </button>
      </div>
    </div>
    <button
      type="button"
      class="rounded-full px-2 py-1 text-xs text-error hover:bg-error/10"
      title="Supprimer le bloc"
      @mousedown.prevent
      @click="emit('delete')"
    >
      Suppr.
    </button>
  </div>
</template>
