<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import { authClient, useAuth } from './composables/useAuth'
import type { ThemePreference } from './composables/useTheme'

const { preference, setPreference } = useTheme()
const route = useRoute()
const { public: { authEnabled } } = useRuntimeConfig()
const { data: authSession, isPending } = await useAuth()

const CYCLE: ThemePreference[] = ['system', 'light', 'dark']
const organizations = ref<Array<{ id: string, name: string }>>([])
const selectedWorkspaceId = ref('')
const workspaceLoading = ref(false)
const workspaceError = ref<string | null>(null)

const hideWorkspaceControls = computed(() => route.path === '/login' || route.path === '/signup')
const showWorkspaceSwitcher = computed(() =>
  authEnabled
  && !hideWorkspaceControls.value
  && !!authSession.value?.session
  && organizations.value.length > 1,
)
const showWorkspaceSettingsLink = computed(() =>
  authEnabled
  && !hideWorkspaceControls.value
  && !!authSession.value?.session,
)

function cycleTheme() {
  const next = CYCLE[(CYCLE.indexOf(preference.value) + 1) % CYCLE.length]!
  setPreference(next)
}

function extractErrorMessage(response: unknown): string | null {
  const error = (response as { error?: { message?: string | null } | null })?.error
  return error?.message || null
}

function extractOrganizations(data: unknown): Array<{ id: string, name: string }> {
  if (!Array.isArray(data)) return []

  return data
    .map((organization) => {
      const value = organization as { id?: unknown, name?: unknown }
      if (typeof value.id !== 'string' || !value.id)
        return null
      return {
        id: value.id,
        name: typeof value.name === 'string' && value.name ? value.name : 'Workspace',
      }
    })
    .filter((organization): organization is { id: string, name: string } => organization !== null)
}

async function loadOrganizations() {
  if (!authEnabled || !authSession.value?.session) {
    organizations.value = []
    selectedWorkspaceId.value = ''
    return
  }

  workspaceError.value = null
  const listResponse = await authClient.organization.list()
  const listError = extractErrorMessage(listResponse)
  if (listError) {
    workspaceError.value = listError
    return
  }

  const organizationList = extractOrganizations((listResponse as { data?: unknown }).data)
  organizations.value = organizationList

  const activeOrganizationId = authSession.value.session.activeOrganizationId || ''
  if (activeOrganizationId && organizationList.some(organization => organization.id === activeOrganizationId)) {
    selectedWorkspaceId.value = activeOrganizationId
    return
  }

  selectedWorkspaceId.value = organizationList[0]?.id || ''
}

async function setActiveWorkspace(workspaceId: string) {
  if (!workspaceId || workspaceId === selectedWorkspaceId.value)
    return

  workspaceLoading.value = true
  workspaceError.value = null

  try {
    const setActiveResponse = await authClient.organization.setActive({
      organizationId: workspaceId,
    })

    const setActiveError = extractErrorMessage(setActiveResponse)
    if (setActiveError) {
      workspaceError.value = setActiveError
      return
    }

    await $fetch('/api/workspaces/active', {
      method: 'POST',
      body: {
        workspaceId,
      },
    })

    selectedWorkspaceId.value = workspaceId
    await refreshNuxtData()
  } catch (error) {
    const asRecord = error as { message?: string, data?: { message?: string } }
    workspaceError.value = asRecord.data?.message || asRecord.message || 'Impossible de changer de workspace.'
  } finally {
    workspaceLoading.value = false
  }
}

function handleWorkspaceSelection(event: Event) {
  const target = event.target as HTMLSelectElement | null
  if (!target) return
  void setActiveWorkspace(target.value)
}

watch(
  () => [authEnabled, isPending, authSession.value?.session?.id] as const,
  async ([enabled, pending, sessionId]) => {
    if (!enabled || pending || !sessionId)
      return
    await loadOrganizations()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface">
    <NuxtRouteAnnouncer />
    <header class="sticky top-0 z-10 border-b border-outline/70 bg-surface/95 backdrop-blur">
      <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-2 px-4 py-3">
        <div v-if="showWorkspaceSwitcher" class="flex items-center gap-2">
          <label class="text-sm text-on-surface-variant" for="workspace-switcher">Workspace</label>
          <select
            id="workspace-switcher"
            :value="selectedWorkspaceId"
            class="rounded-lg border border-outline bg-surface px-2 py-1 text-sm text-on-surface"
            :disabled="workspaceLoading"
            @change="handleWorkspaceSelection"
          >
            <option v-for="organization in organizations" :key="organization.id" :value="organization.id">
              {{ organization.name }}
            </option>
          </select>
        </div>

        <NuxtLink
          v-if="showWorkspaceSettingsLink"
          to="/settings/workspace"
          class="rounded-lg px-2 py-1 text-sm text-primary hover:bg-primary/10"
        >
          Paramètres workspace
        </NuxtLink>

        <FluffmindButton variant="text" @click="cycleTheme">
          Theme: {{ preference }}
        </FluffmindButton>
      </div>
      <p v-if="workspaceError" class="mx-auto max-w-5xl px-4 pb-3 text-sm text-error">
        {{ workspaceError }}
      </p>
    </header>
    <NuxtPage />
  </div>
</template>
