<script setup lang="ts">
import { FluffmindIconButton, FluffmindListItem, FluffmindTooltip } from '@fluffmind/design-system/src/components'

import type { VaultTreeNode } from '../utils/vault-tree'

const props = defineProps<{
  node: VaultTreeNode
  depth: number
  activeId: string | null
  isExpanded: (path: string) => boolean
}>()

const emit = defineEmits<{
  toggle: [path: string]
  newPage: [folder: string | null]
  navigate: []
}>()

const isActive = computed(() =>
  props.node.kind === 'page' && props.node.noteId === props.activeId,
)

const isFolderExpanded = computed(() =>
  props.node.kind === 'folder' && props.isExpanded(props.node.path),
)

function onFolderClick() {
  if (props.node.kind === 'folder') {
    emit('toggle', props.node.path)
  }
}

function onNewInFolder() {
  emit('newPage', props.node.kind === 'folder' ? props.node.path : null)
}
</script>

<template>
  <li>
    <div
      class="group flex items-center gap-0.5"
      :style="{ paddingLeft: `${depth * 12}px` }"
    >
      <FluffmindListItem
        v-if="node.kind === 'folder'"
        as="button"
        type="button"
        class="flex-1"
        @click="onFolderClick"
      >
        <template #leading>
          <span aria-hidden="true">{{ isFolderExpanded ? '▾' : '▸' }}</span>
        </template>
        {{ node.name }}
      </FluffmindListItem>

      <NuxtLink
        v-else
        :to="node.href"
        class="min-w-0 flex-1"
        @click="emit('navigate')"
      >
        <FluffmindListItem :active="isActive">
          <template #leading>
            <span aria-hidden="true">📄</span>
          </template>
          {{ node.title }}
        </FluffmindListItem>
      </NuxtLink>

      <FluffmindTooltip v-if="node.kind === 'folder'" text="Nouvelle page dans ce dossier">
        <FluffmindIconButton
          label="Nouvelle page dans ce dossier"
          size="sm"
          class="opacity-0 transition-opacity group-hover:opacity-100"
          @click.stop="onNewInFolder"
        >
          +
        </FluffmindIconButton>
      </FluffmindTooltip>
    </div>

    <ul v-if="node.kind === 'folder' && isFolderExpanded && node.children.length > 0" class="flex flex-col gap-0.5">
      <VaultTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :active-id="activeId"
        :is-expanded="isExpanded"
        @toggle="emit('toggle', $event)"
        @new-page="emit('newPage', $event)"
        @navigate="emit('navigate')"
      />
    </ul>
  </li>
</template>
