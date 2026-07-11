<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindDivider,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import { authClient } from '../composables/useAuth'
import { ensureWorkspaceOnboarding } from '../composables/useOnboarding'

const route = useRoute()
const { public: { githubOAuthEnabled } } = useRuntimeConfig()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const callbackUrl = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/'))
    return redirect
  return '/'
})

function extractErrorMessage(error: unknown): string {
  const asRecord = error as { message?: string, statusText?: string }
  return asRecord?.message ?? asRecord?.statusText ?? 'Login failed.'
}

async function loginWithEmail() {
  loading.value = true
  errorMessage.value = null

  const response = await authClient.signIn.email({
    email: email.value.trim(),
    password: password.value,
    callbackURL: callbackUrl.value,
  })

  if (response.error) {
    errorMessage.value = extractErrorMessage(response.error)
    loading.value = false
    return
  }

  await ensureWorkspaceOnboarding()
  await navigateTo(callbackUrl.value)
}

async function loginWithGitHub() {
  loading.value = true
  errorMessage.value = null

  const response = await authClient.signIn.social({
    provider: 'github',
    callbackURL: callbackUrl.value,
  })

  if (response.error) {
    errorMessage.value = extractErrorMessage(response.error)
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
    <FluffmindCard padding="lg" class="w-full max-w-md">
      <h1 class="md3-headline-sm">
        Connexion
      </h1>
      <p class="mt-2 mb-6 md3-body-md text-on-surface-variant">
        Connecte-toi à ton espace Fluffmind.
      </p>

      <form class="flex flex-col gap-4" @submit.prevent="loginWithEmail">
        <label class="block">
          <span class="mb-2 block md3-label-lg">Email</span>
          <FluffmindTextField
            v-model="email"
            type="email"
            autocomplete="email"
            required
          />
        </label>
        <label class="block">
          <span class="mb-2 block md3-label-lg">Mot de passe</span>
          <FluffmindTextField
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <p v-if="errorMessage" class="md3-body-md text-error">
          {{ errorMessage }}
        </p>

        <FluffmindButton type="submit" class="w-full" :disabled="loading">
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </FluffmindButton>
      </form>

      <FluffmindDivider v-if="githubOAuthEnabled" class="my-6" />

      <FluffmindButton
        v-if="githubOAuthEnabled"
        variant="outlined"
        class="w-full"
        :disabled="loading"
        @click="loginWithGitHub"
      >
        Continuer avec GitHub
      </FluffmindButton>

      <p class="mt-6 md3-body-md text-on-surface-variant">
        Pas encore de compte ?
        <NuxtLink :to="{ path: '/signup', query: route.query }" class="text-primary hover:underline">
          Créer un compte
        </NuxtLink>
      </p>
    </FluffmindCard>
  </main>
</template>
