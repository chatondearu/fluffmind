<script setup lang="ts">
interface Props {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  disabled: false,
  type: 'button',
})

const sizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 text-base',
  md: 'h-10 w-10 text-lg',
  lg: 'h-12 w-12 text-xl',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    class="inline-flex shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-38"
    :class="sizeClass[size]"
  >
    <slot />
  </button>
</template>
