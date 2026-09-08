<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDialog,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title: string
  description: string
  confirmValue: string
  confirmLabel?: string
  inputLabel?: string
}>()

const emit = defineEmits<{
  confirm: []
}>()

const value = ref('')

const canConfirm = computed(() => value.value.trim() === props.confirmValue)

watch(open, (isOpen) => {
  if (isOpen)
    value.value = ''
})

function submit() {
  if (!canConfirm.value)
    return
  emit('confirm')
  open.value = false
}
</script>

<template>
  <FluffmindDialog
    :open="open"
    :title="title"
    :description="description"
    @update:open="open = $event"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label v-if="inputLabel" class="flex flex-col gap-1.5">
        <span class="md3-label-md text-on-surface-variant">
          {{ inputLabel }}
        </span>
        <FluffmindTextField
          v-model="value"
          :placeholder="confirmValue"
          autocomplete="off"
        />
      </label>
      <FluffmindTextField
        v-else
        v-model="value"
        :placeholder="confirmValue"
        autocomplete="off"
      />
      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" @click="open = false">
          Annuler
        </FluffmindButton>
        <FluffmindButton
          type="submit"
          class="bg-error text-on-error"
          :disabled="!canConfirm"
        >
          {{ confirmLabel ?? 'Confirmer' }}
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
