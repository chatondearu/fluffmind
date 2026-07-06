<script setup lang="ts">
interface Props {
  variant?: 'filled' | 'outlined' | 'text'
}

withDefaults(defineProps<Props>(), { variant: 'filled' })
</script>

<template>
  <button
    class="rounded-full px-6 py-2 text-sm font-medium transition-colors cursor-pointer"
    :class="{
      'bg-primary text-on-primary hover:bg-primary/90': variant === 'filled',
      'border border-outline text-primary hover:bg-primary/10': variant === 'outlined',
      'text-primary hover:bg-primary/10': variant === 'text'
    }"
  >
    <slot />
  </button>
</template>
