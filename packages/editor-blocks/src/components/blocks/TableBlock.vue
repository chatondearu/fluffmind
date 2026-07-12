<script setup lang="ts">
import { computed } from 'vue'

import type { BlockNode, InlineNode } from '../../types'

const props = defineProps<{
  block: BlockNode
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
}>()

const rows = computed(() => props.block.rows ?? [])

function cellValue(rowIndex: number, colIndex: number): string {
  const cell = rows.value[rowIndex]?.cells[colIndex]
  if (!cell?.length) return ''
  return cell.map(inline => inline.value).join('')
}

function updateCell(rowIndex: number, colIndex: number, value: string) {
  const nextRows = structuredClone(props.block.rows ?? [])
  if (!nextRows[rowIndex]) return
  const inlines: InlineNode[] = [{ type: 'text', value }]
  nextRows[rowIndex]!.cells[colIndex] = inlines
  emit('update', { ...props.block, rows: nextRows })
}

function addRow() {
  const columnCount = rows.value[0]?.cells.length ?? 2
  const emptyCell = (): InlineNode[] => [{ type: 'text', value: '' }]
  const nextRows = structuredClone(props.block.rows ?? [])
  nextRows.push({ cells: Array.from({ length: columnCount }, emptyCell) })
  emit('update', { ...props.block, rows: nextRows })
}

function addColumn() {
  const nextRows = structuredClone(props.block.rows ?? [])
  for (const row of nextRows) {
    row.cells.push([{ type: 'text', value: '' }])
  }
  emit('update', { ...props.block, rows: nextRows })
}

function removeRow() {
  const nextRows = structuredClone(props.block.rows ?? [])
  if (nextRows.length <= 1) return
  nextRows.pop()
  emit('update', { ...props.block, rows: nextRows })
}

function removeColumn() {
  const nextRows = structuredClone(props.block.rows ?? [])
  const width = nextRows[0]?.cells.length ?? 0
  if (width <= 1) return
  for (const row of nextRows) {
    row.cells.pop()
  }
  emit('update', { ...props.block, rows: nextRows })
}

function onCellKeydown(event: KeyboardEvent, rowIndex: number, colIndex: number) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const rowCount = rows.value.length
  const colCount = rows.value[0]?.cells.length ?? 0
  let nextRow = rowIndex
  let nextCol = colIndex + (event.shiftKey ? -1 : 1)
  if (nextCol >= colCount) {
    nextCol = 0
    nextRow += 1
  } else if (nextCol < 0) {
    nextCol = colCount - 1
    nextRow -= 1
  }
  if (nextRow < 0 || nextRow >= rowCount) return
  const selector = `[data-cell="${nextRow}-${nextCol}"]`
  const next = (event.currentTarget as HTMLElement).closest('table')?.querySelector<HTMLInputElement>(selector)
  next?.focus()
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-full px-2 py-1 text-xs hover:bg-on-surface/8" @click="addRow">
        + Ligne
      </button>
      <button type="button" class="rounded-full px-2 py-1 text-xs hover:bg-on-surface/8" @click="addColumn">
        + Colonne
      </button>
      <button type="button" class="rounded-full px-2 py-1 text-xs hover:bg-on-surface/8" @click="removeRow">
        − Ligne
      </button>
      <button type="button" class="rounded-full px-2 py-1 text-xs hover:bg-on-surface/8" @click="removeColumn">
        − Colonne
      </button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
            <td
              v-for="(_cell, colIndex) in row.cells"
              :key="colIndex"
              class="border border-outline-variant p-0"
            >
              <input
                :data-cell="`${rowIndex}-${colIndex}`"
                :value="cellValue(rowIndex, colIndex)"
                class="w-full min-w-24 bg-transparent px-2 py-1 font-mono md3-body-sm outline-none focus:bg-primary/5"
                @input="updateCell(rowIndex, colIndex, ($event.target as HTMLInputElement).value)"
                @keydown="onCellKeydown($event, rowIndex, colIndex)"
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
