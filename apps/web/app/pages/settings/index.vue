<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'

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
  <main class="mx-auto max-w-2xl p-6">
    <div class="mb-6 flex items-baseline justify-between gap-4">
      <h1 class="text-2xl font-semibold text-on-surface">
        Paramètres
      </h1>
      <NuxtLink to="/" class="text-sm text-primary hover:underline">
        ← Notes
      </NuxtLink>
    </div>

    <p v-if="pending" class="text-sm text-on-surface-variant">
      Chargement…
    </p>
    <div v-else-if="error" class="rounded-lg border border-outline-variant p-4">
      <p class="text-sm text-error">
        Impossible de charger les informations de déploiement.
      </p>
      <FluffmindButton variant="outlined" class="mt-3" @click="refresh()">
        Réessayer
      </FluffmindButton>
    </div>

    <template v-else-if="data">
      <section class="mb-6 rounded-lg border border-outline p-4">
        <h2 class="mb-3 text-sm font-medium text-on-surface">
          Déploiement
        </h2>
        <dl class="grid gap-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-on-surface-variant">
              Mode auth
            </dt>
            <dd class="text-on-surface">
              {{ data.authEnabled ? 'Multi-comptes' : 'Solo (auth désactivée)' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-on-surface-variant">
              Branche Git
            </dt>
            <dd class="text-on-surface">
              {{ data.branch }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-on-surface-variant">
              Remote Git
            </dt>
            <dd class="text-on-surface">
              {{ data.gitRemoteConfigured ? 'Configuré' : 'Non configuré' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-on-surface-variant">
              Sync
            </dt>
            <dd class="text-on-surface">
              {{ syncLabel(data.sync) }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-on-surface-variant">
              Webhook GitHub
            </dt>
            <dd class="text-on-surface">
              {{ data.webhookConfigured ? 'Configuré' : 'Non configuré' }}
            </dd>
          </div>
        </dl>
      </section>

      <section v-if="!data.gitRemoteConfigured" class="mb-6 rounded-lg border border-dashed border-outline-variant p-4">
        <h2 class="mb-2 text-sm font-medium text-on-surface">
          Git sync (optionnel)
        </h2>
        <p class="text-sm text-on-surface-variant">
          Les notes sont stockées localement dans le volume Docker. Pour synchroniser avec GitHub,
          configure dans Coolify :
        </p>
        <ul class="mt-2 list-inside list-disc text-sm text-on-surface-variant">
          <li><code class="text-on-surface">GIT_REMOTE_URL</code> — URL HTTPS avec token</li>
          <li><code class="text-on-surface">GITHUB_WEBHOOK_SECRET</code> — secret pour <code class="text-on-surface">POST /api/webhooks/github</code></li>
        </ul>
        <p class="mt-2 text-sm text-on-surface-variant">
          Puis redéploie. La barre de sync apparaîtra dans l'en-tête quand le remote est actif.
        </p>
      </section>

      <section v-if="!data.authEnabled" class="mb-6 rounded-lg border border-dashed border-outline-variant p-4">
        <h2 class="mb-2 text-sm font-medium text-on-surface">
          Passer en multi-comptes
        </h2>
        <p class="text-sm text-on-surface-variant">
          Pour activer l'authentification sur Coolify, définis :
        </p>
        <ul class="mt-2 list-inside list-disc text-sm text-on-surface-variant">
          <li><code class="text-on-surface">AUTH_DISABLED=false</code></li>
          <li><code class="text-on-surface">BETTER_AUTH_SECRET</code> — 32+ octets aléatoires</li>
          <li><code class="text-on-surface">BETTER_AUTH_URL</code> — URL publique (ex. https://fluffmind.example.com)</li>
          <li><code class="text-on-surface">GITHUB_CLIENT_ID</code> / <code class="text-on-surface">GITHUB_CLIENT_SECRET</code> — optionnel, pour login GitHub</li>
        </ul>
        <p class="mt-3 text-sm text-on-surface-variant">
          Au premier signup, un workspace et une note de bienvenue sont créés automatiquement.
        </p>
        <NuxtLink
          to="/signup"
          class="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Créer un compte (après activation auth)
        </NuxtLink>
      </section>

      <section v-else class="mb-6 rounded-lg border border-outline p-4">
        <h2 class="mb-2 text-sm font-medium text-on-surface">
          Compte & workspace
        </h2>
        <p class="mb-3 text-sm text-on-surface-variant">
          Gère les membres, invitations et la liaison GitHub du workspace actif.
        </p>
        <NuxtLink
          to="/settings/workspace"
          class="text-sm text-primary hover:underline"
        >
          Paramètres workspace →
        </NuxtLink>
        <p v-if="!data.githubOAuthConfigured" class="mt-3 text-sm text-on-surface-variant">
          Login GitHub non configuré — seule la connexion email est disponible.
        </p>
      </section>
    </template>
  </main>
</template>
