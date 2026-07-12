<script setup lang="ts">
import { FluffmindListItem } from '@fluffmind/design-system/src/components'

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
  newFolder: [parent: string | null]
  rename: [node: VaultTreeNode]
  delete: [node: VaultTreeNode]
  navigate: []
}>()

const isActive = computed(() =>
  props.node.kind === 'page' && props.node.noteId === props.activeId,
)

const isFolderExpanded = computed(() =>
  props.node.kind === 'folder' && props.isExpanded(props.node.path),
)

const folderPathForActions = computed<string | null>(() =>
  props.node.kind === 'folder' ? (props.node.path || null) : null,
)

function onFolderClick() {
  if (props.node.kind === 'folder') {
    emit('toggle', props.node.path)
  }
}
</script>

<template>
  <li class="group/list list-none">
    <div
      class="group flex items-center gap-0.5"
      :style="{ paddingLeft: depth > 0 ? `${depth * 10}px` : undefined }"
    >
      <FluffmindListItem
        v-if="node.kind === 'folder'"
        as="button"
        type="button"
        class="min-w-0 flex-1"
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

      <VaultContextMenu
        :node="node"
        @new-page="emit('newPage', $event)"
        @new-folder="emit('newFolder', $event)"
        @rename="emit('rename', $event)"
        @delete="emit('delete', $event)"
      />
    </div>

    <ul
      v-if="node.kind === 'folder' && isFolderExpanded"
      class="m-0 flex list-none flex-col gap-0.5 p-0"
    >
      <VaultTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :active-id="activeId"
        :is-expanded="isExpanded"
        @toggle="emit('toggle', $event)"
        @new-page="emit('newPage', $event)"
        @new-folder="emit('newFolder', $event)"
        @rename="emit('rename', $event)"
        @delete="emit('delete', $event)"
        @navigate="emit('navigate')"
      />
    </ul>
  </li>
</template>
