<script lang="ts">
export type { SelectOption } from '../types.ts'
</script>

<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

import type { SelectOption } from '../types.ts'

interface Props {
  modelValue?: string
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  id?: string
}

withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: 'Select…',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', String($event ?? ''))"
  >
    <SelectTrigger
      :id="id"
      class="md3-field inline-flex h-10 items-center justify-between gap-2 text-left data-[placeholder]:text-on-surface-variant"
    >
      <SelectValue :placeholder="placeholder" />
      <span aria-hidden="true" class="text-on-surface-variant">▾</span>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        class="z-50 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-md3-2"
        :side-offset="4"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="md3-nav-item cursor-pointer outline-none data-[highlighted]:bg-on-surface/8 data-[state=checked]:md3-nav-item-active"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
