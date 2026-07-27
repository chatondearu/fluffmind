<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCheckbox,
  FluffmindDialog,
  FluffmindSelect,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

interface GitHubAppInstallation {
  installationId: string
  accountLogin: string
  accountType: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [payload: { organizationId: string, githubWarning?: string }]
}>()

const name = ref('')
const createGithub = ref(false)
const installationId = ref('')
const repoName = ref('')
const repoPrivate = ref(true)
const githubAvailable = ref(false)
const installations = ref<GitHubAppInstallation[]>([])
const loadingGitHub = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

const installationOptions = computed(() => installations.value.map(installation => ({
  value: installation.installationId,
  label: `${installation.accountLogin} (${installation.accountType === 'Organization' ? 'organisation' : 'compte personnel'})`,
})))

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

function resetForm(): void {
  name.value = ''
  createGithub.value = false
  installationId.value = ''
  repoName.value = ''
  repoPrivate.value = true
  githubAvailable.value = false
  installations.value = []
  error.value = null
}

async function loadGitHubOptions(): Promise<void> {
  loadingGitHub.value = true

  try {
    const status = await $fetch<{ configured: boolean }>('/api/github/app/status')
    if (!status.configured) return

    const response = await $fetch<{ installations: GitHubAppInstallation[] }>('/api/github/installations')
    installations.value = Array.isArray(response.installations) ? response.installations : []
    githubAvailable.value = installations.value.length > 0
    installationId.value = installations.value[0]?.installationId ?? ''
    createGithub.value = githubAvailable.value
  } catch {
    // GitHub remains an optional part of workspace creation.
    createGithub.value = false
  } finally {
    loadingGitHub.value = false
  }
}

function close(): void {
  emit('update:open', false)
}

async function submit(): Promise<void> {
  const trimmedName = name.value.trim()
  if (!trimmedName) return

  error.value = null
  submitting.value = true

  try {
    const body: Record<string, unknown> = { name: trimmedName }
    if (createGithub.value && installationId.value) {
      body.createGithubRepo = {
        installationId: installationId.value,
        name: repoName.value.trim() || undefined,
        private: repoPrivate.value,
      }
    }

    const response = await $fetch<{
      organization: { id: string }
      github?: { ok: true } | { ok: false, message: string }
    }>('/api/workspaces', { method: 'POST', body })

    emit('created', {
      organizationId: response.organization.id,
      githubWarning: response.github && !response.github.ok ? response.github.message : undefined,
    })
    close()
  } catch (requestError) {
    const asRecord = requestError as { data?: { message?: string }, message?: string }
    error.value = asRecord.data?.message || asRecord.message || 'Impossible de créer le workspace.'
  } finally {
    submitting.value = false
  }
}

watch(name, (value) => {
  const slug = slugify(value)
  repoName.value = `fluff-${slug || 'workspace'}`
})

watch(() => props.open, (isOpen) => {
  if (!isOpen) return

  resetForm()
  void loadGitHubOptions()
})
</script>

<template>
  <FluffmindDialog
    :open="open"
    title="Nouveau workspace"
    description="Créez un espace de travail pour vos notes."
    @update:open="emit('update:open', $event)"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="block">
        <span class="mb-2 block md3-label-lg">Nom du workspace</span>
        <FluffmindTextField
          v-model="name"
          placeholder="Mon workspace"
          :disabled="submitting"
          autofocus
        />
      </label>

      <section v-if="githubAvailable" class="rounded-xl bg-surface-container-low p-4">
        <FluffmindCheckbox
          :model-value="createGithub"
          :disabled="loadingGitHub || submitting"
          @update:model-value="createGithub = $event"
        >
          Créer un dépôt GitHub
        </FluffmindCheckbox>

        <div v-if="createGithub" class="mt-4 grid gap-4">
          <label class="block">
            <span class="mb-2 block md3-label-lg">Installation GitHub App</span>
            <FluffmindSelect
              v-model="installationId"
              :options="installationOptions"
              placeholder="Choisir une installation"
              :disabled="loadingGitHub || submitting"
            />
          </label>
          <label class="block">
            <span class="mb-2 block md3-label-lg">Nom du dépôt</span>
            <FluffmindTextField
              v-model="repoName"
              placeholder="fluff-workspace"
              :disabled="submitting"
            />
          </label>
          <FluffmindCheckbox
            :model-value="repoPrivate"
            :disabled="submitting"
            @update:model-value="repoPrivate = $event"
          >
            Dépôt privé
          </FluffmindCheckbox>
        </div>
      </section>

      <p v-if="error" class="text-sm text-error">
        {{ error }}
      </p>

      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" :disabled="submitting" @click="close">
          Annuler
        </FluffmindButton>
        <FluffmindButton type="submit" :disabled="submitting || !name.trim() || (createGithub && !installationId)">
          {{ submitting ? 'Création…' : 'Créer' }}
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
