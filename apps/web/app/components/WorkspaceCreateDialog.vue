<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCheckbox,
  FluffmindDialog,
  FluffmindSelect,
  FluffmindTextArea,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import {
  type WorkspaceCreateGithubMode,
  buildWorkspaceCreatePostBody,
  buildWorkspaceGithubLinkBody,
  canSubmitWorkspaceCreate,
  defaultGithubModeWhenAvailable,
} from '../utils/workspace-create-github'

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
const githubMode = ref<WorkspaceCreateGithubMode>('none')
const installationId = ref('')
const repoName = ref('')
const autoRepoName = ref('')
const repoPrivate = ref(true)
const linkedRepository = ref('')
const repositories = ref<Array<{ value: string, label: string }>>([])
const loadingRepositories = ref(false)
const repositoriesLoadGeneration = ref(0)
const repositoriesError = ref<string | null>(null)
const contentRootsText = ref('')
const githubAvailable = ref(false)
const installations = ref<GitHubAppInstallation[]>([])
const loadingGitHub = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

const githubModeOptions = [
  { value: 'create', label: 'Créer un dépôt GitHub' },
  { value: 'link', label: 'Lier un dépôt existant' },
  { value: 'none', label: 'Sans GitHub (local)' },
]

const installationOptions = computed(() => installations.value.map(installation => ({
  value: installation.installationId,
  label: `${installation.accountLogin} (${installation.accountType === 'Organization' ? 'organisation' : 'compte personnel'})`,
})))

const canSubmit = computed(() => {
  if (githubMode.value === 'link' && loadingRepositories.value)
    return false
  return canSubmitWorkspaceCreate({
    name: name.value,
    mode: githubMode.value,
    installationId: installationId.value,
    repository: linkedRepository.value,
  })
})

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
  githubMode.value = 'none'
  installationId.value = ''
  repoName.value = ''
  autoRepoName.value = ''
  repoPrivate.value = true
  linkedRepository.value = ''
  repositories.value = []
  repositoriesLoadGeneration.value += 1
  loadingRepositories.value = false
  repositoriesError.value = null
  contentRootsText.value = ''
  githubAvailable.value = false
  installations.value = []
  error.value = null
}

async function loadRepositoriesForInstallation(id: string): Promise<void> {
  const generation = ++repositoriesLoadGeneration.value
  linkedRepository.value = ''
  repositories.value = []
  repositoriesError.value = null
  if (!id || githubMode.value !== 'link')
    return

  loadingRepositories.value = true
  try {
    const response = await $fetch<{ repositories?: Array<{ fullName?: string }> }>(
      `/api/github/installations/${id}/repos`,
    )
    if (generation !== repositoriesLoadGeneration.value)
      return
    const rows = Array.isArray(response.repositories) ? response.repositories : []
    repositories.value = rows
      .map(repo => (typeof repo.fullName === 'string' ? repo.fullName.trim() : ''))
      .filter(Boolean)
      .map(fullName => ({ value: fullName, label: fullName }))
  }
  catch (requestError) {
    if (generation !== repositoriesLoadGeneration.value)
      return
    const asRecord = requestError as { data?: { message?: string }, message?: string }
    repositoriesError.value = asRecord.data?.message || asRecord.message || 'Impossible de charger les dépôts.'
  }
  finally {
    if (generation === repositoriesLoadGeneration.value)
      loadingRepositories.value = false
  }
}

async function loadGitHubOptions(): Promise<void> {
  loadingGitHub.value = true

  try {
    const status = await $fetch<{ configured: boolean }>('/api/github/app/status')
    if (!status.configured)
      return

    const response = await $fetch<{ installations: GitHubAppInstallation[] }>('/api/github/installations')
    installations.value = Array.isArray(response.installations) ? response.installations : []
    githubAvailable.value = installations.value.length > 0
    installationId.value = installations.value[0]?.installationId ?? ''
    githubMode.value = defaultGithubModeWhenAvailable(githubAvailable.value)
  }
  catch {
    // GitHub remains an optional part of workspace creation.
    githubMode.value = 'none'
  }
  finally {
    loadingGitHub.value = false
  }
}

function close(): void {
  emit('update:open', false)
}

async function submit(): Promise<void> {
  const trimmedName = name.value.trim()
  if (githubMode.value === 'link' && loadingRepositories.value)
    return
  if (!canSubmitWorkspaceCreate({
    name: trimmedName,
    mode: githubMode.value,
    installationId: installationId.value,
    repository: linkedRepository.value,
  })) return

  error.value = null
  submitting.value = true

  try {
    const contentRoots = contentRootsText.value
      .split(/[\n,]/)
      .map(root => root.trim())
      .filter(Boolean)

    const body = buildWorkspaceCreatePostBody({
      name: trimmedName,
      contentRoots,
      mode: githubMode.value,
      create: {
        installationId: installationId.value,
        repoName: repoName.value,
        repoPrivate: repoPrivate.value,
      },
    })

    const response = await $fetch<{
      organization: { id: string }
      github?: { ok: true } | { ok: false, message: string }
    }>('/api/workspaces', { method: 'POST', body })

    let githubWarning = response.github && !response.github.ok
      ? response.github.message
      : undefined

    if (githubMode.value === 'link' && !githubWarning) {
      try {
        await $fetch('/api/workspaces/github/link', {
          method: 'POST',
          body: buildWorkspaceGithubLinkBody({
            workspaceId: response.organization.id,
            contentRoots,
            link: {
              installationId: installationId.value,
              repository: linkedRepository.value,
            },
          }),
        })
      }
      catch (linkError) {
        const asRecord = linkError as { data?: { message?: string }, message?: string }
        githubWarning = asRecord.data?.message || asRecord.message || 'Impossible de lier le dépôt GitHub.'
      }
    }

    emit('created', {
      organizationId: response.organization.id,
      githubWarning,
    })
    close()
  }
  catch (requestError) {
    const asRecord = requestError as { data?: { message?: string }, message?: string }
    error.value = asRecord.data?.message || asRecord.message || 'Impossible de créer le workspace.'
  }
  finally {
    submitting.value = false
  }
}

function defaultRepoNameFromWorkspaceName(workspaceName: string): string {
  const slug = slugify(workspaceName)
  return `fluff-${slug || 'workspace'}`
}

watch(name, (value) => {
  const nextAuto = defaultRepoNameFromWorkspaceName(value)
  if (!repoName.value || repoName.value === autoRepoName.value)
    repoName.value = nextAuto
  autoRepoName.value = nextAuto
})

watch(installationId, (id) => {
  if (githubMode.value === 'link')
    void loadRepositoriesForInstallation(id)
})

watch(githubMode, (mode) => {
  if (mode === 'link')
    void loadRepositoriesForInstallation(installationId.value)
  else {
    linkedRepository.value = ''
    repositories.value = []
    repositoriesError.value = null
  }
})

watch(() => props.open, (isOpen) => {
  if (!isOpen)
    return

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
      <label class="block">
        <span class="mb-2 block md3-label-lg">Dossiers du vault (optionnel)</span>
        <FluffmindTextArea
          v-model="contentRootsText"
          placeholder="foam, docs"
          :disabled="submitting"
        />
        <span class="mt-2 block md3-body-sm text-on-surface-variant">
          Ex. foam, docs — laisser vide = dépôt entier
        </span>
      </label>

      <section v-if="githubAvailable" class="rounded-xl bg-surface-container-low p-4">
        <label class="block">
          <span class="mb-2 block md3-label-lg">GitHub</span>
          <FluffmindSelect
            v-model="githubMode"
            :options="githubModeOptions"
            :disabled="loadingGitHub || submitting"
          />
        </label>

        <div v-if="githubMode === 'create'" class="mt-4 grid gap-4">
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

        <div v-else-if="githubMode === 'link'" class="mt-4 grid gap-4">
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
            <span class="mb-2 block md3-label-lg">Dépôt existant</span>
            <FluffmindSelect
              v-model="linkedRepository"
              :options="repositories"
              placeholder="Choisir un dépôt"
              :disabled="loadingRepositories || submitting || !installationId"
            />
            <span v-if="loadingRepositories" class="mt-2 block md3-body-sm text-on-surface-variant">
              Chargement des dépôts…
            </span>
            <span v-else-if="repositoriesError" class="mt-2 block md3-body-sm text-error">
              {{ repositoriesError }}
            </span>
            <span v-else-if="installationId && !repositories.length" class="mt-2 block md3-body-sm text-on-surface-variant">
              Aucun dépôt accessible pour cette installation.
            </span>
          </label>
        </div>
      </section>

      <p v-if="error" class="text-sm text-error">
        {{ error }}
      </p>

      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" :disabled="submitting" @click="close">
          Annuler
        </FluffmindButton>
        <FluffmindButton type="submit" :disabled="submitting || !canSubmit">
          {{ submitting ? 'Création…' : 'Créer' }}
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
