<script setup lang="ts">
interface Props {
  variant?: 'filled' | 'outlined'
  padding?: 'none' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  variant: 'filled',
  padding: 'md',
})

const paddingClass: Record<'none' | 'md' | 'lg', string> = {
  none: 'p-0',
  md: 'p-4',
  lg: 'p-6',
}
</script>

<template>
  <div
    class="md3-card"
    :class="[
      paddingClass[padding],
      variant === 'outlined' ? 'md3-card-outlined shadow-none' : '',
    ]"
  >
    <slot />
  </div>
</template>
