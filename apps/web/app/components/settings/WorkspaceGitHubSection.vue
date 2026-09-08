<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindCheckbox,
  FluffmindChip,
  FluffmindSelect,
  FluffmindTextArea,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

type GitHubSyncMode = 'app' | 'pat' | 'local'

interface GitHubSyncState {
  linked: boolean
  syncMode: GitHubSyncMode
  owner: string | null
  repo: string | null
  authMode: 'app' | 'pat' | null
  appConfigured: boolean
  lastSyncedAt: string | null
  localOverrides: Record<string, boolean>
}

interface GitHubAppInstallation {
  installationId: string
  accountLogin: string
  accountType: string
}

interface GitHubInstallationRepository {
  fullName: string
}

interface WorkspaceMember {
  id: string
  name: string
  email: string
  role: string
}

const props = withDefaults(defineProps<{
  workspaceId: string
  canManage?: boolean
  workspaceSlug?: string
  contentRoots?: string[]
}>(), {
  canManage: true,
  workspaceSlug: '',
  contentRoots: () => [],
})

const emit = defineEmits<{
  'members-changed': []
}>()

const githubRepository = ref('')
const githubToken = ref('')
const githubLinked = ref(false)
const githubSyncMode = ref<GitHubSyncMode>('local')
const githubAuthMode = ref<GitHubSyncState['authMode']>(null)
const githubSetupChoice = ref<'app' | 'pat' | 'local' | null>(null)
const unlinkingGitHub = ref(false)
const githubAppConfigured = ref(false)
const githubAppInstallUrl = ref<string | null>(null)
const githubInstallations = ref<GitHubAppInstallation[]>([])
const githubInstallationId = ref('')
const githubInstallationRepositories = ref<GitHubInstallationRepository[]>([])
const githubAppRepository = ref('')
const githubLastSyncedAt = ref<string | null>(null)
const githubLinkError = ref<string | null>(null)
const githubLinkSuccess = ref<string | null>(null)
const createRepoName = ref('')
const createRepoPrivate = ref(true)
const githubSyncError = ref<string | null>(null)
const githubSyncSuccess = ref<string | null>(null)
const linkingGitHub = ref(false)
const creatingGithubRepo = ref(false)
const loadingGitHubInstallations = ref(false)
const loadingGitHubRepositories = ref(false)
const syncingGitHub = ref(false)
const localOverrides = ref<Record<string, boolean>>({})
const workspaceContentRoots = ref<string[]>([...props.contentRoots])
const contentRootsText = ref('')
const members = ref<WorkspaceMember[]>([])

const isLocalSync = computed(() => githubSyncMode.value === 'local')
const githubModeLabel = computed(() => {
  if (githubSyncMode.value === 'app')
    return 'GitHub App'
  if (githubSyncMode.value === 'pat')
    return 'PAT'
  return 'Local uniquement'
})
const showCreateGithubRepo = computed(() =>
  githubAppConfigured.value
  && props.canManage
  && isLocalSync.value
  && githubSetupChoice.value === 'app'
  && githubInstallations.value.length > 0,
)
const linkedRepositoryLabel = computed(() => {
  if (githubAuthMode.value && githubRepository.value)
    return githubRepository.value
  return '—'
})
const githubInstallationOptions = computed(() => githubInstallations.value.map(installation => ({
  value: installation.installationId,
  label: `${installation.accountLogin} (${installation.accountType === 'Organization' ? 'organisation' : 'compte personnel'})`,
})))
const githubRepositoryOptions = computed(() => githubInstallationRepositories.value.map(repository => ({
  value: repository.fullName,
  label: repository.fullName,
})))

watch(showCreateGithubRepo, (show) => {
  if (show && !createRepoName.value)
    createRepoName.value = `fluff-${props.workspaceSlug || 'workspace'}`
})

watch(() => props.contentRoots, (roots) => {
  workspaceContentRoots.value = Array.isArray(roots) ? [...roots] : []
}, { deep: true })

function formatDate(value: string | null): string {
  if (!value)
    return 'Inconnue'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return 'Inconnue'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function parseContentRoots(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map(root => root.trim())
    .filter(Boolean)
}

function normalizeMembers(input: unknown): WorkspaceMember[] {
  if (!Array.isArray(input))
    return []
  return input.map((item, index) => {
    const member = asRecord(item)
    return {
      id: asString(member.memberId, asString(member.id, `member-${index}`)),
      role: asString(member.role, 'read'),
      name: asString(member.name, 'Membre'),
      email: asString(member.email, '—'),
    }
  })
}

function syncLocalOverrideModel(): void {
  const next: Record<string, boolean> = {}
  for (const workspaceMember of members.value)
    next[workspaceMember.id] = Boolean(localOverrides.value[workspaceMember.id])
  localOverrides.value = next
}

function applyGitHubState(state: Partial<GitHubSyncState> | null): void {
  if (!state)
    return

  githubLinked.value = Boolean(state.linked)
  githubSyncMode.value = state.syncMode
    ?? (state.authMode === 'app' || state.authMode === 'pat' ? state.authMode : 'local')
  githubAuthMode.value = state.authMode ?? null
  githubAppConfigured.value = Boolean(state.appConfigured)
  githubLastSyncedAt.value = typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null

  if (githubSyncMode.value !== 'local')
    githubSetupChoice.value = null

  if (typeof state.owner === 'string' && typeof state.repo === 'string') {
    githubRepository.value = `${state.owner}/${state.repo}`
    githubAppRepository.value = `${state.owner}/${state.repo}`
  }
  else if (githubSyncMode.value === 'local') {
    githubRepository.value = ''
    githubAppRepository.value = ''
  }

  if (state.localOverrides && typeof state.localOverrides === 'object') {
    localOverrides.value = {
      ...localOverrides.value,
      ...state.localOverrides,
    }
    syncLocalOverrideModel()
  }
}

function selectSyncSetup(choice: 'app' | 'pat' | 'local'): void {
  if (!props.canManage || !isLocalSync.value)
    return
  githubSetupChoice.value = choice
  githubLinkError.value = null
  githubLinkSuccess.value = null
  if (choice === 'app' && githubAppConfigured.value)
    void loadGitHubInstallations()
}

function setLocalOverride(memberId: string, value: boolean): void {
  localOverrides.value = {
    ...localOverrides.value,
    [memberId]: value,
  }
}

function openGitHubAppInstallUrl(): void {
  if (!props.canManage || !githubAppInstallUrl.value)
    return
  window.open(githubAppInstallUrl.value, '_blank', 'noopener,noreferrer')
}

async function loadMembersForOverrides(): Promise<void> {
  if (!props.canManage)
    return
  try {
    const response = await $fetch<{ members: unknown[] }>('/api/workspaces/members', {
      query: { workspaceId: props.workspaceId },
    })
    members.value = normalizeMembers(response.members)
    syncLocalOverrideModel()
  }
  catch {
    // Overrides are optional; sync still works without the member list.
  }
}

async function unlinkGitHubSync(): Promise<void> {
  if (!props.canManage) {
    githubLinkError.value = 'Seul un propriétaire peut délier la synchronisation.'
    githubLinkSuccess.value = null
    return
  }

  githubLinkError.value = null
  githubLinkSuccess.value = null
  unlinkingGitHub.value = true
  try {
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/link', {
      method: 'DELETE',
      body: { workspaceId: props.workspaceId },
    })
    applyGitHubState(response)
    githubSetupChoice.value = null
    githubToken.value = ''
    githubLinkSuccess.value = 'Synchronisation déliée. Le workspace est en mode local uniquement.'
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Déliaison impossible.'
  }
  finally {
    unlinkingGitHub.value = false
  }
}

async function loadGitHubInstallations(): Promise<void> {
  if (!githubAppConfigured.value || !props.canManage)
    return

  loadingGitHubInstallations.value = true
  try {
    const [response, installUrl] = await Promise.all([
      $fetch<{ installations: GitHubAppInstallation[] }>('/api/github/installations'),
      $fetch<{ url: string }>('/api/github/app/install-url'),
    ])
    githubInstallations.value = Array.isArray(response.installations) ? response.installations : []
    githubAppInstallUrl.value = installUrl.url
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les installations GitHub App.'
  }
  finally {
    loadingGitHubInstallations.value = false
  }
}

async function loadGitHubState(): Promise<void> {
  githubLinkError.value = null
  try {
    const [syncState, appStatus] = await Promise.all([
      $fetch<GitHubSyncState>('/api/workspaces/github/sync', {
        method: 'POST',
        body: { run: false, workspaceId: props.workspaceId },
      }),
      $fetch<{ configured: boolean }>('/api/github/app/status'),
    ])
    applyGitHubState(syncState)
    githubAppConfigured.value = appStatus.configured

    if (githubAppConfigured.value && props.canManage)
      await loadGitHubInstallations()

    await loadMembersForOverrides()
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger l’état GitHub.'
  }
}

async function selectGitHubInstallation(installationId: string): Promise<void> {
  githubInstallationId.value = installationId
  githubInstallationRepositories.value = []
  githubAppRepository.value = ''

  if (!installationId)
    return

  loadingGitHubRepositories.value = true
  githubLinkError.value = null
  try {
    const response = await $fetch<{ repositories: GitHubInstallationRepository[] }>(`/api/github/installations/${installationId}/repos`)
    githubInstallationRepositories.value = Array.isArray(response.repositories) ? response.repositories : []
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les dépôts de cette installation.'
  }
  finally {
    loadingGitHubRepositories.value = false
  }
}

async function linkGitHubAppRepository(): Promise<void> {
  if (!props.canManage) {
    githubLinkError.value = 'Seul un propriétaire peut lier un dépôt GitHub.'
    githubLinkSuccess.value = null
    return
  }

  const repository = githubAppRepository.value.trim()
  const installationId = githubInstallationId.value

  if (!installationId || !repository) {
    githubLinkError.value = 'Choisissez une installation GitHub App et un dépôt.'
    githubLinkSuccess.value = null
    return
  }

  githubLinkError.value = null
  githubLinkSuccess.value = null
  linkingGitHub.value = true
  try {
    const contentRoots = parseContentRoots(contentRootsText.value)
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/link', {
      method: 'POST',
      body: {
        workspaceId: props.workspaceId,
        mode: 'app',
        repository,
        installationId,
        ...(contentRoots.length ? { contentRoots } : {}),
      },
    })
    applyGitHubState(response)
    if (contentRoots.length)
      workspaceContentRoots.value = contentRoots
    githubLinkSuccess.value = 'Dépôt GitHub lié via GitHub App.'
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Liaison GitHub App impossible.'
  }
  finally {
    linkingGitHub.value = false
  }
}

async function linkGitHubRepository(): Promise<void> {
  if (!props.canManage) {
    githubLinkError.value = 'Seul un propriétaire peut lier un dépôt GitHub.'
    githubLinkSuccess.value = null
    return
  }

  const repository = githubRepository.value.trim()
  const syncToken = githubToken.value.trim()

  if (!repository || !syncToken) {
    githubLinkError.value = 'Renseignez le dépôt (owner/repo) et le token GitHub.'
    githubLinkSuccess.value = null
    return
  }

  githubLinkError.value = null
  githubLinkSuccess.value = null
  linkingGitHub.value = true
  try {
    const contentRoots = parseContentRoots(contentRootsText.value)
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/link', {
      method: 'POST',
      body: {
        workspaceId: props.workspaceId,
        mode: 'pat',
        repository,
        syncToken,
        ...(contentRoots.length ? { contentRoots } : {}),
      },
    })
    applyGitHubState(response)
    githubToken.value = ''
    if (contentRoots.length)
      workspaceContentRoots.value = contentRoots
    githubLinkSuccess.value = 'Dépôt GitHub lié avec le PAT.'
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Liaison GitHub impossible.'
  }
  finally {
    linkingGitHub.value = false
  }
}

async function createGithubRepositoryForWorkspace(): Promise<void> {
  creatingGithubRepo.value = true
  githubLinkError.value = null
  githubLinkSuccess.value = null

  try {
    const response = await $fetch<{
      github?: { ok: true, owner: string, repo: string, htmlUrl: string } | { ok: false, message: string }
      authMode?: string | null
    }>('/api/workspaces/github/create-and-link', {
      method: 'POST',
      body: {
        workspaceId: props.workspaceId,
        installationId: githubInstallationId.value,
        name: createRepoName.value.trim() || undefined,
        private: createRepoPrivate.value,
      },
    })

    if (response.github && !response.github.ok) {
      githubLinkError.value = response.github.message
      return
    }

    await loadGitHubState()
    githubLinkSuccess.value = 'Dépôt GitHub créé et lié via GitHub App.'
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Création du dépôt impossible.'
  }
  finally {
    creatingGithubRepo.value = false
  }
}

async function syncNowFromGitHub(): Promise<void> {
  if (!props.canManage) {
    githubSyncError.value = 'Seul un propriétaire peut lancer la synchronisation.'
    githubSyncSuccess.value = null
    return
  }

  githubSyncError.value = null
  githubSyncSuccess.value = null
  syncingGitHub.value = true
  try {
    const response = await $fetch<GitHubSyncState & { result: Record<string, number> }>('/api/workspaces/github/sync', {
      method: 'POST',
      body: {
        workspaceId: props.workspaceId,
        run: true,
        localOverrides: Object.entries(localOverrides.value).map(([memberId, localOverride]) => ({
          memberId,
          localOverride,
        })),
      },
    })
    applyGitHubState(response)
    const result = response.result
    githubSyncSuccess.value = [
      `${result.created} créé(s)`,
      `${result.updated} mis à jour`,
      `${result.deleted} supprimé(s)`,
    ].join(' · ')
    await loadMembersForOverrides()
    emit('members-changed')
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubSyncError.value = asRecordError.data?.message || asRecordError.message || 'Synchronisation GitHub impossible.'
  }
  finally {
    syncingGitHub.value = false
  }
}

watch(() => props.workspaceId, () => {
  void loadGitHubState()
}, { immediate: true })
</script>

<template>
  <FluffmindCard padding="lg" class="mb-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="md3-title-md">
        Synchronisation GitHub
      </h2>
      <FluffmindChip variant="outlined">
        Mode : {{ githubModeLabel }}
      </FluffmindChip>
    </div>

    <p class="mb-4 md3-body-md text-on-surface-variant">
      Un seul mode actif par workspace (GitHub App, PAT ou local). Déliez d’abord pour en changer.
    </p>
    <section v-if="workspaceContentRoots.length > 0" class="mb-4">
      <h3 class="md3-title-sm">
        Dossiers du vault
      </h3>
      <div class="mt-2 flex flex-wrap gap-2">
        <FluffmindChip v-for="root in workspaceContentRoots" :key="root" variant="outlined">
          <code>{{ root }}</code>
        </FluffmindChip>
      </div>
    </section>

    <!-- Active linked mode -->
    <template v-if="!isLocalSync">
      <section class="rounded-xl bg-surface-container-low p-4">
        <h3 class="md3-title-sm">
          Mode actif : {{ githubModeLabel }}
        </h3>
        <p class="mt-2 md3-body-md">
          Dépôt : <code class="text-primary">{{ linkedRepositoryLabel }}</code>
        </p>
        <p class="mt-2 md3-body-md text-on-surface-variant">
          Dernière synchro : {{ githubLastSyncedAt ? formatDate(githubLastSyncedAt) : 'Jamais' }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <FluffmindButton
            variant="outlined"
            :disabled="syncingGitHub || !githubLinked || !canManage"
            @click="syncNowFromGitHub"
          >
            {{ syncingGitHub ? 'Synchro…' : 'Synchroniser maintenant' }}
          </FluffmindButton>
          <FluffmindButton
            variant="outlined"
            :disabled="unlinkingGitHub || !canManage"
            @click="unlinkGitHubSync"
          >
            {{ unlinkingGitHub ? 'Déliaison…' : 'Délier la synchronisation' }}
          </FluffmindButton>
        </div>

        <ul v-if="canManage && members.length > 0" class="mt-6 divide-y divide-outline-variant border-t border-outline-variant pt-4">
          <li
            v-for="workspaceMember in members"
            :key="workspaceMember.id"
            class="flex flex-wrap items-center justify-between gap-2 py-3"
          >
            <div>
              <p class="md3-title-sm">
                {{ workspaceMember.name }}
              </p>
              <p class="md3-body-md text-on-surface-variant">
                {{ workspaceMember.email }} · {{ workspaceMember.role }}
              </p>
            </div>
            <FluffmindCheckbox
              :model-value="localOverrides[workspaceMember.id] ?? false"
              @update:model-value="setLocalOverride(workspaceMember.id, $event)"
            >
              Priorité locale
            </FluffmindCheckbox>
          </li>
        </ul>
      </section>
    </template>

    <!-- Chooser when local -->
    <template v-else>
      <div class="mb-4 flex flex-wrap gap-2">
        <FluffmindButton
          v-if="githubAppConfigured"
          :variant="githubSetupChoice === 'app' ? 'filled' : 'outlined'"
          size="sm"
          :disabled="!canManage"
          @click="selectSyncSetup('app')"
        >
          GitHub App
        </FluffmindButton>
        <FluffmindButton
          :variant="githubSetupChoice === 'pat' ? 'filled' : 'outlined'"
          size="sm"
          :disabled="!canManage"
          @click="selectSyncSetup('pat')"
        >
          PAT
        </FluffmindButton>
        <FluffmindButton
          :variant="githubSetupChoice === 'local' ? 'filled' : 'outlined'"
          size="sm"
          :disabled="!canManage"
          @click="selectSyncSetup('local')"
        >
          Local uniquement
        </FluffmindButton>
      </div>

      <p v-if="!githubSetupChoice" class="md3-body-md text-on-surface-variant">
        Choisissez un mode de synchronisation pour ce workspace.
      </p>

      <section v-else-if="githubSetupChoice === 'local'" class="rounded-xl bg-surface-container-low p-4">
        <h3 class="md3-title-sm">
          Local uniquement
        </h3>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Aucun dépôt GitHub distant. Les notes restent sur le stockage du workspace.
        </p>
      </section>

      <section
        v-else-if="githubSetupChoice === 'app' && githubAppConfigured"
        class="rounded-xl bg-surface-container-low p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="md3-title-sm">
              Lier via GitHub App
            </h3>
            <p class="mt-1 md3-body-md text-on-surface-variant">
              Installez l’application, puis choisissez une installation et un dépôt.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <FluffmindButton
              variant="outlined"
              size="sm"
              :disabled="!canManage || !githubAppInstallUrl"
              @click="openGitHubAppInstallUrl"
            >
              Installer l’application
            </FluffmindButton>
            <FluffmindButton
              variant="outlined"
              size="sm"
              :disabled="loadingGitHubInstallations || !canManage"
              @click="loadGitHubInstallations"
            >
              {{ loadingGitHubInstallations ? 'Chargement…' : 'Actualiser les installations' }}
            </FluffmindButton>
          </div>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block md3-label-lg">Installation GitHub App</span>
            <FluffmindSelect
              :model-value="githubInstallationId"
              :options="githubInstallationOptions"
              placeholder="Choisir une installation"
              :disabled="loadingGitHubInstallations || !canManage"
              @update:model-value="selectGitHubInstallation"
            />
          </label>
          <label class="block">
            <span class="mb-2 block md3-label-lg">Dépôt</span>
            <FluffmindSelect
              v-model="githubAppRepository"
              :options="githubRepositoryOptions"
              placeholder="Choisir un dépôt"
              :disabled="!githubInstallationId || loadingGitHubRepositories || !canManage"
            />
          </label>
        </div>
        <label v-if="workspaceContentRoots.length === 0" class="mt-4 block">
          <span class="mb-2 block md3-label-lg">Dossiers du vault (optionnel)</span>
          <FluffmindTextArea
            v-model="contentRootsText"
            placeholder="foam, docs"
            :disabled="!canManage"
          />
          <span class="mt-2 block md3-body-sm text-on-surface-variant">
            Ex. foam, docs — laisser vide = dépôt entier
          </span>
        </label>
        <p v-if="githubInstallationId && !loadingGitHubRepositories && githubInstallationRepositories.length === 0" class="mt-4 md3-body-md text-on-surface-variant">
          Aucun dépôt disponible pour cette installation.
        </p>
        <FluffmindButton
          class="mt-4"
          :disabled="linkingGitHub || !githubInstallationId || !githubAppRepository || !canManage"
          @click="linkGitHubAppRepository"
        >
          {{ linkingGitHub ? 'Liaison…' : 'Lier via GitHub App' }}
        </FluffmindButton>

        <section v-if="showCreateGithubRepo" class="mt-6 border-t border-outline-variant pt-6">
          <h3 class="md3-title-sm">
            Créer un dépôt GitHub
          </h3>
          <p class="mt-1 md3-body-md text-on-surface-variant">
            Crée un dépôt via l’App et le lie à ce workspace (privé par défaut).
          </p>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block md3-label-lg">Installation GitHub App</span>
              <FluffmindSelect
                :model-value="githubInstallationId"
                :options="githubInstallationOptions"
                placeholder="Choisir une installation"
                :disabled="loadingGitHubInstallations || !canManage"
                @update:model-value="selectGitHubInstallation"
              />
            </label>
            <label class="block">
              <span class="mb-2 block md3-label-lg">Nom du dépôt</span>
              <FluffmindTextField
                v-model="createRepoName"
                type="text"
                placeholder="fluff-workspace"
              />
            </label>
            <div class="flex items-end">
              <FluffmindCheckbox
                :model-value="createRepoPrivate"
                @update:model-value="createRepoPrivate = $event"
              >
                Dépôt privé
              </FluffmindCheckbox>
            </div>
          </div>
          <FluffmindButton
            class="mt-4"
            :disabled="creatingGithubRepo || !githubInstallationId || !canManage"
            @click="createGithubRepositoryForWorkspace"
          >
            {{ creatingGithubRepo ? 'Création…' : 'Créer un dépôt' }}
          </FluffmindButton>
        </section>
      </section>

      <section
        v-else-if="githubSetupChoice === 'pat'"
        class="rounded-xl bg-surface-container-low p-4"
      >
        <h3 class="md3-title-sm">
          Lier avec un PAT
        </h3>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Utilisez un token d’accès personnel pour lier un dépôt existant.
        </p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block md3-label-lg">Dépôt</span>
            <FluffmindTextField
              v-model="githubRepository"
              type="text"
              placeholder="owner/repo"
            />
          </label>
          <label class="block">
            <span class="mb-2 block md3-label-lg">Token GitHub (PAT)</span>
            <FluffmindTextField
              v-model="githubToken"
              type="password"
              placeholder="ghp_..."
            />
          </label>
        </div>
        <label v-if="workspaceContentRoots.length === 0" class="mt-4 block">
          <span class="mb-2 block md3-label-lg">Dossiers du vault (optionnel)</span>
          <FluffmindTextArea
            v-model="contentRootsText"
            placeholder="foam, docs"
            :disabled="!canManage"
          />
          <span class="mt-2 block md3-body-sm text-on-surface-variant">
            Ex. foam, docs — laisser vide = dépôt entier
          </span>
        </label>
        <FluffmindButton class="mt-4" :disabled="linkingGitHub || !canManage" @click="linkGitHubRepository">
          {{ linkingGitHub ? 'Liaison…' : 'Lier avec le PAT' }}
        </FluffmindButton>
      </section>
    </template>

    <p v-if="!canManage" class="mt-4 md3-body-md text-on-surface-variant">
      Seuls les propriétaires peuvent gérer la liaison et la synchronisation GitHub.
    </p>
    <p v-if="githubLinkSuccess" class="mt-4 md3-body-md text-tertiary">
      {{ githubLinkSuccess }}
    </p>
    <p v-if="githubLinkError" class="mt-4 md3-body-md text-error">
      {{ githubLinkError }}
    </p>
    <p v-if="githubSyncSuccess" class="mt-4 md3-body-md text-tertiary">
      {{ githubSyncSuccess }}
    </p>
    <p v-if="githubSyncError" class="mt-4 md3-body-md text-error">
      {{ githubSyncError }}
    </p>
  </FluffmindCard>
</template>
