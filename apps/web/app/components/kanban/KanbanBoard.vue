<script setup lang="ts">
import type { KanbanBoard, KanbanCard, KanbanColumn } from '@fluffmind/kanban'
import {
  FluffmindButton,
  FluffmindCheckbox,
  FluffmindIconButton,
  FluffmindTextArea,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

interface Props {
  readonly?: boolean
}

withDefaults(defineProps<Props>(), {
  readonly: false,
})

const board = defineModel<KanbanBoard>({ required: true })

type DragPayload =
  | { kind: 'column', index: number }
  | { kind: 'card', columnIndex: number, cardIndex: number }

const dragPayload = ref<DragPayload | null>(null)

function cloneBoard(): KanbanBoard {
  return structuredClone(board.value)
}

function commit(next: KanbanBoard) {
  board.value = next
}

function addColumn() {
  const next = cloneBoard()
  next.columns.push({ title: 'New column', cards: [] })
  commit(next)
}

function renameColumn(index: number, title: string) {
  const next = cloneBoard()
  const column = next.columns[index]
  if (!column) return
  column.title = title
  commit(next)
}

function deleteColumn(index: number) {
  const next = cloneBoard()
  next.columns.splice(index, 1)
  commit(next)
}

function addCard(columnIndex: number) {
  const next = cloneBoard()
  const column = next.columns[columnIndex]
  if (!column) return
  column.cards.push({ text: '', checked: false })
  commit(next)
}

function updateCard(columnIndex: number, cardIndex: number, patch: Partial<KanbanCard>) {
  const next = cloneBoard()
  const card = next.columns[columnIndex]?.cards[cardIndex]
  if (!card) return
  Object.assign(card, patch)
  commit(next)
}

function deleteCard(columnIndex: number, cardIndex: number) {
  const next = cloneBoard()
  next.columns[columnIndex]?.cards.splice(cardIndex, 1)
  commit(next)
}

function toggleCard(columnIndex: number, cardIndex: number, checked: boolean) {
  updateCard(columnIndex, cardIndex, { checked })
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onColumnDragStart(index: number, event: DragEvent) {
  dragPayload.value = { kind: 'column', index }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `column:${index}`)
  }
}

function onCardDragStart(columnIndex: number, cardIndex: number, event: DragEvent) {
  dragPayload.value = { kind: 'card', columnIndex, cardIndex }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `card:${columnIndex}:${cardIndex}`)
  }
}

function onDragEnd() {
  dragPayload.value = null
}

function moveColumn(from: number, to: number) {
  if (from === to) return
  const next = cloneBoard()
  const [moved] = next.columns.splice(from, 1)
  if (!moved) return
  next.columns.splice(to, 0, moved)
  commit(next)
}

function moveCard(fromColumn: number, fromCard: number, toColumn: number, toCard: number) {
  const next = cloneBoard()
  const source = next.columns[fromColumn]
  const target = next.columns[toColumn]
  if (!source || !target) return

  const [moved] = source.cards.splice(fromCard, 1)
  if (!moved) return

  let insertAt = toCard
  if (fromColumn === toColumn && fromCard < toCard) {
    insertAt -= 1
  }
  target.cards.splice(insertAt, 0, moved)
  commit(next)
}

function onColumnDrop(targetIndex: number, event: DragEvent) {
  event.preventDefault()
  const payload = dragPayload.value
  dragPayload.value = null
  if (!payload) return

  if (payload.kind === 'column') {
    moveColumn(payload.index, targetIndex)
    return
  }

  moveCard(
    payload.columnIndex,
    payload.cardIndex,
    targetIndex,
    board.value.columns[targetIndex]?.cards.length ?? 0,
  )
}

function onCardDrop(columnIndex: number, cardIndex: number, event: DragEvent) {
  event.preventDefault()
  const payload = dragPayload.value
  dragPayload.value = null
  if (!payload) return

  if (payload.kind === 'column') {
    moveColumn(payload.index, columnIndex)
    return
  }

  moveCard(payload.columnIndex, payload.cardIndex, columnIndex, cardIndex)
}

function onColumnAppendDrop(columnIndex: number, event: DragEvent) {
  event.preventDefault()
  const payload = dragPayload.value
  dragPayload.value = null
  if (!payload || payload.kind !== 'card') return

  const next = cloneBoard()
  const source = next.columns[payload.columnIndex]
  const target = next.columns[columnIndex]
  if (!source || !target) return

  const [moved] = source.cards.splice(payload.cardIndex, 1)
  if (!moved) return
  target.cards.push(moved)
  commit(next)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-4 overflow-x-auto pb-2">
      <section
        v-for="(column, columnIndex) in board.columns"
        :key="`${columnIndex}-${column.title}`"
        class="md3-card flex min-w-72 shrink-0 flex-col p-3"
        @dragover="onDragOver"
        @drop="onColumnDrop(columnIndex, $event)"
      >
        <header
          class="mb-3 flex items-start gap-2"
          :draggable="!readonly"
          @dragstart="onColumnDragStart(columnIndex, $event)"
          @dragend="onDragEnd"
        >
          <span
            v-if="!readonly"
            class="cursor-grab select-none pt-2 font-mono text-xs text-on-surface-variant"
            title="Drag to reorder column"
          >⋮⋮</span>
          <FluffmindTextField
            :model-value="column.title"
            :readonly="readonly"
            class="min-w-0 flex-1 border-none bg-transparent px-0 py-1 md3-title-sm shadow-none focus-visible:ring-0"
            @update:model-value="renameColumn(columnIndex, $event)"
          />
          <FluffmindIconButton
            v-if="!readonly"
            label="Delete column"
            size="sm"
            class="text-error hover:bg-error/10"
            @click="deleteColumn(columnIndex)"
          >
            ×
          </FluffmindIconButton>
        </header>

        <ul class="flex min-h-16 flex-col gap-2">
          <li
            v-for="(card, cardIndex) in column.cards"
            :key="`${columnIndex}-${cardIndex}-${card.text.slice(0, 24)}`"
            class="md3-card-outlined group p-2 shadow-none"
            :draggable="!readonly"
            @dragstart="onCardDragStart(columnIndex, cardIndex, $event)"
            @dragend="onDragEnd"
            @dragover="onDragOver"
            @drop="onCardDrop(columnIndex, cardIndex, $event)"
          >
            <div class="flex items-start gap-2">
              <span
                v-if="!readonly"
                class="cursor-grab select-none pt-1 font-mono text-xs text-on-surface-variant opacity-40 group-hover:opacity-100"
                title="Drag to move card"
              >⋮⋮</span>
              <FluffmindCheckbox
                :model-value="card.checked"
                :disabled="readonly"
                @update:model-value="toggleCard(columnIndex, cardIndex, $event)"
              />
              <FluffmindTextArea
                :model-value="card.text"
                :readonly="readonly"
                :rows="2"
                placeholder="Card text"
                class="min-h-8 flex-1 border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                @update:model-value="updateCard(columnIndex, cardIndex, { text: $event })"
              />
              <FluffmindIconButton
                v-if="!readonly"
                label="Delete card"
                size="sm"
                class="text-error hover:bg-error/10"
                @click="deleteCard(columnIndex, cardIndex)"
              >
                ×
              </FluffmindIconButton>
            </div>
          </li>
          <li
            v-if="!readonly"
            class="rounded-2xl border border-dashed border-outline-variant px-2 py-3 text-center md3-label-md"
            @dragover="onDragOver"
            @drop="onColumnAppendDrop(columnIndex, $event)"
          >
            Drop here
          </li>
        </ul>

        <FluffmindButton
          v-if="!readonly"
          variant="outlined"
          size="sm"
          class="mt-3 self-start"
          @click="addCard(columnIndex)"
        >
          + Card
        </FluffmindButton>
      </section>
    </div>

    <FluffmindButton
      v-if="!readonly"
      variant="tonal"
      size="sm"
      class="self-start"
      @click="addColumn"
    >
      + Column
    </FluffmindButton>
  </div>
</template>
