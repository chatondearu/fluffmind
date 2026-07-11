<script setup lang="ts">
const { public: { authEnabled } } = useRuntimeConfig()
</script>

<template>
  <main class="md3-page max-w-3xl">
    <h1 class="md3-display-sm">
      Bienvenue
    </h1>
    <p class="mt-2 md3-body-md text-on-surface-variant">
      Choisis une note dans la barre latérale ou crée une page avec le bouton
      <strong>+</strong> dans un dossier.
    </p>
    <p v-if="authEnabled" class="mt-4 md3-body-md text-on-surface-variant">
      Tu peux aussi lier un dépôt Git dans les
      <NuxtLink to="/settings/workspace" class="text-primary hover:underline">
        paramètres workspace
      </NuxtLink>.
    </p>
  </main>
</template>
