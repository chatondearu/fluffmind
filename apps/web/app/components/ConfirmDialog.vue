<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDialog,
} from '@fluffmind/design-system/src/components'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
}>()

const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <FluffmindDialog
    :open="open"
    :title="title"
    :description="description"
    @update:open="open = $event"
  >
    <div class="flex justify-end gap-2">
      <FluffmindButton variant="text" type="button" @click="open = false">
        Annuler
      </FluffmindButton>
      <FluffmindButton
        :variant="destructive ? 'filled' : 'filled'"
        :class="destructive ? 'bg-error text-on-error' : undefined"
        type="button"
        @click="emit('confirm'); open = false"
      >
        {{ confirmLabel ?? 'Confirmer' }}
      </FluffmindButton>
    </div>
  </FluffmindDialog>
</template>
