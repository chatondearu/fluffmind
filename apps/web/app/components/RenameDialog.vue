<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDialog,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title?: string
  description?: string
  initialValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  confirm: [value: string]
}>()

const value = ref('')

watch(open, (isOpen) => {
  if (isOpen) {
    value.value = props.initialValue ?? ''
  }
})

function submit() {
  const trimmed = value.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
  open.value = false
}
</script>

<template>
  <FluffmindDialog
    :open="open"
    :title="title ?? 'Renommer'"
    :description="description"
    @update:open="open = $event"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FluffmindTextField
        v-model="value"
        :placeholder="placeholder ?? 'Nouveau nom'"
      />
      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" @click="open = false">
          Annuler
        </FluffmindButton>
        <FluffmindButton type="submit" :disabled="!value.trim()">
          Valider
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
