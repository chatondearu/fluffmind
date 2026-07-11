<script setup lang="ts">
interface Props {
  label?: string
  size?: 'sm' | 'md'
  variant?: 'filled' | 'outlined'
}

withDefaults(defineProps<Props>(), {
  size: 'sm',
  variant: 'filled',
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-sm font-medium"
    :class="[
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      variant === 'filled'
        ? 'bg-secondary-container text-on-secondary-container'
        : 'border border-outline text-on-surface-variant',
    ]"
  >
    <slot>{{ label }}</slot>
  </span>
</template>
