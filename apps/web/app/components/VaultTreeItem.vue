<script setup lang="ts">
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
      class="group flex items-center gap-1 rounded-md py-0.5 pr-1"
      :style="{ paddingLeft: `${depth * 12 + 4}px` }"
    >
      <button
        v-if="node.kind === 'folder'"
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary/10"
        @click="onFolderClick"
      >
        <span class="w-4 shrink-0 text-on-surface-variant">{{ isFolderExpanded ? '▾' : '▸' }}</span>
        <span class="truncate text-on-surface">{{ node.name }}</span>
      </button>

      <NuxtLink
        v-else
        :to="node.href"
        class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-primary/10"
        :class="isActive ? 'bg-primary/15 font-medium text-primary' : 'text-on-surface'"
        @click="emit('navigate')"
      >
        <span class="w-4 shrink-0" />
        <span class="truncate">{{ node.title }}</span>
      </NuxtLink>

      <button
        v-if="node.kind === 'folder'"
        type="button"
        class="rounded px-1 text-xs text-on-surface-variant opacity-0 hover:text-primary group-hover:opacity-100"
        title="Nouvelle page dans ce dossier"
        @click.stop="onNewInFolder"
      >
        +
      </button>
    </div>

    <ul v-if="node.kind === 'folder' && isFolderExpanded && node.children.length > 0" class="flex flex-col">
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
