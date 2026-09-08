<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
} from '@fluffmind/design-system/src/components'
import WorkspaceAgentSection from '../../components/settings/WorkspaceAgentSection.vue'
import WorkspaceGitHubSection from '../../components/settings/WorkspaceGitHubSection.vue'
import WorkspaceMembersSection from '../../components/settings/WorkspaceMembersSection.vue'
import { authClient } from '../../composables/useAuth'
import { ensureWorkspaceOnboarding } from '../../composables/useOnboarding'

interface ActiveWorkspaceResponse {
  workspaceId?: string
  member?: { role?: string | null } | null
  config?: { contentRoots?: string[] } | null
}

const organizationName = ref('Workspace')
const organizationSlug = ref('')
const activeWorkspaceId = ref('')
const loading = ref(true)
const reloading = ref(false)
const pageError = ref<string | null>(null)
const repairingSession = ref(false)
const workspaceRole = ref<string>('read')
const workspaceContentRoots = ref<string[]>([])
const sectionsReloadKey = ref(0)

const canManage = computed(() => workspaceRole.value === 'owner')
const sectionsKey = computed(() => `${activeWorkspaceId.value}:${sectionsReloadKey.value}`)

function extractErrorMessage(response: unknown, fallback: string): string | null {
  const error = (response as { error?: { message?: string | null } | null })?.error
  if (!error)
    return null
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

function isNoMembershipError(message: string | null | undefined): boolean {
  const lower = (message || '').toLowerCase()
  return lower.includes('not a member of any workspace')
    || lower.includes('no workspace membership')
}

function isStaleOrganizationError(message: string | null | undefined): boolean {
  return (message || '').toLowerCase().includes('organization not found')
}

const canRepairSession = computed(() =>
  isStaleOrganizationError(pageError.value) || isNoMembershipError(pageError.value),
)

const recoveryNeedsOnboarding = computed(() => isNoMembershipError(pageError.value))

async function repairSession(): Promise<void> {
  const needsOnboarding = recoveryNeedsOnboarding.value
  repairingSession.value = true
  pageError.value = null

  try {
    if (needsOnboarding) {
      await ensureWorkspaceOnboarding()
      await navigateTo('/')
      await refreshNuxtData()
      return
    }

    const result = await $fetch<{ workspaceId: string }>('/api/workspaces/repair-session', {
      method: 'POST',
    })

    const setActiveResponse = await authClient.organization.setActive({
      organizationId: result.workspaceId,
    })
    const setActiveError = extractErrorMessage(setActiveResponse, 'Impossible de réactiver le workspace.')
    if (setActiveError) {
      pageError.value = setActiveError
      return
    }

    await loadWorkspaceMeta(true)
  }
  catch (error) {
    const asRecordError = error as { message?: string, data?: { message?: string } }
    pageError.value = asRecordError.data?.message || asRecordError.message || 'Réparation de session impossible.'
  }
  finally {
    repairingSession.value = false
  }
}

async function loadWorkspaceMeta(isManualReload = false): Promise<void> {
  if (isManualReload)
    reloading.value = true
  else
    loading.value = true

  pageError.value = null

  try {
    const [fullOrganizationResponse, activeWorkspace] = await Promise.all([
      authClient.organization.getFullOrganization(),
      $fetch<ActiveWorkspaceResponse>('/api/workspaces/active'),
    ])

    const fullOrganizationError = extractErrorMessage(fullOrganizationResponse, 'Impossible de charger le workspace.')
    if (fullOrganizationError) {
      pageError.value = fullOrganizationError
      return
    }

    const fullOrganization = asRecord(extractData(fullOrganizationResponse))
    organizationName.value = asString(fullOrganization.name, 'Workspace')
    organizationSlug.value = asString(fullOrganization.slug)
    activeWorkspaceId.value = asString(activeWorkspace.workspaceId)
      || asString(fullOrganization.id)
    workspaceRole.value = asString(activeWorkspace.member?.role, 'read')
    workspaceContentRoots.value = Array.isArray(activeWorkspace.config?.contentRoots)
      ? activeWorkspace.config.contentRoots
      : []
    sectionsReloadKey.value += 1
  }
  catch (error) {
    const asRecordError = error as { message?: string, data?: { message?: string }, statusMessage?: string }
    pageError.value = asRecordError.data?.message
      || asRecordError.message
      || asRecordError.statusMessage
      || 'Chargement du workspace impossible.'
  }
  finally {
    loading.value = false
    reloading.value = false
  }
}

await loadWorkspaceMeta()
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
      <FluffmindButton variant="tonal" size="sm" :disabled="loading || reloading" @click="loadWorkspaceMeta(true)">
        {{ reloading ? 'Actualisation…' : 'Actualiser' }}
      </FluffmindButton>
    </header>

    <FluffmindCard v-if="pageError" padding="md" variant="outlined" class="mb-6">
      <p class="md3-body-md text-error">
        {{ pageError }}
      </p>
      <div v-if="canRepairSession" class="mt-3 flex flex-wrap items-center gap-3">
        <p class="md3-body-sm text-on-surface-variant">
          {{ recoveryNeedsOnboarding
            ? 'Aucun workspace n’est associé à ce compte. Vous pouvez en créer un automatiquement.'
            : 'La session pointe probablement vers un workspace supprimé.' }}
        </p>
        <FluffmindButton
          variant="tonal"
          size="sm"
          :disabled="repairingSession || loading || reloading"
          @click="repairSession"
        >
          {{ repairingSession
            ? (recoveryNeedsOnboarding ? 'Création…' : 'Réparation…')
            : (recoveryNeedsOnboarding ? 'Créer un workspace' : 'Réparer la session') }}
        </FluffmindButton>
      </div>
    </FluffmindCard>

    <p v-if="loading && !activeWorkspaceId" class="md3-body-md text-on-surface-variant">
      Chargement du workspace…
    </p>

    <template v-else-if="activeWorkspaceId">
      <WorkspaceMembersSection
        :key="`members-${sectionsKey}`"
        :workspace-id="activeWorkspaceId"
        :can-manage="canManage"
      />
      <WorkspaceAgentSection
        :key="`agent-${sectionsKey}`"
        :workspace-id="activeWorkspaceId"
        :can-manage="canManage"
      />
      <WorkspaceGitHubSection
        :key="`github-${sectionsKey}`"
        :workspace-id="activeWorkspaceId"
        :can-manage="canManage"
        :workspace-slug="organizationSlug"
        :content-roots="workspaceContentRoots"
      />
    </template>
  </main>
</template>
