<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
} from '@fluffmind/design-system/src/components'
import { useAdminWorkspaceDanger } from '../../composables/useAdminWorkspaceDanger'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  disabledAt: string | null
}

interface AdminWorkspaceRow {
  organizationId: string
  name: string
  slug: string
  vaultPath: string
  vaultExists: boolean
  gitRemoteUrl: string | null
  gitBranch: string
  contentRoots: string[]
  githubLinked: boolean
  githubOwner: string | null
  githubRepo: string | null
  ahead: number | null
  behind: number | null
}

interface WorkspaceMemberRow {
  memberId: string
  userId: string
  email: string
  name: string
  role: string
}

interface AdminWorkspaceMembersGroup {
  organizationId: string
  name: string
  slug: string
  members: WorkspaceMemberRow[]
}

interface AdminGithubLinkedWorkspace {
  organizationId: string
  name: string
  slug: string
  owner: string
  repo: string
}

interface AdminGithubInstallationRow {
  id: string
  installationId: string
  accountLogin: string
  accountType: string
  createdAt: string
  updatedAt: string
  linkedWorkspaces: AdminGithubLinkedWorkspace[]
}

interface AdminGithubBundle {
  appStatus: {
    configured: boolean
    slugConfigured: boolean
    webhookSecretConfigured: boolean
    oauthLoginConfigured: boolean
    requiredOk: boolean
    recommendedOk: boolean
    permissionsError: string | null
  }
  installations: AdminGithubInstallationRow[]
  installUrl: string | null
}

const usersLoading = ref(true)
const workspacesLoading = ref(true)
const membersLoading = ref(true)
const githubLoading = ref(true)
const usersError = ref<string | null>(null)
const workspacesError = ref<string | null>(null)
const membersError = ref<string | null>(null)
const githubError = ref<string | null>(null)
const githubActionError = ref<string | null>(null)
const users = ref<AdminUser[]>([])
const workspaces = ref<AdminWorkspaceRow[]>([])
const memberGroups = ref<AdminWorkspaceMembersGroup[]>([])
const orphans = ref<string[]>([])
const githubBundle = ref<AdminGithubBundle | null>(null)

function extractErrorMessage(error: unknown, fallback: string): string {
  const asRecordError = error as { data?: { message?: string }, message?: string }
  return asRecordError.data?.message || asRecordError.message || fallback
}

const {
  actionError: workspaceActionError,
  confirmAction,
  onConfirmAction,
  promptDialog,
  onPromptConfirm,
  resetHard,
  invalidateIndex,
  unlinkGithub,
  deleteWorkspace,
  rebindOrphan,
} = useAdminWorkspaceDanger({
  onAfterMutation: () => {
    void loadWorkspaces()
    void loadMembers()
  },
})

type GithubPendingAction =
  | { kind: 'unlink-all', installation: AdminGithubInstallationRow }
  | { kind: 'remove-db', installation: AdminGithubInstallationRow }

const githubPendingAction = ref<GithubPendingAction | null>(null)
const githubConfirmOpen = computed({
  get: () => githubPendingAction.value !== null,
  set: (open: boolean) => {
    if (!open)
      githubPendingAction.value = null
  },
})

const githubConfirmValue = computed(
  () => githubPendingAction.value?.installation.installationId ?? '',
)

const githubConfirmTitle = computed(() => {
  if (!githubPendingAction.value)
    return ''
  return githubPendingAction.value.kind === 'unlink-all'
    ? 'Unlink tous les workspaces'
    : 'Retirer l\'installation de la DB'
})

const githubConfirmDescription = computed(() => {
  const pending = githubPendingAction.value
  if (!pending)
    return ''
  const label = pending.kind === 'unlink-all'
    ? 'Unlink tous les workspaces de cette installation ?'
    : 'Retirer cette installation de la base de données ?'
  return `${label} Tapez « ${pending.installation.installationId} » pour confirmer.`
})

const githubConfirmInputLabel = computed(() => {
  const id = githubConfirmValue.value
  return id ? `Tapez « ${id} »` : ''
})

async function loadUsers() {
  usersLoading.value = true
  usersError.value = null
  try {
    const response = await $fetch<{ users: AdminUser[] }>('/api/admin/users')
    users.value = response.users
  }
  catch (error) {
    usersError.value = extractErrorMessage(error, 'Impossible de charger les utilisateurs.')
  }
  finally {
    usersLoading.value = false
  }
}

async function loadWorkspaces() {
  workspacesLoading.value = true
  workspacesError.value = null
  try {
    const response = await $fetch<{ workspaces: AdminWorkspaceRow[], orphans: string[] }>('/api/admin/workspaces')
    workspaces.value = response.workspaces
    orphans.value = response.orphans
  }
  catch (error) {
    workspacesError.value = extractErrorMessage(error, 'Impossible de charger les workspaces.')
  }
  finally {
    workspacesLoading.value = false
  }
}

async function loadMembers() {
  membersLoading.value = true
  membersError.value = null
  try {
    const response = await $fetch<{ workspaces: AdminWorkspaceMembersGroup[] }>('/api/admin/workspace-members')
    memberGroups.value = response.workspaces
  }
  catch (error) {
    membersError.value = extractErrorMessage(error, 'Impossible de charger les membres des workspaces.')
  }
  finally {
    membersLoading.value = false
  }
}

async function loadGithub() {
  githubLoading.value = true
  githubError.value = null
  try {
    githubBundle.value = await $fetch<AdminGithubBundle>('/api/admin/github')
  }
  catch (error) {
    githubError.value = extractErrorMessage(error, 'Impossible de charger les installations GitHub.')
  }
  finally {
    githubLoading.value = false
  }
}

// Load client-side only: these admin endpoints require a session cookie, which a
// top-level SSR `$fetch` does not forward — that produced a guaranteed 401 on the server
// followed by a re-fetch on the client (double request + error flash). Loading refs
// default to true, so SSR and the initial client render both show the loading state.
onMounted(() => {
  void Promise.all([loadUsers(), loadWorkspaces(), loadMembers(), loadGithub()])
})

async function promoteOrDemote(user: AdminUser) {
  const nextRole = user.role === 'admin' ? 'owner' : 'admin'
  await $fetch(`/api/admin/users/${user.id}/role`, {
    method: 'POST',
    body: { role: nextRole },
  })
  await loadUsers()
}

async function setDisabled(user: AdminUser, disabled: boolean) {
  await $fetch(`/api/admin/users/${user.id}/disabled`, {
    method: 'POST',
    body: { disabled },
  })
  await loadUsers()
}

async function revokeSessions(user: AdminUser) {
  await $fetch(`/api/admin/users/${user.id}/sessions/revoke`, {
    method: 'POST',
  })
  await loadUsers()
}

async function runGithubMutation(
  path: string,
  options: { method: 'POST' | 'DELETE', body?: Record<string, unknown> },
) {
  githubActionError.value = null
  try {
    await $fetch(path, options)
    await loadGithub()
  }
  catch (error) {
    githubActionError.value = extractErrorMessage(error, 'Action impossible.')
  }
}

async function resyncInstallation(installation: AdminGithubInstallationRow) {
  await runGithubMutation(
    `/api/admin/github/installations/${installation.installationId}/resync`,
    { method: 'POST' },
  )
}

function unlinkAllWorkspaces(installation: AdminGithubInstallationRow) {
  githubActionError.value = null
  githubPendingAction.value = { kind: 'unlink-all', installation }
}

function removeInstallationFromDb(installation: AdminGithubInstallationRow) {
  githubActionError.value = null
  githubPendingAction.value = { kind: 'remove-db', installation }
}

async function onGithubConfirmAction() {
  const pending = githubPendingAction.value
  githubPendingAction.value = null
  if (!pending)
    return

  const confirmInstallationId = pending.installation.installationId
  if (pending.kind === 'unlink-all') {
    await runGithubMutation(
      `/api/admin/github/installations/${pending.installation.installationId}/unlink-workspaces`,
      { method: 'POST', body: { confirmInstallationId } },
    )
    return
  }

  await runGithubMutation(
    `/api/admin/github/installations/${pending.installation.installationId}`,
    { method: 'DELETE', body: { confirmInstallationId } },
  )
}
</script>

<template>
  <main class="md3-page max-w-4xl">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="md3-display-sm">
          Administration
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Gestion des comptes, des sessions, des workspaces et des installations GitHub App.
        </p>
      </div>
    </header>

    <FluffmindCard padding="lg" variant="outlined" class="mb-6">
      <h2 class="md3-title-md mb-1">
        Membres des workspaces
      </h2>
      <p class="mb-4 md3-body-md text-on-surface-variant">
        Vue d'ensemble en lecture seule. Pour inviter, modifier ou retirer des membres, ouvrez la console du workspace.
      </p>

      <FluffmindCard v-if="membersError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ membersError }}
        </p>
      </FluffmindCard>

      <template v-if="membersLoading">
        <p class="md3-body-md text-on-surface-variant">
          Chargement des membres…
        </p>
      </template>

      <template v-else-if="!membersError">
        <p
          v-if="!memberGroups.length"
          class="md3-body-md text-on-surface-variant"
        >
          Aucun workspace.
        </p>

        <ul v-else class="divide-y divide-outline-variant">
          <li
            v-for="group in memberGroups"
            :key="group.organizationId"
            class="py-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p class="md3-title-sm">
                  {{ group.name }}
                  <span class="text-on-surface-variant">({{ group.slug }})</span>
                </p>

                <p
                  v-if="!group.members.length"
                  class="mt-2 md3-body-sm text-on-surface-variant"
                >
                  Aucun membre.
                </p>
                <ul v-else class="mt-2 space-y-1">
                  <li
                    v-for="member in group.members"
                    :key="member.memberId"
                    class="md3-body-md"
                  >
                    {{ member.email }}
                    <FluffmindChip class="ml-2 uppercase">
                      {{ member.role }}
                    </FluffmindChip>
                  </li>
                </ul>
              </div>

              <NuxtLink
                :to="`/settings/admin/workspaces/${group.organizationId}`"
                class="md3-body-md text-primary underline"
              >
                Gérer dans la console
              </NuxtLink>
            </div>
          </li>
        </ul>
      </template>
    </FluffmindCard>

    <FluffmindCard padding="lg" class="mb-6">
      <h2 class="md3-title-md mb-4">
        Utilisateurs
      </h2>

      <FluffmindCard v-if="usersError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ usersError }}
        </p>
      </FluffmindCard>

      <template v-if="usersLoading">
        <p class="md3-body-md text-on-surface-variant">
          Chargement des utilisateurs…
        </p>
      </template>

      <template v-else-if="!usersError">
        <ul class="divide-y divide-outline-variant">
          <li v-for="user in users" :key="user.id" class="py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="md3-title-sm">
                  {{ user.name }} <span class="text-on-surface-variant">({{ user.email }})</span>
                </p>
                <p class="md3-body-md text-on-surface-variant break-all">
                  {{ user.id }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <FluffmindChip class="uppercase">
                    {{ user.role }}
                  </FluffmindChip>
                  <FluffmindChip v-if="user.disabledAt" variant="outlined">
                    disabled
                  </FluffmindChip>
                  <FluffmindChip v-else variant="outlined">
                    enabled
                  </FluffmindChip>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <FluffmindButton variant="outlined" size="sm" @click="promoteOrDemote(user)">
                  {{ user.role === 'admin' ? 'Rétrograder admin' : 'Promouvoir admin' }}
                </FluffmindButton>
                <FluffmindButton
                  variant="outlined"
                  size="sm"
                  @click="setDisabled(user, !user.disabledAt)"
                >
                  {{ user.disabledAt ? 'Réactiver compte' : 'Désactiver compte' }}
                </FluffmindButton>
                <FluffmindButton variant="tonal" size="sm" @click="revokeSessions(user)">
                  Révoquer sessions
                </FluffmindButton>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </FluffmindCard>

    <FluffmindCard padding="lg" variant="outlined" class="mb-6">
      <h2 class="md3-title-md mb-1">
        Workspaces — zone dangereuse
      </h2>
      <p class="mb-4 md3-body-md text-on-surface-variant">
        Opérations destructives réservées aux administrateurs instance.
      </p>

      <FluffmindCard v-if="workspaceActionError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ workspaceActionError }}
        </p>
      </FluffmindCard>

      <FluffmindCard v-if="workspacesError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ workspacesError }}
        </p>
      </FluffmindCard>

      <template v-if="workspacesLoading">
        <p class="md3-body-md text-on-surface-variant">
          Chargement des workspaces…
        </p>
      </template>

      <template v-else-if="!workspacesError">
        <ul class="divide-y divide-outline-variant">
          <li v-for="workspace in workspaces" :key="workspace.organizationId" class="py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p class="md3-title-sm">
                  <NuxtLink
                    :to="`/settings/admin/workspaces/${workspace.organizationId}`"
                    class="text-primary underline"
                  >
                    {{ workspace.name }}
                    <span class="text-on-surface-variant">({{ workspace.slug }})</span>
                  </NuxtLink>
                </p>
                <p class="md3-body-md text-on-surface-variant break-all">
                  {{ workspace.organizationId }}
                </p>
                <p class="mt-1 md3-body-sm text-on-surface-variant break-all">
                  {{ workspace.vaultPath }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <FluffmindChip :variant="workspace.vaultExists ? 'filled' : 'outlined'">
                    {{ workspace.vaultExists ? 'Vault présent' : 'Vault absent' }}
                  </FluffmindChip>
                  <FluffmindChip v-if="workspace.githubLinked" variant="outlined">
                    GitHub : {{ workspace.githubOwner }}/{{ workspace.githubRepo }}
                  </FluffmindChip>
                  <FluffmindChip v-else variant="outlined">
                    GitHub non lié
                  </FluffmindChip>
                  <FluffmindChip v-if="workspace.contentRoots.length" variant="outlined">
                    Racines : {{ workspace.contentRoots.join(', ') }}
                  </FluffmindChip>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <FluffmindButton
                  v-if="workspace.gitRemoteUrl"
                  variant="outlined"
                  size="sm"
                  @click="resetHard(workspace)"
                >
                  Réinitialiser sur origin
                </FluffmindButton>
                <FluffmindButton variant="outlined" size="sm" @click="invalidateIndex(workspace)">
                  Invalider l'index
                </FluffmindButton>
                <FluffmindButton
                  v-if="workspace.githubLinked"
                  variant="outlined"
                  size="sm"
                  @click="unlinkGithub(workspace)"
                >
                  Forcer unlink GitHub
                </FluffmindButton>
                <FluffmindButton variant="tonal" size="sm" @click="deleteWorkspace(workspace)">
                  Supprimer le workspace
                </FluffmindButton>
              </div>
            </div>
          </li>
        </ul>

        <section v-if="orphans.length" class="mt-6 border-t border-outline-variant pt-4">
          <h3 class="md3-title-sm mb-2">
            Dossiers orphelins
          </h3>
          <p class="mb-3 md3-body-sm text-on-surface-variant">
            Dossiers sous WORKSPACES_ROOT sans organisation correspondante.
          </p>
          <ul class="divide-y divide-outline-variant">
            <li v-for="folder in orphans" :key="folder" class="flex flex-wrap items-center justify-between gap-4 py-3">
              <p class="md3-body-md font-mono">
                {{ folder }}
              </p>
              <FluffmindButton variant="outlined" size="sm" @click="rebindOrphan(folder)">
                Réassocier
              </FluffmindButton>
            </li>
          </ul>
        </section>
      </template>
    </FluffmindCard>

    <FluffmindCard padding="lg" variant="outlined">
      <h2 class="md3-title-md mb-1">
        GitHub App
      </h2>
      <p class="mb-4 md3-body-md text-on-surface-variant">
        Inventaire des installations et actions de récupération (resync, unlink-all, retrait DB).
      </p>

      <FluffmindCard v-if="githubActionError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ githubActionError }}
        </p>
      </FluffmindCard>

      <FluffmindCard v-if="githubError" padding="md" variant="outlined" class="mb-4">
        <p class="md3-body-md text-error">
          {{ githubError }}
        </p>
      </FluffmindCard>

      <template v-if="githubLoading">
        <p class="md3-body-md text-on-surface-variant">
          Chargement des installations GitHub…
        </p>
      </template>

      <template v-else-if="!githubError && githubBundle">
        <section class="mb-6">
          <h3 class="md3-title-sm mb-2">
            Statut de l'App
          </h3>
          <div class="flex flex-wrap items-center gap-2">
            <FluffmindChip :variant="githubBundle.appStatus.configured ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.configured ? 'App configurée' : 'App non configurée' }}
            </FluffmindChip>
            <FluffmindChip :variant="githubBundle.appStatus.slugConfigured ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.slugConfigured ? 'Slug OK' : 'Slug manquant' }}
            </FluffmindChip>
            <FluffmindChip :variant="githubBundle.appStatus.webhookSecretConfigured ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.webhookSecretConfigured ? 'Webhook OK' : 'Webhook manquant' }}
            </FluffmindChip>
            <FluffmindChip :variant="githubBundle.appStatus.oauthLoginConfigured ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.oauthLoginConfigured ? 'OAuth login OK' : 'OAuth login manquant' }}
            </FluffmindChip>
            <FluffmindChip :variant="githubBundle.appStatus.requiredOk ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.requiredOk ? 'Permissions requises OK' : 'Permissions requises KO' }}
            </FluffmindChip>
            <FluffmindChip :variant="githubBundle.appStatus.recommendedOk ? 'filled' : 'outlined'">
              {{ githubBundle.appStatus.recommendedOk ? 'Permissions recommandées OK' : 'Permissions recommandées KO' }}
            </FluffmindChip>
          </div>
          <p v-if="githubBundle.appStatus.permissionsError" class="mt-2 md3-body-sm text-error">
            {{ githubBundle.appStatus.permissionsError }}
          </p>
          <p v-if="githubBundle.installUrl" class="mt-3">
            <a
              :href="githubBundle.installUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="md3-body-md text-primary underline"
            >
              Installer l'App
            </a>
          </p>
        </section>

        <section>
          <h3 class="md3-title-sm mb-2">
            Installations
          </h3>

          <p
            v-if="!githubBundle.installations.length"
            class="md3-body-md text-on-surface-variant"
          >
            Aucune installation enregistrée en base.
          </p>

          <ul v-else class="divide-y divide-outline-variant">
            <li
              v-for="installation in githubBundle.installations"
              :key="installation.id"
              class="py-4"
            >
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="md3-title-sm">
                    {{ installation.accountLogin }}
                    <span class="text-on-surface-variant">({{ installation.accountType }})</span>
                  </p>
                  <p class="md3-body-md text-on-surface-variant break-all">
                    installationId : {{ installation.installationId }}
                  </p>
                  <p class="md3-body-sm text-on-surface-variant">
                    Créée {{ installation.createdAt }} · Mise à jour {{ installation.updatedAt }}
                  </p>

                  <div v-if="installation.linkedWorkspaces.length" class="mt-3">
                    <p class="md3-label-md text-on-surface-variant mb-1">
                      Workspaces liés
                    </p>
                    <ul class="divide-y divide-outline-variant rounded-lg border border-outline-variant">
                      <li
                        v-for="ws in installation.linkedWorkspaces"
                        :key="ws.organizationId"
                        class="px-3 py-2"
                      >
                        <p class="md3-body-md">
                          {{ ws.name }}
                          <span class="text-on-surface-variant">({{ ws.slug }})</span>
                        </p>
                        <p class="md3-body-sm text-on-surface-variant break-all">
                          {{ ws.organizationId }} · {{ ws.owner }}/{{ ws.repo }}
                        </p>
                      </li>
                    </ul>
                  </div>
                  <p v-else class="mt-2 md3-body-sm text-on-surface-variant">
                    Aucun workspace lié.
                  </p>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <FluffmindButton
                    variant="outlined"
                    size="sm"
                    @click="resyncInstallation(installation)"
                  >
                    Resynchroniser
                  </FluffmindButton>
                  <FluffmindButton
                    variant="outlined"
                    size="sm"
                    @click="unlinkAllWorkspaces(installation)"
                  >
                    Unlink tous les workspaces
                  </FluffmindButton>
                  <FluffmindButton
                    variant="tonal"
                    size="sm"
                    @click="removeInstallationFromDb(installation)"
                  >
                    Retirer de la DB
                  </FluffmindButton>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </FluffmindCard>

    <ConfirmActionDialog
      v-model:open="confirmAction.open"
      :title="confirmAction.title"
      :description="confirmAction.description"
      :confirm-value="confirmAction.confirmValue"
      :confirm-label="confirmAction.confirmLabel"
      :input-label="confirmAction.inputLabel"
      @confirm="onConfirmAction"
    />

    <PromptDialog
      v-model:open="promptDialog.open"
      :title="promptDialog.title"
      :description="promptDialog.description"
      :placeholder="promptDialog.placeholder"
      :confirm-label="promptDialog.confirmLabel"
      :initial-value="promptDialog.initialValue"
      @confirm="onPromptConfirm"
    />

    <ConfirmActionDialog
      v-model:open="githubConfirmOpen"
      :title="githubConfirmTitle"
      :description="githubConfirmDescription"
      :confirm-value="githubConfirmValue"
      :input-label="githubConfirmInputLabel"
      @confirm="onGithubConfirmAction"
    />
  </main>
</template>
