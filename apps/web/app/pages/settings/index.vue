<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
} from '@fluffmind/design-system/src/components'

interface SyncStatus {
  remoteConfigured: boolean
  branch: string
  ahead: number
  behind: number
  diverged: boolean
}

interface DeploymentInfo {
  authEnabled: boolean
  gitRemoteConfigured: boolean
  webhookConfigured: boolean
  githubOAuthConfigured: boolean
  branch: string
  sync: SyncStatus | null
}

const { public: { authEnabled } } = useRuntimeConfig()
const { data, error, pending, refresh } = await useFetch<DeploymentInfo>('/api/deployment-info')

function syncLabel(status: SyncStatus | null | undefined): string {
  if (!status) return 'Unknown'
  if (!status.remoteConfigured) return 'Local only (no remote configured)'
  if (status.behind > 0 && status.ahead > 0) return `${status.behind} behind · ${status.ahead} ahead`
  if (status.behind > 0) return `${status.behind} commit(s) behind remote`
  if (status.ahead > 0) return `${status.ahead} commit(s) ahead of remote`
  return 'Up to date with remote'
}
</script>

<template>
  <main class="md3-page">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="md3-display-sm">
          Paramètres
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Déploiement, sync Git et compte.
        </p>
      </div>
      <NuxtLink to="/">
        <FluffmindButton variant="tonal" size="sm">
          ← Notes
        </FluffmindButton>
      </NuxtLink>
    </header>

    <p v-if="pending" class="md3-body-md text-on-surface-variant">
      Chargement…
    </p>

    <FluffmindCard v-else-if="error" padding="lg" variant="outlined">
      <p class="md3-body-md text-error">
        Impossible de charger les informations de déploiement.
      </p>
      <FluffmindButton variant="outlined" class="mt-4" @click="refresh()">
        Réessayer
      </FluffmindButton>
    </FluffmindCard>

    <template v-else-if="data">
      <FluffmindCard padding="lg" class="mb-6">
        <h2 class="mb-4 md3-title-md">
          Déploiement
        </h2>
        <dl class="grid gap-3">
          <div class="flex items-center justify-between gap-4">
            <dt class="md3-label-lg">
              Mode auth
            </dt>
            <dd>
              <FluffmindChip>{{ data.authEnabled ? 'Multi-comptes' : 'Solo' }}</FluffmindChip>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="md3-label-lg">
              Branche Git
            </dt>
            <dd class="md3-body-md">
              {{ data.branch }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="md3-label-lg">
              Remote Git
            </dt>
            <dd class="md3-body-md">
              {{ data.gitRemoteConfigured ? 'Configuré' : 'Non configuré' }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="md3-label-lg">
              Sync
            </dt>
            <dd class="md3-body-md text-right">
              {{ syncLabel(data.sync) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="md3-label-lg">
              Webhook GitHub
            </dt>
            <dd class="md3-body-md">
              {{ data.webhookConfigured ? 'Configuré' : 'Non configuré' }}
            </dd>
          </div>
        </dl>
      </FluffmindCard>

      <FluffmindCard
        v-if="!data.gitRemoteConfigured"
        padding="lg"
        variant="outlined"
        class="mb-6"
      >
        <h2 class="mb-2 md3-title-md">
          Git sync (optionnel)
        </h2>
        <p class="md3-body-md text-on-surface-variant">
          Les notes sont stockées localement dans le volume Docker. Pour synchroniser avec GitHub,
          configure dans Coolify :
        </p>
        <ul class="mt-3 list-inside list-disc md3-body-md text-on-surface-variant">
          <li><code class="text-on-surface">GIT_REMOTE_URL</code> — URL HTTPS avec token</li>
          <li><code class="text-on-surface">GITHUB_WEBHOOK_SECRET</code> — secret pour <code class="text-on-surface">POST /api/webhooks/github</code></li>
        </ul>
        <p class="mt-3 md3-body-md text-on-surface-variant">
          Puis redéploie. La barre de sync apparaîtra dans l'en-tête quand le remote est actif.
        </p>
      </FluffmindCard>

      <FluffmindCard
        v-if="!data.authEnabled"
        padding="lg"
        variant="outlined"
        class="mb-6"
      >
        <h2 class="mb-2 md3-title-md">
          Passer en multi-comptes
        </h2>
        <p class="md3-body-md text-on-surface-variant">
          Pour activer l'authentification sur Coolify, définis :
        </p>
        <ul class="mt-3 list-inside list-disc md3-body-md text-on-surface-variant">
          <li><code class="text-on-surface">AUTH_DISABLED=false</code></li>
          <li><code class="text-on-surface">BETTER_AUTH_SECRET</code> — 32+ octets aléatoires</li>
          <li><code class="text-on-surface">BETTER_AUTH_URL</code> — URL publique (ex. https://fluffmind.example.com)</li>
          <li><code class="text-on-surface">GITHUB_CLIENT_ID</code> / <code class="text-on-surface">GITHUB_CLIENT_SECRET</code> — optionnel, pour login GitHub</li>
        </ul>
        <p class="mt-4 md3-body-md text-on-surface-variant">
          Au premier signup, un workspace et une note de bienvenue sont créés automatiquement.
        </p>
        <NuxtLink to="/signup" class="mt-4 inline-block">
          <FluffmindButton variant="outlined" size="sm">
            Créer un compte (après activation auth)
          </FluffmindButton>
        </NuxtLink>
      </FluffmindCard>

      <FluffmindCard v-else padding="lg" class="mb-6">
        <h2 class="mb-2 md3-title-md">
          Compte & workspace
        </h2>
        <p class="mb-4 md3-body-md text-on-surface-variant">
          Gère les membres, invitations et la liaison GitHub du workspace actif.
        </p>
        <NuxtLink to="/settings/workspace">
          <FluffmindButton variant="tonal" size="sm">
            Paramètres workspace →
          </FluffmindButton>
        </NuxtLink>
        <p v-if="!data.githubOAuthConfigured" class="mt-4 md3-body-md text-on-surface-variant">
          Login GitHub non configuré — seule la connexion email est disponible.
        </p>
      </FluffmindCard>
    </template>
  </main>
</template>
