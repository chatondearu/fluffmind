<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

interface Props {
  open?: boolean
  title: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  open: false,
  description: '',
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-scrim/40 backdrop-blur-sm" />
      <DialogContent
        class="md3-card fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 p-6 shadow-md3-2 focus:outline-none"
      >
        <DialogTitle class="md3-headline-sm">
          {{ title }}
        </DialogTitle>
        <DialogDescription v-if="description" class="mt-2 md3-body-md text-on-surface-variant">
          {{ description }}
        </DialogDescription>
        <div class="mt-6">
          <slot />
        </div>
        <DialogClose
          class="absolute right-3 top-3 rounded-full p-2 text-on-surface-variant hover:bg-on-surface/8"
          aria-label="Fermer"
        >
          ×
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
