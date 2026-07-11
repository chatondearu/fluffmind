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
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function extractErrorMessage(error: unknown): string {
  const asRecord = error as { message?: string, statusText?: string }
  return asRecord?.message ?? asRecord?.statusText ?? 'Signup failed.'
}

async function signupWithEmail() {
  loading.value = true
  errorMessage.value = null

  const response = await authClient.signUp.email({
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
    callbackURL: '/',
  })

  if (response.error) {
    errorMessage.value = extractErrorMessage(response.error)
    loading.value = false
    return
  }

  await ensureWorkspaceOnboarding()
  await navigateTo('/')
}

async function signupWithGitHub() {
  loading.value = true
  errorMessage.value = null

  const response = await authClient.signIn.social({
    provider: 'github',
    callbackURL: '/',
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
        Créer un compte
      </h1>
      <p class="mt-2 mb-6 md3-body-md text-on-surface-variant">
        Accède à Fluffmind avec un compte email ou GitHub.
      </p>

      <form class="flex flex-col gap-4" @submit.prevent="signupWithEmail">
        <label class="block">
          <span class="mb-2 block md3-label-lg">Nom</span>
          <FluffmindTextField
            v-model="name"
            type="text"
            autocomplete="name"
            required
          />
        </label>
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
            autocomplete="new-password"
            required
          />
        </label>

        <p v-if="errorMessage" class="md3-body-md text-error">
          {{ errorMessage }}
        </p>

        <FluffmindButton type="submit" class="w-full" :disabled="loading">
          {{ loading ? 'Création en cours…' : 'Créer mon compte' }}
        </FluffmindButton>
      </form>

      <FluffmindDivider v-if="githubOAuthEnabled" class="my-6" />

      <FluffmindButton
        v-if="githubOAuthEnabled"
        variant="outlined"
        class="w-full"
        :disabled="loading"
        @click="signupWithGitHub"
      >
        Continuer avec GitHub
      </FluffmindButton>

      <p class="mt-6 md3-body-md text-on-surface-variant">
        Déjà inscrit ?
        <NuxtLink :to="{ path: '/login', query: route.query }" class="text-primary hover:underline">
          Se connecter
        </NuxtLink>
      </p>
    </FluffmindCard>
  </main>
</template>
