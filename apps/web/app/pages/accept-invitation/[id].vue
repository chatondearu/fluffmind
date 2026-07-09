<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import { authClient, useAuth } from '../../composables/useAuth'

const route = useRoute()
const { data: authSession, isPending } = useAuth()

const invitationId = computed(() => {
  const rawId = route.params.id
  return typeof rawId === 'string' ? rawId : ''
})

const loading = ref(false)
const accepted = ref(false)
const errorMessage = ref<string | null>(null)
const started = ref(false)
const loginLink = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)

function extractErrorMessage(response: unknown): string | null {
  const error = (response as { error?: { message?: string | null } | null })?.error
  return error?.message || null
}

async function acceptInvitation() {
  if (started.value || !invitationId.value || !authSession.value?.session)
    return

  started.value = true
  loading.value = true
  errorMessage.value = null

  try {
    const response = await authClient.organization.acceptInvitation({
      invitationId: invitationId.value,
    })

    const error = extractErrorMessage(response)
    if (error) {
      errorMessage.value = error
      return
    }

    accepted.value = true
  } catch (error) {
    const asRecordError = error as { message?: string }
    errorMessage.value = asRecordError.message || 'Impossible d’accepter l’invitation.'
  } finally {
    loading.value = false
  }
}

watchEffect(() => {
  if (isPending.value)
    return
  void acceptInvitation()
})
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-md items-center p-6">
    <section class="w-full rounded-lg border border-outline p-6">
      <h1 class="mb-2 text-2xl font-semibold text-on-surface">
        Invitation workspace
      </h1>

      <p v-if="!invitationId" class="mb-4 text-sm text-error">
        Invitation invalide.
      </p>

      <template v-else-if="!authSession?.session && !isPending">
        <p class="mb-4 text-sm text-on-surface-variant">
          Connecte-toi pour accepter cette invitation.
        </p>
        <FluffmindButton class="w-full" @click="navigateTo(loginLink)">
          Aller à la connexion
        </FluffmindButton>
      </template>

      <template v-else-if="loading">
        <p class="text-sm text-on-surface-variant">
          Acceptation de l’invitation…
        </p>
      </template>

      <template v-else-if="accepted">
        <p class="mb-4 text-sm text-tertiary">
          Invitation acceptée. Bienvenue dans le workspace.
        </p>
        <FluffmindButton class="w-full" @click="navigateTo('/settings/workspace')">
          Ouvrir les paramètres du workspace
        </FluffmindButton>
      </template>

      <template v-else-if="errorMessage">
        <p class="mb-4 text-sm text-error">
          {{ errorMessage }}
        </p>
        <FluffmindButton variant="outlined" class="w-full" @click="started = false; void acceptInvitation()">
          Réessayer
        </FluffmindButton>
      </template>
    </section>
  </main>
</template>
