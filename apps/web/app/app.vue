<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import type { ThemePreference } from './composables/useTheme'
import { ensureWorkspaceOnboarding } from './composables/useOnboarding'

const { public: { authEnabled } } = useRuntimeConfig()
const route = useRoute()

type AuthModule = typeof import('./composables/useAuth')
const authModule: AuthModule | null = authEnabled ? await import('./composables/useAuth') : null

const authSession = ref<{ session?: { id: string, activeOrganizationId?: string | null } } | null>(null)
const isPending = ref(false)

const authSessionState = authModule ? await authModule.useAuth() : null

if (authSessionState) {
  authSession.value = authSessionState.data.value
  isPending.value = authSessionState.isPending
  watch(authSessionState.data, (value) => {
    authSession.value = value
  })
  watch(
    () => authSessionState.isPending,
    (value) => {
      isPending.value = value
    },
  )
}

const { preference, setPreference } = useTheme()
const organizations = ref<Array<{ id: string, name: string }>>([])
const selectedWorkspaceId = ref('')
const workspaceLoading = ref(false)
const workspaceError = ref<string | null>(null)

const hideWorkspaceControls = computed(() => route.path === '/login' || route.path === '/signup')
const hideSidebar = computed(() =>
  route.path === '/login'
  || route.path === '/signup'
  || route.path.startsWith('/accept-invitation/'),
)
const sidebarWorkspaceId = computed(() =>
  authSession.value?.session?.activeOrganizationId || selectedWorkspaceId.value || 'default',
)
const mobileSidebarOpen = ref(false)

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}

function openMobileSidebar() {
  mobileSidebarOpen.value = true
}

watch(() => route.fullPath, () => {
  mobileSidebarOpen.value = false
})
const CYCLE: ThemePreference[] = ['system', 'light', 'dark']
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
const showLogout = computed(() =>
  authEnabled
  && !hideWorkspaceControls.value
  && !!authSession.value?.session,
)
const showLogin = computed(() =>
  authEnabled
  && !hideWorkspaceControls.value
  && !authSession.value?.session
  && !isPending.value,
)
const showSettingsLink = computed(() => !hideWorkspaceControls.value)
const loggingOut = ref(false)

async function logout() {
  if (!authModule) return
  loggingOut.value = true
  try {
    await authModule.authClient.signOut()
    await navigateTo('/login')
  } finally {
    loggingOut.value = false
  }
}

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
  if (!authModule || !authEnabled || !authSession.value?.session) {
    organizations.value = []
    selectedWorkspaceId.value = ''
    return
  }

  workspaceError.value = null
  const listResponse = await authModule.authClient.organization.list()
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
  if (!authModule || !workspaceId || workspaceId === selectedWorkspaceId.value)
    return

  workspaceLoading.value = true
  workspaceError.value = null

  try {
    const setActiveResponse = await authModule.authClient.organization.setActive({
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
    try {
      await ensureWorkspaceOnboarding()
    } catch {
      // Non-fatal: settings page can recover manually.
    }
    await loadOrganizations()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface">
    <NuxtRouteAnnouncer />

    <div class="flex min-h-screen">
      <VaultSidebar
        v-if="!hideSidebar"
        :workspace-id="sidebarWorkspaceId"
        :mobile-open="mobileSidebarOpen"
        @close="closeMobileSidebar"
      />

      <div
        v-if="mobileSidebarOpen && !hideSidebar"
        class="fixed inset-0 z-30 bg-black/40 md:hidden"
        @click="closeMobileSidebar"
      />

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-10 border-b border-outline/70 bg-surface/95 backdrop-blur">
          <div class="flex w-full flex-wrap items-center justify-end gap-2 px-4 py-3">
            <FluffmindButton
              v-if="!hideSidebar"
              variant="text"
              class="mr-auto md:hidden"
              @click="openMobileSidebar"
            >
              ☰
            </FluffmindButton>

            <SyncStatusBar />

        <NuxtLink
          v-if="showSettingsLink"
          to="/settings"
          class="rounded-lg px-2 py-1 text-sm text-primary hover:bg-primary/10"
        >
          Paramètres
        </NuxtLink>

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

        <NuxtLink
          v-if="showLogin"
          to="/login"
          class="rounded-lg px-2 py-1 text-sm text-primary hover:bg-primary/10"
        >
          Connexion
        </NuxtLink>

        <FluffmindButton
          v-if="showLogout"
          variant="text"
          :disabled="loggingOut"
          @click="logout"
        >
          {{ loggingOut ? '…' : 'Logout' }}
        </FluffmindButton>

        <FluffmindButton variant="text" @click="cycleTheme">
          Theme: {{ preference }}
        </FluffmindButton>
      </div>
      <p v-if="workspaceError" class="px-4 pb-3 text-sm text-error">
        {{ workspaceError }}
      </p>
        </header>
        <NuxtPage />
      </div>
    </div>
  </div>
</template>
