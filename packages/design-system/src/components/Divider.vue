<script setup lang="ts">
interface Props {
  inset?: boolean
}

withDefaults(defineProps<Props>(), {
  inset: false,
})
</script>

<template>
  <hr
    class="border-0 border-t border-outline-variant"
    :class="inset ? 'mx-4' : ''"
  >
</template>
