<script setup lang="ts">
import type { KanbanBoard, KanbanCard, KanbanColumn } from '@fluffmind/kanban'

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

function updateColumns(columns: KanbanColumn[]) {
  commit({ ...board.value, columns })
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

function toggleCard(columnIndex: number, cardIndex: number) {
  const next = cloneBoard()
  const card = next.columns[columnIndex]?.cards[cardIndex]
  if (!card) return
  card.checked = !card.checked
  commit(next)
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
        class="min-w-64 flex shrink-0 flex-col rounded-xl border border-outline bg-surface-container-low p-3"
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
            class="cursor-grab select-none pt-1 font-mono text-xs text-on-surface-variant"
            title="Drag to reorder column"
          >⋮⋮</span>
          <input
            :value="column.title"
            :readonly="readonly"
            class="min-w-0 flex-1 bg-transparent text-sm font-semibold text-on-surface outline-none"
            @input="renameColumn(columnIndex, ($event.target as HTMLInputElement).value)"
          >
          <button
            v-if="!readonly"
            type="button"
            class="rounded px-1 text-xs text-on-surface-variant hover:bg-error/10 hover:text-error"
            title="Delete column"
            @click="deleteColumn(columnIndex)"
          >
            ×
          </button>
        </header>

        <ul class="flex min-h-16 flex-col gap-2">
          <li
            v-for="(card, cardIndex) in column.cards"
            :key="`${columnIndex}-${cardIndex}-${card.text.slice(0, 24)}`"
            class="group rounded-lg border border-outline-variant bg-surface p-2"
            :draggable="!readonly"
            @dragstart="onCardDragStart(columnIndex, cardIndex, $event)"
            @dragend="onDragEnd"
            @dragover="onDragOver"
            @drop="onCardDrop(columnIndex, cardIndex, $event)"
          >
            <div class="mb-2 flex items-start gap-2">
              <span
                v-if="!readonly"
                class="cursor-grab select-none font-mono text-xs text-on-surface-variant opacity-40 group-hover:opacity-100"
                title="Drag to move card"
              >⋮⋮</span>
              <input
                type="checkbox"
                :checked="card.checked"
                :disabled="readonly"
                class="mt-0.5"
                @change="toggleCard(columnIndex, cardIndex)"
              >
              <textarea
                :value="card.text"
                :readonly="readonly"
                rows="2"
                class="min-h-8 min-w-0 flex-1 resize-y bg-transparent text-sm text-on-surface outline-none"
                placeholder="Card text"
                @input="updateCard(columnIndex, cardIndex, { text: ($event.target as HTMLTextAreaElement).value })"
              />
              <button
                v-if="!readonly"
                type="button"
                class="rounded px-1 text-xs text-on-surface-variant hover:bg-error/10 hover:text-error"
                title="Delete card"
                @click="deleteCard(columnIndex, cardIndex)"
              >
                ×
              </button>
            </div>
          </li>
          <li
            v-if="!readonly"
            class="rounded-lg border border-dashed border-outline-variant px-2 py-3 text-center text-xs text-on-surface-variant"
            @dragover="onDragOver"
            @drop="onColumnAppendDrop(columnIndex, $event)"
          >
            Drop here
          </li>
        </ul>

        <button
          v-if="!readonly"
          type="button"
          class="mt-3 self-start rounded-full border border-outline px-3 py-1 text-xs text-primary hover:bg-primary/10"
          @click="addCard(columnIndex)"
        >
          + Card
        </button>
      </section>
    </div>

    <button
      v-if="!readonly"
      type="button"
      class="self-start rounded-full border border-outline px-4 py-1 text-sm text-primary hover:bg-primary/10"
      @click="addColumn"
    >
      + Column
    </button>
  </div>
</template>
