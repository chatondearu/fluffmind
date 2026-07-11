<script setup lang="ts">
import EditableSurface from '@fluffmind/editor-blocks/src/components/EditableSurface.vue'

const model = defineModel<string>({ required: true })

const placeholder = 'Sans titre'
</script>

<template>
  <div class="mb-6 md3-display-sm text-on-surface">
    <EditableSurface
      v-model="model"
      :placeholder="placeholder"
      :multiline="false"
    />
  </div>
</template>

<style scoped>
:deep(.editable-surface) {
  min-height: 2.5rem;
}
</style>
