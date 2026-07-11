<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
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
  <main class="mx-auto flex min-h-screen w-full max-w-md items-center p-6">
    <section class="w-full rounded-lg border border-outline p-6">
      <h1 class="mb-2 text-2xl font-semibold text-on-surface">
        Créer un compte
      </h1>
      <p class="mb-6 text-sm text-on-surface-variant">
        Accède à Fluffmind avec un compte email ou GitHub.
      </p>

      <form class="flex flex-col gap-3" @submit.prevent="signupWithEmail">
        <label class="block">
          <span class="mb-1 block text-sm text-on-surface-variant">Nom</span>
          <input
            v-model="name"
            type="text"
            autocomplete="name"
            required
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-sm text-on-surface-variant">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-sm text-on-surface-variant">Mot de passe</span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
        </label>

        <p v-if="errorMessage" class="text-sm text-error">
          {{ errorMessage }}
        </p>

        <FluffmindButton type="submit" :disabled="loading">
          {{ loading ? 'Création en cours…' : 'Créer mon compte' }}
        </FluffmindButton>
      </form>

      <div v-if="githubOAuthEnabled" class="my-4 border-t border-outline-variant" />

      <FluffmindButton
        v-if="githubOAuthEnabled"
        variant="outlined"
        class="w-full"
        :disabled="loading"
        @click="signupWithGitHub"
      >
        Continuer avec GitHub
      </FluffmindButton>

      <p class="mt-4 text-sm text-on-surface-variant">
        Déjà inscrit ?
        <NuxtLink :to="{ path: '/login', query: route.query }" class="text-primary hover:underline">
          Se connecter
        </NuxtLink>
      </p>
    </section>
  </main>
</template>
