<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import { authClient } from '../composables/useAuth'

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

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
    callbackURL: '/',
  })

  if (response.error) {
    errorMessage.value = extractErrorMessage(response.error)
    loading.value = false
    return
  }

  await navigateTo('/')
}

async function loginWithGitHub() {
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
        Connexion
      </h1>
      <p class="mb-6 text-sm text-on-surface-variant">
        Connecte-toi à ton espace Fluffmind.
      </p>

      <form class="flex flex-col gap-3" @submit.prevent="loginWithEmail">
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
            autocomplete="current-password"
            required
            class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
          >
        </label>

        <p v-if="errorMessage" class="text-sm text-error">
          {{ errorMessage }}
        </p>

        <FluffmindButton type="submit" :disabled="loading">
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </FluffmindButton>
      </form>

      <div class="my-4 border-t border-outline-variant" />

      <FluffmindButton variant="outlined" class="w-full" :disabled="loading" @click="loginWithGitHub">
        Continuer avec GitHub
      </FluffmindButton>

      <p class="mt-4 text-sm text-on-surface-variant">
        Pas encore de compte ?
        <NuxtLink to="/signup" class="text-primary hover:underline">
          Créer un compte
        </NuxtLink>
      </p>
    </section>
  </main>
</template>
