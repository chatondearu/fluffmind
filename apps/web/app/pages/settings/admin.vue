<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
} from '@fluffmind/design-system/src/components'

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
const githubLoading = ref(true)
const usersError = ref<string | null>(null)
const workspacesError = ref<string | null>(null)
const githubError = ref<string | null>(null)
const workspaceActionError = ref<string | null>(null)
const githubActionError = ref<string | null>(null)
const users = ref<AdminUser[]>([])
const workspaces = ref<AdminWorkspaceRow[]>([])
const orphans = ref<string[]>([])
const githubBundle = ref<AdminGithubBundle | null>(null)

function extractErrorMessage(error: unknown, fallback: string): string {
  const asRecordError = error as { data?: { message?: string }, message?: string }
  return asRecordError.data?.message || asRecordError.message || fallback
}

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

await Promise.all([loadUsers(), loadWorkspaces(), loadGithub()])

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

async function runWorkspaceMutation(
  path: string,
  options: { method: 'POST' | 'DELETE', body?: Record<string, unknown> },
) {
  workspaceActionError.value = null
  try {
    await $fetch(path, options)
    await loadWorkspaces()
  }
  catch (error) {
    workspaceActionError.value = extractErrorMessage(error, 'Action impossible.')
  }
}

function promptConfirmSlug(workspace: AdminWorkspaceRow, label: string): string | null {
  const typed = window.prompt(`${label}\n\nTapez « ${workspace.slug} » pour confirmer.`)
  if (typed === null)
    return null
  if (typed.trim() !== workspace.slug) {
    workspaceActionError.value = `Confirmation incorrecte : attendu « ${workspace.slug} ».`
    return null
  }
  return typed.trim()
}

async function resetHard(workspace: AdminWorkspaceRow) {
  const confirmSlug = promptConfirmSlug(workspace, 'Réinitialiser le workspace sur origin ?')
  if (!confirmSlug)
    return
  await runWorkspaceMutation(
    `/api/admin/workspaces/${workspace.organizationId}/reset-hard`,
    { method: 'POST', body: { confirmSlug } },
  )
}

async function invalidateIndex(workspace: AdminWorkspaceRow) {
  await runWorkspaceMutation(
    `/api/admin/workspaces/${workspace.organizationId}/invalidate-index`,
    { method: 'POST' },
  )
}

async function unlinkGithub(workspace: AdminWorkspaceRow) {
  await runWorkspaceMutation(
    `/api/admin/workspaces/${workspace.organizationId}/unlink-github`,
    { method: 'POST' },
  )
}

async function deleteWorkspace(workspace: AdminWorkspaceRow) {
  const confirmSlug = promptConfirmSlug(workspace, 'Supprimer définitivement ce workspace ?')
  if (!confirmSlug)
    return
  await runWorkspaceMutation(
    `/api/admin/workspaces/${workspace.organizationId}`,
    { method: 'DELETE', body: { confirmSlug } },
  )
}

async function rebindOrphan(folderName: string) {
  const organizationId = window.prompt(
    `Réassocier le dossier « ${folderName} » à une organisation.\n\nID de l'organisation cible :`,
  )
  if (!organizationId?.trim())
    return

  const typed = window.prompt(`Tapez « ${folderName} » pour confirmer la réassociation.`)
  if (typed === null)
    return
  if (typed.trim() !== folderName) {
    workspaceActionError.value = `Confirmation incorrecte : attendu « ${folderName} ».`
    return
  }

  await runWorkspaceMutation('/api/admin/workspaces/rebind', {
    method: 'POST',
    body: {
      organizationId: organizationId.trim(),
      folderName,
      confirmSlug: typed.trim(),
    },
  })
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

function promptConfirmInstallationId(
  installation: AdminGithubInstallationRow,
  label: string,
): string | null {
  const typed = window.prompt(
    `${label}\n\nTapez « ${installation.installationId} » pour confirmer.`,
  )
  if (typed === null)
    return null
  if (typed.trim() !== installation.installationId) {
    githubActionError.value = `Confirmation incorrecte : attendu « ${installation.installationId} ».`
    return null
  }
  return typed.trim()
}

async function resyncInstallation(installation: AdminGithubInstallationRow) {
  await runGithubMutation(
    `/api/admin/github/installations/${installation.installationId}/resync`,
    { method: 'POST' },
  )
}

async function unlinkAllWorkspaces(installation: AdminGithubInstallationRow) {
  const confirmInstallationId = promptConfirmInstallationId(
    installation,
    'Unlink tous les workspaces de cette installation ?',
  )
  if (!confirmInstallationId)
    return
  await runGithubMutation(
    `/api/admin/github/installations/${installation.installationId}/unlink-workspaces`,
    { method: 'POST', body: { confirmInstallationId } },
  )
}

async function removeInstallationFromDb(installation: AdminGithubInstallationRow) {
  const confirmInstallationId = promptConfirmInstallationId(
    installation,
    'Retirer cette installation de la base de données ?',
  )
  if (!confirmInstallationId)
    return
  await runGithubMutation(
    `/api/admin/github/installations/${installation.installationId}`,
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
                  {{ workspace.name }}
                  <span class="text-on-surface-variant">({{ workspace.slug }})</span>
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
  </main>
</template>
