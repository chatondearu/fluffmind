<script setup lang="ts">
interface Props {
  variant?: 'filled' | 'outlined' | 'text' | 'tonal'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<Props>(), {
  variant: 'filled',
  size: 'md',
  disabled: false,
  type: 'button',
})

const sizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 px-4 text-xs',
  md: 'h-10 px-6 text-sm',
  lg: 'h-12 px-8 text-base',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-38"
    :class="[
      sizeClass[size],
      {
        'bg-primary text-on-primary hover:bg-primary/92 active:bg-primary/88': variant === 'filled',
        'border border-outline text-primary hover:bg-primary/8 active:bg-primary/12': variant === 'outlined',
        'text-primary hover:bg-primary/8 active:bg-primary/12': variant === 'text',
        'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/92': variant === 'tonal',
      },
    ]"
  >
    <slot />
  </button>
</template>
