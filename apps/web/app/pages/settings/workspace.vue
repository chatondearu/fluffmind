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
  status: string
  expiresAt: string | null
}

interface GitHubSyncState {
  linked: boolean
  owner: string | null
  repo: string | null
  lastSyncedAt: string | null
  localOverrides: Record<string, boolean>
}

const roleOptions: Array<{ value: WorkspaceRole, label: string }> = [
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
  { value: 'owner', label: 'Propriétaire' },
]

const organizationName = ref('Workspace')
const members = ref<WorkspaceMember[]>([])
const invitations = ref<WorkspaceInvitation[]>([])
const loading = ref(true)
const reloading = ref(false)
const submittingInvitation = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<WorkspaceRole>('read')
const pageError = ref<string | null>(null)
const inviteSuccess = ref<string | null>(null)
const inviteError = ref<string | null>(null)
const workspaceRole = ref<string>('read')
const githubRepository = ref('')
const githubToken = ref('')
const githubLinked = ref(false)
const githubLastSyncedAt = ref<string | null>(null)
const githubLinkError = ref<string | null>(null)
const githubLinkSuccess = ref<string | null>(null)
const githubSyncError = ref<string | null>(null)
const githubSyncSuccess = ref<string | null>(null)
const linkingGitHub = ref(false)
const syncingGitHub = ref(false)
const localOverrides = ref<Record<string, boolean>>({})

const canManageGitHub = computed(() => workspaceRole.value === 'owner')

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
  githubLastSyncedAt.value = typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null

  if (typeof state.owner === 'string' && typeof state.repo === 'string')
    githubRepository.value = `${state.owner}/${state.repo}`

  if (state.localOverrides && typeof state.localOverrides === 'object') {
    localOverrides.value = {
      ...localOverrides.value,
      ...state.localOverrides,
    }
    syncLocalOverrideModel()
  }
}

async function loadGitHubState(): Promise<void> {
  githubLinkError.value = null
  try {
    const response = await $fetch<GitHubSyncState>('/api/workspaces/github/sync', {
      method: 'POST',
      body: { run: false },
    })
    applyGitHubState(response)
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger l’état GitHub.'
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
        repository,
        syncToken,
      },
    })
    applyGitHubState(response)
    githubToken.value = ''
    githubLinkSuccess.value = 'Dépôt GitHub lié avec succès.'
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecordError.data?.message || asRecordError.message || 'Liaison GitHub impossible.'
  } finally {
    linkingGitHub.value = false
  }
}

function setLocalOverride(memberId: string, value: boolean): void {
  localOverrides.value = {
    ...localOverrides.value,
    [memberId]: value,
  }
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
    const [fullOrganizationResponse, membersResponse, invitationsResponse, activeWorkspace] = await Promise.all([
      authClient.organization.getFullOrganization(),
      authClient.organization.listMembers({}),
      authClient.organization.listInvitations({}),
      $fetch<{ member?: { role?: string | null } | null }>('/api/workspaces/active'),
    ])

    const fullOrganizationError = extractErrorMessage(fullOrganizationResponse, 'Impossible de charger le workspace.')
    const membersError = extractErrorMessage(membersResponse, 'Impossible de charger les membres.')
    const invitationsError = extractErrorMessage(invitationsResponse, 'Impossible de charger les invitations.')

    if (fullOrganizationError || membersError || invitationsError) {
      pageError.value = fullOrganizationError || membersError || invitationsError
      return
    }

    const fullOrganization = asRecord(extractData(fullOrganizationResponse))
    organizationName.value = asString(fullOrganization.name, 'Workspace')
    workspaceRole.value = asString(activeWorkspace.member?.role, 'read')

    const fullMembers = fullOrganization.members
    const fullInvitations = fullOrganization.invitations
    const fallbackMembers = extractData(membersResponse)
    const fallbackInvitations = extractData(invitationsResponse)

    members.value = normalizeMembers(Array.isArray(fullMembers) && fullMembers.length > 0 ? fullMembers : fallbackMembers)
    invitations.value = normalizeInvitations(Array.isArray(fullInvitations) ? fullInvitations : fallbackInvitations)
    syncLocalOverrideModel()
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
  const email = inviteEmail.value.trim().toLowerCase()
  if (!email) {
    inviteError.value = 'L’email est requis.'
    inviteSuccess.value = null
    return
  }

  submittingInvitation.value = true
  inviteSuccess.value = null
  inviteError.value = null

  try {
    const response = await authClient.organization.inviteMember({
      email,
      role: inviteRole.value,
    })

    const errorMessage = extractErrorMessage(response, 'Invitation impossible.')
    if (errorMessage) {
      inviteError.value = errorMessage
      return
    }

    inviteEmail.value = ''
    inviteRole.value = 'read'
    inviteSuccess.value = 'Invitation envoyée.'
    await loadWorkspaceData(true)
  } catch (error) {
    const asRecordError = error as { message?: string }
    inviteError.value = asRecordError.message || 'Invitation impossible.'
  } finally {
    submittingInvitation.value = false
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
      <form class="grid gap-4 md:grid-cols-[1fr_auto_auto]" @submit.prevent="inviteMember">
        <label class="block">
          <span class="mb-2 block md3-label-lg">Email</span>
          <FluffmindTextField
            v-model="inviteEmail"
            type="email"
            required
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
        <div class="flex items-end">
          <FluffmindButton type="submit" class="w-full" :disabled="submittingInvitation">
            {{ submittingInvitation ? 'Envoi…' : 'Inviter' }}
          </FluffmindButton>
        </div>
      </form>
      <p v-if="inviteSuccess" class="mt-4 md3-body-md text-tertiary">
        {{ inviteSuccess }}
      </p>
      <p v-if="inviteError" class="mt-4 md3-body-md text-error">
        {{ inviteError }}
      </p>
    </FluffmindCard>

    <FluffmindCard padding="lg" class="mb-6">
      <h2 class="mb-4 md3-title-md">
        Synchronisation GitHub
      </h2>
      <div class="grid gap-4 md:grid-cols-2">
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
      <p class="mt-4 md3-body-md text-on-surface-variant">
        Dernière synchro: {{ githubLastSyncedAt ? formatDate(githubLastSyncedAt) : 'Jamais' }}
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <FluffmindButton :disabled="linkingGitHub || !canManageGitHub" @click="linkGitHubRepository">
          {{ linkingGitHub ? 'Liaison…' : 'Lier le dépôt' }}
        </FluffmindButton>
        <FluffmindButton variant="outlined" :disabled="syncingGitHub || !githubLinked || !canManageGitHub" @click="syncNowFromGitHub">
          {{ syncingGitHub ? 'Synchro…' : 'Sync now' }}
        </FluffmindButton>
      </div>
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
            Override local
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
              {{ invitation.email }}
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
