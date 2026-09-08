<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
  FluffmindSelect,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import {
  buildAcceptInvitationUrl,
  buildWorkspaceInvitationPayload,
  extractInvitationIdFromInviteMemberResponse,
  formatInvitationRecipient,
  loadGithubInviteCandidates,
} from '../../utils/invitations'

type WorkspaceRole = 'read' | 'write' | 'owner'

interface WorkspaceMember {
  id: string
  role: string
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

const props = withDefaults(defineProps<{
  workspaceId: string
  canManage?: boolean
}>(), {
  canManage: true,
})

const roleOptions: Array<{ value: WorkspaceRole, label: string }> = [
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
  { value: 'owner', label: 'Propriétaire' },
]

const members = ref<WorkspaceMember[]>([])
const invitations = ref<WorkspaceInvitation[]>([])
const loading = ref(true)
const submittingInvitation = ref(false)
const inviteEmail = ref('')
const inviteGithubLogin = ref('')
const selectedGithubCandidate = ref('')
const githubInviteCandidates = ref<GitHubInviteCandidate[]>([])
const inviteRole = ref<WorkspaceRole>('read')
const invitationLink = ref<string | null>(null)
const copyingInvitationLink = ref(false)
const inviteSuccess = ref<string | null>(null)
const inviteError = ref<string | null>(null)
const sectionError = ref<string | null>(null)

const githubInviteCandidateOptions = computed(() => githubInviteCandidates.value.map(candidate => ({
  value: candidate.login,
  label: candidate.label,
})))

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

function normalizeInvitations(input: unknown): WorkspaceInvitation[] {
  if (!Array.isArray(input))
    return []
  return input.map((item, index) => {
    const invitation = asRecord(item)
    const invitationId = asString(invitation.id, `invitation-${index}`)
    const expiresAt = invitation.expiresAt
    return {
      id: invitationId,
      role: asString(invitation.role, 'read'),
      email: asString(invitation.email, '—'),
      githubLogin: typeof invitation.githubLogin === 'string' ? invitation.githubLogin : null,
      status: asString(invitation.status, 'pending'),
      expiresAt: typeof expiresAt === 'string'
        ? expiresAt
        : expiresAt instanceof Date
          ? expiresAt.toISOString()
          : null,
    }
  })
}

async function loadMembersData(): Promise<void> {
  loading.value = true
  sectionError.value = null
  inviteSuccess.value = null

  if (!props.canManage) {
    members.value = []
    invitations.value = []
    githubInviteCandidates.value = []
    loading.value = false
    return
  }

  try {
    const membersResponse = await $fetch<{ members: unknown[] }>('/api/workspaces/members', {
      query: { workspaceId: props.workspaceId },
    })
    members.value = normalizeMembers(membersResponse.members)

    const [pendingInvitations, candidates] = await Promise.all([
      $fetch<unknown[]>('/api/workspaces/invitations', {
        query: { workspaceId: props.workspaceId },
      }),
      loadGithubInviteCandidates(() =>
        $fetch<{ candidates?: Array<{ login?: string }> }>('/api/workspaces/github/invite-candidates', {
          query: { workspaceId: props.workspaceId },
        }),
      ),
    ])
    invitations.value = normalizeInvitations(pendingInvitations)
    githubInviteCandidates.value = candidates
  }
  catch (error) {
    const asRecordError = error as { message?: string, data?: { message?: string }, statusMessage?: string }
    sectionError.value = asRecordError.data?.message
      || asRecordError.message
      || asRecordError.statusMessage
      || 'Chargement des membres impossible.'
  }
  finally {
    loading.value = false
  }
}

async function inviteMember(): Promise<void> {
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
      body: {
        ...payload,
        workspaceId: props.workspaceId,
      },
    })

    const invitationId = extractInvitationIdFromInviteMemberResponse(response)
    if (!invitationId) {
      inviteError.value = 'Invitation créée, mais le lien n’est pas disponible.'
      return
    }

    invitationLink.value = buildAcceptInvitationUrl(invitationId)
    inviteEmail.value = ''
    inviteGithubLogin.value = ''
    selectedGithubCandidate.value = ''
    inviteRole.value = 'read'
    const successMessage = payload.githubLogin
      ? `Invitation pour @${payload.githubLogin} prête (lien copiable).`
      : 'Invitation prête (lien copiable).'
    await loadMembersData()
    inviteSuccess.value = successMessage
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    inviteError.value = asRecordError.data?.message || asRecordError.message || 'Invitation impossible.'
  }
  finally {
    submittingInvitation.value = false
  }
}

async function copyInvitationLink(): Promise<void> {
  if (!invitationLink.value)
    return

  copyingInvitationLink.value = true
  try {
    await navigator.clipboard.writeText(invitationLink.value)
    inviteSuccess.value = 'Lien copié dans le presse-papiers.'
  }
  catch (error) {
    const asRecordError = error as { message?: string }
    inviteError.value = asRecordError.message || 'Impossible de copier le lien.'
  }
  finally {
    copyingInvitationLink.value = false
  }
}

watch(() => props.workspaceId, () => {
  void loadMembersData()
}, { immediate: true })
</script>

<template>
  <div>
    <FluffmindCard v-if="canManage" padding="lg" class="mb-6">
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
          <span v-if="githubInviteCandidateOptions.length === 0" class="mt-2 block md3-body-sm text-on-surface-variant">
            Liste GitHub indisponible ou vide. Saisissez un pseudo ci-dessous.
          </span>
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
      <h2 class="mb-4 md3-title-md">
        Membres
      </h2>
      <p v-if="!canManage" class="md3-body-md text-on-surface-variant">
        Seuls les propriétaires peuvent consulter et gérer les membres du workspace.
      </p>
      <template v-else>
        <p v-if="sectionError" class="mb-4 md3-body-md text-error">
          {{ sectionError }}
        </p>
        <div v-if="loading" class="md3-body-md text-on-surface-variant">
          Chargement des membres…
        </div>
        <ul v-else class="divide-y divide-outline-variant">
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
                {{ workspaceMember.email }}
              </p>
            </div>
            <div class="text-right md3-body-md text-on-surface-variant">
              <FluffmindChip class="uppercase">
                {{ workspaceMember.role }}
              </FluffmindChip>
            </div>
          </li>
        </ul>
        <p v-if="!loading && members.length === 0" class="md3-body-md text-on-surface-variant">
          Aucun membre trouvé.
        </p>
      </template>
    </FluffmindCard>

    <FluffmindCard v-if="canManage" padding="lg" class="mb-6">
      <h2 class="mb-4 md3-title-md">
        Invitations en attente
      </h2>
      <ul v-if="invitations.length > 0" class="divide-y divide-outline-variant">
        <li
          v-for="invitation in invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center justify-between gap-2 py-3"
        >
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
  </div>
</template>
