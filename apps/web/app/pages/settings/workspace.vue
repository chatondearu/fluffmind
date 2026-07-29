<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindCheckbox,
  FluffmindChip,
  FluffmindSelect,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import { authClient } from '../../composables/useAuth'
import {
  buildAcceptInvitationUrl,
  buildWorkspaceInvitationPayload,
  extractInvitationIdFromInviteMemberResponse,
  formatInvitationRecipient,
} from '../../utils/invitations'

type WorkspaceRole = 'read' | 'write' | 'owner'

interface WorkspaceMember {
  id: string
  role: string
  createdAt: string | null
  name: string
  email: string
}

interface WorkspaceInvitation {
  id: string
  role: string
  email: string
  githubLogin: string | null
  status: string
  expiresAt: string | null
}

interface GitHubInviteCandidate {
  login: string
  label: string
}

interface WorkspaceInvitationResponse {
  invitationId: string
  url: string
  githubLogin?: string
  email?: string
}

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

const roleOptions: Array<{ value: WorkspaceRole, label: string }> = [
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
  { value: 'owner', label: 'Propriétaire' },
]

const organizationName = ref('Workspace')
const organizationSlug = ref('')
const members = ref<WorkspaceMember[]>([])
const invitations = ref<WorkspaceInvitation[]>([])
const loading = ref(true)
const reloading = ref(false)
const submittingInvitation = ref(false)
const inviteEmail = ref('')
const inviteGithubLogin = ref('')
const selectedGithubCandidate = ref('')
const githubInviteCandidates = ref<GitHubInviteCandidate[]>([])
const inviteRole = ref<WorkspaceRole>('read')
const invitationLink = ref<string | null>(null)
const copyingInvitationLink = ref(false)
const pageError = ref<string | null>(null)
const inviteSuccess = ref<string | null>(null)
const inviteError = ref<string | null>(null)
const workspaceRole = ref<string>('read')
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

const canManageGitHub = computed(() => workspaceRole.value === 'owner')
const isLocalSync = computed(() => githubSyncMode.value === 'local')
const githubModeLabel = computed(() => {
  if (githubSyncMode.value === 'app') return 'GitHub App'
  if (githubSyncMode.value === 'pat') return 'PAT'
  return 'Local uniquement'
})
const showCreateGithubRepo = computed(() =>
  githubAppConfigured.value
  && canManageGitHub.value
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
const githubInviteCandidateOptions = computed(() => githubInviteCandidates.value.map(candidate => ({
  value: candidate.login,
  label: candidate.label,
})))

watch(showCreateGithubRepo, (show) => {
  if (show && !createRepoName.value)
    createRepoName.value = `fluff-${organizationSlug.value || 'workspace'}`
})

function formatDate(value: string | null): string {
  if (!value) return 'Inconnue'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Inconnue'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function extractErrorMessage(response: unknown, fallback: string): string | null {
  const error = (response as { error?: { message?: string | null } | null })?.error
  if (!error) return null
  return error.message || fallback
}

function extractData<T>(response: unknown): T | null {
  return ((response as { data?: T | null })?.data ?? null)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function normalizeMembers(input: unknown): WorkspaceMember[] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const member = asRecord(item)
    const user = asRecord(member.user)
    const memberId = asString(member.id, `member-${index}`)
    return {
      id: memberId,
      role: asString(member.role, 'read'),
      createdAt: typeof member.createdAt === 'string' ? member.createdAt : null,
      name: asString(user.name, 'Membre'),
      email: asString(user.email, '—'),
    }
  })
}

function normalizeInvitations(input: unknown): WorkspaceInvitation[] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const invitation = asRecord(item)
    const invitationId = asString(invitation.id, `invitation-${index}`)
    return {
      id: invitationId,
      role: asString(invitation.role, 'read'),
      email: asString(invitation.email, '—'),
      githubLogin: typeof invitation.githubLogin === 'string' ? invitation.githubLogin : null,
      status: asString(invitation.status, 'pending'),
      expiresAt: typeof invitation.expiresAt === 'string' ? invitation.expiresAt : null,
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
  if (!canManageGitHub.value || !isLocalSync.value)
    return
  githubSetupChoice.value = choice
  githubLinkError.value = null
  githubLinkSuccess.value = null
  if (choice === 'app' && githubAppConfigured.value)
    void loadGitHubInstallations()
}

async function unlinkGitHubSync(): Promise<void> {
  if (!canManageGitHub.value) {
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

async function loadGitHubState(): Promise<void> {
  githubLinkError.value = null
  try {
    const [syncState, appStatus] = await Promise.all([
      $fetch<GitHubSyncState>('/api/workspaces/github/sync', {
        method: 'POST',
        body: { run: false },
      }),
      $fetch<{ configured: boolean }>('/api/github/app/status'),
    ])
    applyGitHubState(syncState)
    githubAppConfigured.value = appStatus.configured

    if (githubAppConfigured.value && canManageGitHub.value)
      await loadGitHubInstallations()
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger l’état GitHub.'
  }
}

async function loadGitHubInstallations(): Promise<void> {
  if (!githubAppConfigured.value || !canManageGitHub.value)
    return

  loadingGitHubInstallations.value = true
  try {
    const [response, installUrl] = await Promise.all([
      $fetch<{ installations: GitHubAppInstallation[] }>('/api/github/installations'),
      $fetch<{ url: string }>('/api/github/app/install-url'),
    ])
    githubInstallations.value = Array.isArray(response.installations) ? response.installations : []
    githubAppInstallUrl.value = installUrl.url
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les installations GitHub App.'
  } finally {
    loadingGitHubInstallations.value = false
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
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les dépôts de cette installation.'
  } finally {
    loadingGitHubRepositories.value = false
  }
}

async function linkGitHubAppRepository(): Promise<void> {
  if (!canManageGitHub.value) {
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
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/link', {
      method: 'POST',
      body: {
        mode: 'app',
        repository,
        installationId,
      },
    })
    applyGitHubState(response)
    githubLinkSuccess.value = 'Dépôt GitHub lié via GitHub App.'
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Liaison GitHub App impossible.'
  } finally {
    linkingGitHub.value = false
  }
}

async function linkGitHubRepository() {
  if (!canManageGitHub.value) {
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
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/link', {
      method: 'POST',
      body: {
        mode: 'pat',
        repository,
        syncToken,
      },
    })
    applyGitHubState(response)
    githubToken.value = ''
    githubLinkSuccess.value = 'Dépôt GitHub lié avec le PAT.'
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Liaison GitHub impossible.'
  } finally {
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
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Création du dépôt impossible.'
  } finally {
    creatingGithubRepo.value = false
  }
}

function setLocalOverride(memberId: string, value: boolean): void {
  localOverrides.value = {
    ...localOverrides.value,
    [memberId]: value,
  }
}

function openGitHubAppInstallUrl(): void {
  if (!canManageGitHub.value || !githubAppInstallUrl.value)
    return
  window.open(githubAppInstallUrl.value, '_blank', 'noopener,noreferrer')
}


async function syncNowFromGitHub() {
  if (!canManageGitHub.value) {
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
    await loadWorkspaceData(true)
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubSyncError.value = asRecordError.data?.message || asRecordError.message || 'Synchronisation GitHub impossible.'
  } finally {
    syncingGitHub.value = false
  }
}

async function loadWorkspaceData(isManualReload = false) {
  if (isManualReload) reloading.value = true
  else loading.value = true

  pageError.value = null
  inviteSuccess.value = null

  try {
    const [fullOrganizationResponse, membersResponse, activeWorkspace] = await Promise.all([
      authClient.organization.getFullOrganization(),
      authClient.organization.listMembers({}),
      $fetch<{ member?: { role?: string | null } | null }>('/api/workspaces/active'),
    ])

    const fullOrganizationError = extractErrorMessage(fullOrganizationResponse, 'Impossible de charger le workspace.')
    const membersError = extractErrorMessage(membersResponse, 'Impossible de charger les membres.')

    if (fullOrganizationError || membersError) {
      pageError.value = fullOrganizationError || membersError
      return
    }

    const fullOrganization = asRecord(extractData(fullOrganizationResponse))
    organizationName.value = asString(fullOrganization.name, 'Workspace')
    organizationSlug.value = asString(fullOrganization.slug)
    workspaceRole.value = asString(activeWorkspace.member?.role, 'read')

    const fullMembers = fullOrganization.members
    const fallbackMembers = extractData(membersResponse)

    members.value = normalizeMembers(Array.isArray(fullMembers) && fullMembers.length > 0 ? fullMembers : fallbackMembers)
    syncLocalOverrideModel()

    if (canManageGitHub.value) {
      const [pendingInvitations, candidateResponse] = await Promise.all([
        $fetch<unknown[]>('/api/workspaces/invitations'),
        $fetch<{ candidates?: Array<{ login?: string }> }>('/api/workspaces/github/invite-candidates'),
      ])
      invitations.value = normalizeInvitations(pendingInvitations)
      githubInviteCandidates.value = Array.isArray(candidateResponse.candidates)
        ? candidateResponse.candidates.flatMap((candidate) => {
            const login = asString(candidate.login).trim()
            return login ? [{ login, label: `@${login}` }] : []
          })
        : []
    }
    else {
      invitations.value = []
      githubInviteCandidates.value = []
    }

    await loadGitHubState()
  } catch (error) {
    const asRecordError = error as { message?: string }
    pageError.value = asRecordError.message || 'Chargement du workspace impossible.'
  } finally {
    loading.value = false
    reloading.value = false
  }
}

async function inviteMember() {
  const payload = buildWorkspaceInvitationPayload({
    email: inviteEmail.value,
    githubLogin: inviteGithubLogin.value,
    selectedGithubLogin: selectedGithubCandidate.value,
    role: inviteRole.value,
  })
  if (!payload) {
    inviteError.value = 'Renseignez un email ou un pseudo GitHub.'
    inviteSuccess.value = null
    invitationLink.value = null
    return
  }

  submittingInvitation.value = true
  inviteSuccess.value = null
  inviteError.value = null
  invitationLink.value = null

  try {
    const response = await $fetch<WorkspaceInvitationResponse>('/api/workspaces/invitations', {
      method: 'POST',
      body: payload,
    })

    const invitationId = extractInvitationIdFromInviteMemberResponse(response)
    if (!invitationId) {
      inviteError.value = 'Invitation créée, mais le lien n’est pas disponible.'
      return
    }

    const link = buildAcceptInvitationUrl(invitationId)
    invitationLink.value = link

    inviteEmail.value = ''
    inviteGithubLogin.value = ''
    selectedGithubCandidate.value = ''
    inviteRole.value = 'read'
    const successMessage = payload.githubLogin
      ? `Invitation pour @${payload.githubLogin} prête (lien copiable).`
      : 'Invitation prête (lien copiable).'
    await loadWorkspaceData(true)
    inviteSuccess.value = successMessage
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    inviteError.value = asRecordError.data?.message || asRecordError.message || 'Invitation impossible.'
  } finally {
    submittingInvitation.value = false
  }
}

async function copyInvitationLink() {
  if (!invitationLink.value)
    return

  copyingInvitationLink.value = true
  try {
    await navigator.clipboard.writeText(invitationLink.value)
    inviteSuccess.value = 'Lien copié dans le presse-papiers.'
  } catch (error) {
    const asRecordError = error as { message?: string }
    inviteError.value = asRecordError.message || 'Impossible de copier le lien.'
  } finally {
    copyingInvitationLink.value = false
  }
}

await loadWorkspaceData()
</script>

<template>
  <main class="md3-page max-w-3xl">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="md3-display-sm">
          Paramètres du workspace
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          {{ organizationName }}
        </p>
      </div>
      <FluffmindButton variant="tonal" size="sm" :disabled="loading || reloading" @click="loadWorkspaceData(true)">
        {{ reloading ? 'Actualisation…' : 'Actualiser' }}
      </FluffmindButton>
    </header>

    <FluffmindCard v-if="pageError" padding="md" variant="outlined" class="mb-6">
      <p class="md3-body-md text-error">
        {{ pageError }}
      </p>
    </FluffmindCard>

    <FluffmindCard padding="lg" class="mb-6">
      <h2 class="mb-4 md3-title-md">
        Inviter un membre
      </h2>
      <form class="grid gap-4 md:grid-cols-2" @submit.prevent="inviteMember">
        <label class="block">
          <span class="mb-2 block md3-label-lg">Membre GitHub</span>
          <FluffmindSelect
            v-model="selectedGithubCandidate"
            :options="githubInviteCandidateOptions"
            placeholder="Choisir un membre GitHub"
            :disabled="githubInviteCandidateOptions.length === 0"
          />
        </label>
        <label class="block">
          <span class="mb-2 block md3-label-lg">Pseudo GitHub</span>
          <FluffmindTextField
            v-model="inviteGithubLogin"
            type="text"
            placeholder="octocat"
          />
        </label>
        <label class="block">
          <span class="mb-2 block md3-label-lg">Email (optionnel si GitHub est renseigné)</span>
          <FluffmindTextField
            v-model="inviteEmail"
            type="email"
            placeholder="membre@exemple.com"
          />
        </label>
        <label class="block">
          <span class="mb-2 block md3-label-lg">Rôle</span>
          <FluffmindSelect
            v-model="inviteRole"
            :options="roleOptions"
          />
        </label>
        <div class="flex items-end md:col-span-2">
          <FluffmindButton type="submit" class="w-full" :disabled="submittingInvitation">
            {{ submittingInvitation ? 'Envoi…' : 'Inviter' }}
          </FluffmindButton>
        </div>
      </form>
      <p v-if="inviteSuccess" class="mt-4 md3-body-md text-tertiary">
        {{ inviteSuccess }}
      </p>
      <div v-if="invitationLink" class="mt-4">
        <p class="md3-body-md text-on-surface-variant">
          Lien d’invitation :
        </p>
        <code class="block break-all text-primary">
          {{ invitationLink }}
        </code>
        <FluffmindButton
          variant="outlined"
          size="sm"
          class="mt-2"
          :disabled="copyingInvitationLink"
          @click="copyInvitationLink"
        >
          {{ copyingInvitationLink ? 'Copie…' : 'Copier le lien' }}
        </FluffmindButton>
      </div>
      <p v-if="inviteError" class="mt-4 md3-body-md text-error">
        {{ inviteError }}
      </p>
    </FluffmindCard>

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
              :disabled="syncingGitHub || !githubLinked || !canManageGitHub"
              @click="syncNowFromGitHub"
            >
              {{ syncingGitHub ? 'Synchro…' : 'Synchroniser maintenant' }}
            </FluffmindButton>
            <FluffmindButton
              variant="outlined"
              :disabled="unlinkingGitHub || !canManageGitHub"
              @click="unlinkGitHubSync"
            >
              {{ unlinkingGitHub ? 'Déliaison…' : 'Délier la synchronisation' }}
            </FluffmindButton>
          </div>
        </section>
      </template>

      <!-- Chooser when local -->
      <template v-else>
        <div class="mb-4 flex flex-wrap gap-2">
          <FluffmindButton
            v-if="githubAppConfigured"
            :variant="githubSetupChoice === 'app' ? 'filled' : 'outlined'"
            size="sm"
            :disabled="!canManageGitHub"
            @click="selectSyncSetup('app')"
          >
            GitHub App
          </FluffmindButton>
          <FluffmindButton
            :variant="githubSetupChoice === 'pat' ? 'filled' : 'outlined'"
            size="sm"
            :disabled="!canManageGitHub"
            @click="selectSyncSetup('pat')"
          >
            PAT
          </FluffmindButton>
          <FluffmindButton
            :variant="githubSetupChoice === 'local' ? 'filled' : 'outlined'"
            size="sm"
            :disabled="!canManageGitHub"
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
                :disabled="!canManageGitHub || !githubAppInstallUrl"
                @click="openGitHubAppInstallUrl"
              >
                Installer l’application
              </FluffmindButton>
              <FluffmindButton
                variant="outlined"
                size="sm"
                :disabled="loadingGitHubInstallations || !canManageGitHub"
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
                :disabled="loadingGitHubInstallations || !canManageGitHub"
                @update:model-value="selectGitHubInstallation"
              />
            </label>
            <label class="block">
              <span class="mb-2 block md3-label-lg">Dépôt</span>
              <FluffmindSelect
                v-model="githubAppRepository"
                :options="githubRepositoryOptions"
                placeholder="Choisir un dépôt"
                :disabled="!githubInstallationId || loadingGitHubRepositories || !canManageGitHub"
              />
            </label>
          </div>
          <p v-if="githubInstallationId && !loadingGitHubRepositories && githubInstallationRepositories.length === 0" class="mt-4 md3-body-md text-on-surface-variant">
            Aucun dépôt disponible pour cette installation.
          </p>
          <FluffmindButton
            class="mt-4"
            :disabled="linkingGitHub || !githubInstallationId || !githubAppRepository || !canManageGitHub"
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
                  :disabled="loadingGitHubInstallations || !canManageGitHub"
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
              :disabled="creatingGithubRepo || !githubInstallationId || !canManageGitHub"
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
          <FluffmindButton class="mt-4" :disabled="linkingGitHub || !canManageGitHub" @click="linkGitHubRepository">
            {{ linkingGitHub ? 'Liaison…' : 'Lier avec le PAT' }}
          </FluffmindButton>
        </section>
      </template>

      <p v-if="!canManageGitHub" class="mt-4 md3-body-md text-on-surface-variant">
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

    <FluffmindCard padding="lg" class="mb-6">
      <h2 class="mb-4 md3-title-md">
        Membres
      </h2>
      <div v-if="loading" class="md3-body-md text-on-surface-variant">
        Chargement des membres…
      </div>
      <ul v-else class="divide-y divide-outline-variant">
        <li v-for="workspaceMember in members" :key="workspaceMember.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p class="md3-title-sm">
              {{ workspaceMember.name }}
            </p>
            <p class="md3-body-md text-on-surface-variant">
              {{ workspaceMember.email }}
            </p>
          </div>
          <div class="text-right md3-body-md text-on-surface-variant">
            <FluffmindChip class="uppercase">
              {{ workspaceMember.role }}
            </FluffmindChip>
            <p class="mt-1">
              Ajouté le {{ formatDate(workspaceMember.createdAt) }}
            </p>
          </div>
          <FluffmindCheckbox
            :model-value="localOverrides[workspaceMember.id] ?? false"
            :disabled="!canManageGitHub"
            @update:model-value="setLocalOverride(workspaceMember.id, $event)"
          >
            Priorité locale
          </FluffmindCheckbox>
        </li>
      </ul>
      <p v-if="!loading && members.length === 0" class="md3-body-md text-on-surface-variant">
        Aucun membre trouvé.
      </p>
    </FluffmindCard>

    <FluffmindCard padding="lg">
      <h2 class="mb-4 md3-title-md">
        Invitations en attente
      </h2>
      <ul v-if="invitations.length > 0" class="divide-y divide-outline-variant">
        <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p class="md3-title-sm">
              {{ formatInvitationRecipient(invitation) }}
            </p>
            <p class="md3-body-md text-on-surface-variant">
              Expire le {{ formatDate(invitation.expiresAt) }}
            </p>
          </div>
          <FluffmindChip variant="outlined">
            {{ invitation.role }} · {{ invitation.status }}
          </FluffmindChip>
        </li>
      </ul>
      <p v-else class="md3-body-md text-on-surface-variant">
        Aucune invitation en attente.
      </p>
    </FluffmindCard>
  </main>
</template>
