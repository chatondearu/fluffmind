<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
} from '@fluffmind/design-system/src/components'
import WorkspaceAgentSection from '../../../../components/settings/WorkspaceAgentSection.vue'
import WorkspaceGitHubSection from '../../../../components/settings/WorkspaceGitHubSection.vue'
import WorkspaceMembersSection from '../../../../components/settings/WorkspaceMembersSection.vue'
import { useAdminWorkspaceDanger } from '../../../../composables/useAdminWorkspaceDanger'

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

const route = useRoute()
const workspaceId = computed(() => String(route.params.id || ''))

const loading = ref(true)
const pageError = ref<string | null>(null)
const workspace = ref<AdminWorkspaceRow | null>(null)
const membersReloadKey = ref(0)
const sectionsReloadKey = ref(0)

const membersSectionKey = computed(
  () => `${workspaceId.value}:${sectionsReloadKey.value}:${membersReloadKey.value}`,
)
const sectionsKey = computed(() => `${workspaceId.value}:${sectionsReloadKey.value}`)

function extractErrorMessage(error: unknown, fallback: string): string {
  const asRecordError = error as { data?: { message?: string }, message?: string, statusCode?: number }
  if (asRecordError.statusCode === 403)
    return 'Administration instance requise.'
  return asRecordError.data?.message || asRecordError.message || fallback
}

async function loadWorkspace(): Promise<void> {
  loading.value = true
  pageError.value = null
  try {
    const response = await $fetch<{ workspaces: AdminWorkspaceRow[] }>('/api/admin/workspaces')
    const found = response.workspaces.find(row => row.organizationId === workspaceId.value)
    if (!found) {
      workspace.value = null
      pageError.value = 'Workspace introuvable.'
      return
    }
    workspace.value = found
    sectionsReloadKey.value += 1
  }
  catch (error) {
    workspace.value = null
    pageError.value = extractErrorMessage(error, 'Impossible de charger le workspace.')
  }
  finally {
    loading.value = false
  }
}

const {
  actionError: workspaceActionError,
  resetHard,
  invalidateIndex,
  unlinkGithub,
  deleteWorkspace,
} = useAdminWorkspaceDanger({
  onAfterMutation: loadWorkspace,
  onDeleted: async () => {
    await navigateTo('/settings/admin')
  },
})

function onMembersChanged(): void {
  membersReloadKey.value += 1
}

// Same pattern as admin.vue: session cookie is not forwarded on SSR $fetch.
onMounted(() => {
  void loadWorkspace()
})
</script>

<template>
  <main class="md3-page max-w-3xl">
    <header class="mb-8">
      <p class="mb-3">
        <NuxtLink to="/settings/admin" class="md3-body-md text-primary underline">
          ← Administration
        </NuxtLink>
      </p>
      <template v-if="workspace">
        <h1 class="md3-display-sm">
          {{ workspace.name }}
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          {{ workspace.slug }}
          <span class="mx-1">·</span>
          <span class="break-all">{{ workspace.organizationId }}</span>
        </p>
      </template>
      <template v-else>
        <h1 class="md3-display-sm">
          Console workspace
        </h1>
      </template>
    </header>

    <FluffmindCard v-if="pageError" padding="md" variant="outlined" class="mb-6">
      <p class="md3-body-md text-error">
        {{ pageError }}
      </p>
    </FluffmindCard>

    <p v-if="loading" class="md3-body-md text-on-surface-variant">
      Chargement du workspace…
    </p>

    <template v-else-if="workspace">
      <div class="mb-6 flex flex-wrap items-center gap-2">
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

      <WorkspaceMembersSection
        :key="`members-${membersSectionKey}`"
        :workspace-id="workspaceId"
        :can-manage="true"
      />
      <WorkspaceAgentSection
        :key="`agent-${sectionsKey}`"
        :workspace-id="workspaceId"
        :can-manage="true"
      />
      <WorkspaceGitHubSection
        :key="`github-${sectionsKey}`"
        :workspace-id="workspaceId"
        :can-manage="true"
        :workspace-slug="workspace.slug"
        :content-roots="workspace.contentRoots"
        @members-changed="onMembersChanged"
      />

      <FluffmindCard padding="lg" variant="outlined" class="mt-6">
        <h2 class="md3-title-md mb-1">
          Zone dangereuse
        </h2>
        <p class="mb-4 md3-body-md text-on-surface-variant">
          Opérations destructives réservées aux administrateurs instance.
        </p>

        <FluffmindCard v-if="workspaceActionError" padding="md" variant="outlined" class="mb-4">
          <p class="md3-body-md text-error">
            {{ workspaceActionError }}
          </p>
        </FluffmindCard>

        <p class="mb-3 md3-body-sm text-on-surface-variant break-all">
          {{ workspace.vaultPath }}
        </p>

        <div class="flex flex-wrap items-center gap-2">
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
      </FluffmindCard>
    </template>
  </main>
</template>
