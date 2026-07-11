<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDialog,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title?: string
  description?: string
}>()

const emit = defineEmits<{
  confirm: [name: string]
}>()

const name = ref('')

watch(open, (value) => {
  if (value) name.value = ''
})

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
  open.value = false
}
</script>

<template>
  <FluffmindDialog
    :open="open"
    :title="title ?? 'Nouveau dossier'"
    :description="description ?? 'Choisis un nom pour ce dossier.'"
    @update:open="open = $event"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FluffmindTextField
        v-model="name"
        placeholder="Nom du dossier"
      />
      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" @click="open = false">
          Annuler
        </FluffmindButton>
        <FluffmindButton type="submit" :disabled="!name.trim()">
          Créer
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
