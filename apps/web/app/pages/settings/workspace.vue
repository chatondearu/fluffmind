<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
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

async function loadWorkspaceData(isManualReload = false) {
  if (isManualReload) reloading.value = true
  else loading.value = true

  pageError.value = null
  inviteSuccess.value = null

  try {
    const [fullOrganizationResponse, membersResponse, invitationsResponse] = await Promise.all([
      authClient.organization.getFullOrganization(),
      authClient.organization.listMembers({}),
      authClient.organization.listInvitations({}),
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

    const fullMembers = fullOrganization.members
    const fullInvitations = fullOrganization.invitations
    const fallbackMembers = extractData(membersResponse)
    const fallbackInvitations = extractData(invitationsResponse)

    members.value = normalizeMembers(Array.isArray(fullMembers) && fullMembers.length > 0 ? fullMembers : fallbackMembers)
    invitations.value = normalizeInvitations(Array.isArray(fullInvitations) ? fullInvitations : fallbackInvitations)
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
  <main class="mx-auto w-full max-w-3xl p-6">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-on-surface">
          Paramètres du workspace
        </h1>
        <p class="text-sm text-on-surface-variant">
          {{ organizationName }}
        </p>
      </div>
      <FluffmindButton variant="outlined" :disabled="loading || reloading" @click="loadWorkspaceData(true)">
        {{ reloading ? 'Actualisation…' : 'Actualiser' }}
      </FluffmindButton>
    </header>

    <p v-if="pageError" class="mb-4 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">
      {{ pageError }}
    </p>

    <section class="mb-6 rounded-lg border border-outline p-4">
      <h2 class="mb-3 text-lg font-medium text-on-surface">
        Inviter un membre
      </h2>
      <form class="grid gap-3 md:grid-cols-[1fr_auto_auto]" @submit.prevent="inviteMember">
        <label class="block">
          <span class="mb-1 block text-sm text-on-surface-variant">Email</span>
          <input
            v-model="inviteEmail"
            type="email"
            required
            placeholder="membre@exemple.com"
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-sm text-on-surface-variant">Rôle</span>
          <select
            v-model="inviteRole"
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
            <option v-for="option in roleOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <div class="flex items-end">
          <FluffmindButton type="submit" class="w-full" :disabled="submittingInvitation">
            {{ submittingInvitation ? 'Envoi…' : 'Inviter' }}
          </FluffmindButton>
        </div>
      </form>
      <p v-if="inviteSuccess" class="mt-3 text-sm text-tertiary">
        {{ inviteSuccess }}
      </p>
      <p v-if="inviteError" class="mt-3 text-sm text-error">
        {{ inviteError }}
      </p>
    </section>

    <section class="mb-6 rounded-lg border border-outline p-4">
      <h2 class="mb-3 text-lg font-medium text-on-surface">
        Membres
      </h2>
      <div v-if="loading" class="text-sm text-on-surface-variant">
        Chargement des membres…
      </div>
      <ul v-else class="divide-y divide-outline-variant">
        <li v-for="workspaceMember in members" :key="workspaceMember.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p class="font-medium text-on-surface">
              {{ workspaceMember.name }}
            </p>
            <p class="text-sm text-on-surface-variant">
              {{ workspaceMember.email }}
            </p>
          </div>
          <div class="text-right text-sm text-on-surface-variant">
            <p class="font-medium uppercase tracking-wide text-primary">
              {{ workspaceMember.role }}
            </p>
            <p>Ajouté le {{ formatDate(workspaceMember.createdAt) }}</p>
          </div>
        </li>
      </ul>
      <p v-if="!loading && members.length === 0" class="text-sm text-on-surface-variant">
        Aucun membre trouvé.
      </p>
    </section>

    <section class="rounded-lg border border-outline p-4">
      <h2 class="mb-3 text-lg font-medium text-on-surface">
        Invitations en attente
      </h2>
      <ul v-if="invitations.length > 0" class="divide-y divide-outline-variant">
        <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p class="font-medium text-on-surface">
              {{ invitation.email }}
            </p>
            <p class="text-sm text-on-surface-variant">
              Expire le {{ formatDate(invitation.expiresAt) }}
            </p>
          </div>
          <span class="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {{ invitation.role }} · {{ invitation.status }}
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-on-surface-variant">
        Aucune invitation en attente.
      </p>
    </section>
  </main>
</template>
