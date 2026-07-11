<script setup lang="ts">
interface Props {
  active?: boolean
  as?: 'div' | 'button'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  active: false,
  as: 'div',
  type: 'button',
  disabled: false,
})
</script>

<template>
  <component
    :is="as"
    :type="as === 'button' ? type : undefined"
    :disabled="as === 'button' ? disabled : undefined"
    class="md3-nav-item w-full"
    :class="active ? 'md3-nav-item-active' : ''"
  >
    <span v-if="$slots.leading" class="flex w-6 shrink-0 items-center justify-center text-on-surface-variant">
      <slot name="leading" />
    </span>
    <span class="min-w-0 flex-1 truncate">
      <slot />
    </span>
    <span v-if="$slots.trailing" class="shrink-0">
      <slot name="trailing" />
    </span>
  </component>
</template>
