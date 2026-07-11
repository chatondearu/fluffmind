<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

interface Props {
  modelValue?: boolean
  disabled?: boolean
  id?: string
  label?: string
}

withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label class="inline-flex cursor-pointer items-start gap-2 md3-body-md text-on-surface">
    <CheckboxRoot
      :id="id"
      :model-value="modelValue"
      :disabled="disabled"
      class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border border-outline bg-surface transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-38"
      @update:model-value="emit('update:modelValue', $event === true)"
    >
      <CheckboxIndicator class="text-xs text-on-primary">
        ✓
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="$slots.default || label" class="min-w-0 flex-1">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>
