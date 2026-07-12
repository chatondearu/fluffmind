<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { FluffmindIconButton } from '@fluffmind/design-system/src/components'

import type { VaultTreeNode } from '../utils/vault-tree'

const props = defineProps<{
  node: VaultTreeNode
}>()

const emit = defineEmits<{
  newPage: [folder: string | null]
  newFolder: [parent: string | null]
  rename: [node: VaultTreeNode]
  delete: [node: VaultTreeNode]
}>()

const open = ref(false)

const folderPath = computed(() => props.node.kind === 'folder' ? (props.node.path || null) : null)
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <DropdownMenuTrigger as-child>
      <FluffmindIconButton
        label="Actions"
        size="sm"
        class="shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
      >
        ⋯
      </FluffmindIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="md3-menu z-50 min-w-44 p-1"
        :side-offset="4"
        align="end"
      >
        <template v-if="node.kind === 'folder'">
          <DropdownMenuItem
            class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
            @select="emit('newPage', folderPath); open = false"
          >
            Nouvelle note
          </DropdownMenuItem>
          <DropdownMenuItem
            class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
            @select="emit('newFolder', folderPath); open = false"
          >
            Nouveau sous-dossier
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="folderPath"
            class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
            @select="emit('rename', node); open = false"
          >
            Renommer dossier
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="folderPath"
            class="md3-nav-item cursor-pointer text-error outline-none data-[highlighted]:bg-error/10"
            @select="emit('delete', node); open = false"
          >
            Supprimer dossier…
          </DropdownMenuItem>
        </template>
        <template v-else>
          <DropdownMenuItem
            class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8"
            @select="emit('rename', node); open = false"
          >
            Renommer note
          </DropdownMenuItem>
          <DropdownMenuItem
            class="md3-nav-item cursor-pointer text-error outline-none data-[highlighted]:bg-error/10"
            @select="emit('delete', node); open = false"
          >
            Supprimer note…
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
