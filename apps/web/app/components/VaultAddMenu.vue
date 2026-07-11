<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { FluffmindIconButton } from '@fluffmind/design-system/src/components'

const props = defineProps<{
  folderPath: string | null
}>()

const emit = defineEmits<{
  newPage: [folder: string | null]
  newFolder: [parent: string | null]
}>()

const open = ref(false)
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <DropdownMenuTrigger as-child>
      <FluffmindIconButton
        label="Ajouter"
        size="sm"
        class="text-on-surface-variant"
      >
        +
      </FluffmindIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="md3-menu z-50 min-w-44 p-1"
        :side-offset="4"
        align="start"
      >
        <DropdownMenuItem
          class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
          @select="emit('newPage', props.folderPath); open = false"
        >
          Nouvelle page
        </DropdownMenuItem>
        <DropdownMenuItem
          class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
          @select="emit('newFolder', props.folderPath); open = false"
        >
          Nouveau dossier
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
