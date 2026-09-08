<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindCheckbox,
  FluffmindChip,
  FluffmindSelect,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

interface AgentTokenRow {
  id: string
  name: string
  scope: 'read' | 'write'
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const props = withDefaults(defineProps<{
  workspaceId: string
  canManage?: boolean
}>(), {
  canManage: true,
})

const agentEnabled = ref(false)
const agentTokens = ref<AgentTokenRow[]>([])
const agentLoading = ref(false)
const agentSaving = ref(false)
const agentCreating = ref(false)
const agentNewName = ref('')
const agentNewScope = ref<'read' | 'write'>('write')
const agentCreatedSecret = ref<string | null>(null)
const agentError = ref<string | null>(null)
const agentSuccess = ref<string | null>(null)
const copyingCursorSnippet = ref(false)
const copyingCliSnippet = ref(false)

const agentScopeOptions = [
  { value: 'read' as const, label: 'Lecture seule' },
  { value: 'write' as const, label: 'Lecture + écriture' },
]

const agentEndpointUrl = computed(() => {
  if (!import.meta.client)
    return '/api/mcp'
  return `${window.location.origin}/api/mcp`
})

const agentTokenSample = computed(() => agentCreatedSecret.value || 'fm_agent_<votre-token>')

const agentCursorSnippet = computed(() => {
  return JSON.stringify({
    mcpServers: {
      fluffmind: {
        url: agentEndpointUrl.value,
        headers: {
          Authorization: `Bearer ${agentTokenSample.value}`,
        },
      },
    },
  }, null, 2)
})

const agentCliSnippet = computed(() => {
  const host = !import.meta.client
    ? 'https://<host>'
    : window.location.origin
  return [
    `export FLUFFMIND_URL=${host}`,
    `export FLUFFMIND_TOKEN=${agentTokenSample.value}`,
    'fluffmind whoami',
  ].join('\n')
})

const activeAgentTokens = computed(() => agentTokens.value.filter(token => !token.revokedAt))

function formatDate(value: string | null): string {
  if (!value)
    return 'Inconnue'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return 'Inconnue'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function loadAgentState(): Promise<void> {
  if (!props.canManage) {
    agentEnabled.value = false
    agentTokens.value = []
    return
  }

  agentLoading.value = true
  agentError.value = null
  try {
    const response = await $fetch<{ agentEnabled: boolean, tokens: AgentTokenRow[] }>('/api/workspaces/agent', {
      query: { workspaceId: props.workspaceId },
    })
    agentEnabled.value = Boolean(response.agentEnabled)
    agentTokens.value = Array.isArray(response.tokens) ? response.tokens : []
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    agentError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger la config des agents.'
  }
  finally {
    agentLoading.value = false
  }
}

async function toggleAgentEnabled(next: boolean): Promise<void> {
  if (!props.canManage)
    return

  agentSaving.value = true
  agentError.value = null
  agentSuccess.value = null
  try {
    const response = await $fetch<{ agentEnabled: boolean, tokens: AgentTokenRow[] }>('/api/workspaces/agent', {
      method: 'PATCH',
      body: { agentEnabled: next, workspaceId: props.workspaceId },
    })
    agentEnabled.value = Boolean(response.agentEnabled)
    agentTokens.value = Array.isArray(response.tokens) ? response.tokens : []
    agentSuccess.value = next ? 'Accès agents activé pour ce workspace.' : 'Accès agents désactivé pour ce workspace.'
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    agentError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de mettre à jour l’accès agents.'
  }
  finally {
    agentSaving.value = false
  }
}

async function createAgentToken(): Promise<void> {
  if (!props.canManage)
    return

  agentCreating.value = true
  agentError.value = null
  agentSuccess.value = null
  agentCreatedSecret.value = null
  try {
    const response = await $fetch<AgentTokenRow & { token: string }>('/api/workspaces/agent/tokens', {
      method: 'POST',
      body: {
        name: agentNewName.value.trim(),
        scope: agentNewScope.value,
        workspaceId: props.workspaceId,
      },
    })
    agentCreatedSecret.value = response.token
    agentNewName.value = ''
    agentNewScope.value = 'write'
    agentSuccess.value = 'Token créé — copiez-le maintenant, il ne sera plus affiché.'
    await loadAgentState()
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    agentError.value = asRecordError.data?.message || asRecordError.message || 'Création du token impossible.'
  }
  finally {
    agentCreating.value = false
  }
}

async function revokeAgentToken(tokenId: string): Promise<void> {
  if (!props.canManage)
    return

  agentError.value = null
  agentSuccess.value = null
  try {
    await $fetch(`/api/workspaces/agent/tokens/${tokenId}`, {
      method: 'DELETE',
      query: { workspaceId: props.workspaceId },
    })
    agentSuccess.value = 'Token révoqué.'
    await loadAgentState()
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    agentError.value = asRecordError.data?.message || asRecordError.message || 'Révocation impossible.'
  }
}

async function copyCursorSnippet(): Promise<void> {
  copyingCursorSnippet.value = true
  try {
    await navigator.clipboard.writeText(agentCursorSnippet.value)
    agentSuccess.value = 'Snippet Cursor copié.'
  }
  catch (error) {
    const asRecordError = error as { message?: string }
    agentError.value = asRecordError.message || 'Impossible de copier le snippet.'
  }
  finally {
    copyingCursorSnippet.value = false
  }
}

async function copyCliSnippet(): Promise<void> {
  copyingCliSnippet.value = true
  try {
    await navigator.clipboard.writeText(agentCliSnippet.value)
    agentSuccess.value = 'Snippet CLI copié.'
  }
  catch (error) {
    const asRecordError = error as { message?: string }
    agentError.value = asRecordError.message || 'Impossible de copier le snippet.'
  }
  finally {
    copyingCliSnippet.value = false
  }
}

watch(() => props.workspaceId, () => {
  void loadAgentState()
}, { immediate: true })
</script>

<template>
  <FluffmindCard padding="lg" class="mb-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="md3-title-md">
        Agents
      </h2>
      <FluffmindChip variant="outlined">
        {{ agentEnabled ? 'Activé' : 'Désactivé' }}
      </FluffmindChip>
    </div>

    <p class="mb-4 md3-body-md text-on-surface-variant">
      Endpoint MCP instance :
      <code class="text-primary">{{ agentEndpointUrl }}</code>
      — un même token Bearer lie l’agent (Cursor, CLI…) à ce workspace.
      Nécessite l’authentification activée sur le serveur (<code>DATABASE_URL</code>
      défini, <code>AUTH_DISABLED</code> différent de <code>true</code>).
    </p>

    <FluffmindCheckbox
      :model-value="agentEnabled"
      :disabled="!canManage || agentSaving || agentLoading"
      @update:model-value="toggleAgentEnabled"
    >
      Activer l’accès agents pour ce workspace
    </FluffmindCheckbox>

    <section v-if="agentEnabled && canManage" class="mt-6 rounded-xl bg-surface-container-low p-4">
      <h3 class="md3-title-sm">
        Créer un token
      </h3>
      <div class="mt-4 grid gap-4 md:grid-cols-[1fr_auto_auto]">
        <label class="block">
          <span class="mb-2 block md3-label-lg">Nom</span>
          <FluffmindTextField
            v-model="agentNewName"
            type="text"
            placeholder="Cursor perso"
          />
        </label>
        <label class="block">
          <span class="mb-2 block md3-label-lg">Portée</span>
          <FluffmindSelect
            v-model="agentNewScope"
            :options="agentScopeOptions"
          />
        </label>
        <div class="flex items-end">
          <FluffmindButton
            :disabled="agentCreating || !agentNewName.trim()"
            @click="createAgentToken"
          >
            {{ agentCreating ? 'Création…' : 'Créer' }}
          </FluffmindButton>
        </div>
      </div>

      <div v-if="agentCreatedSecret" class="mt-4">
        <p class="md3-body-md text-tertiary">
          Secret (affiché une seule fois) :
        </p>
        <code class="mt-1 block break-all text-primary">
          {{ agentCreatedSecret }}
        </code>

        <p class="mt-4 md3-label-lg">
          Exemple Cursor (mcp.json)
        </p>
        <pre class="mt-2 overflow-x-auto rounded-lg bg-surface p-3 md3-body-sm">{{ agentCursorSnippet }}</pre>
        <FluffmindButton
          variant="outlined"
          size="sm"
          class="mt-2"
          :disabled="copyingCursorSnippet"
          @click="copyCursorSnippet"
        >
          {{ copyingCursorSnippet ? 'Copie…' : 'Copier le snippet' }}
        </FluffmindButton>

        <p class="mt-4 md3-label-lg">
          Exemple CLI
        </p>
        <pre class="mt-2 overflow-x-auto rounded-lg bg-surface p-3 md3-body-sm">{{ agentCliSnippet }}</pre>
        <FluffmindButton
          variant="outlined"
          size="sm"
          class="mt-2"
          :disabled="copyingCliSnippet"
          @click="copyCliSnippet"
        >
          {{ copyingCliSnippet ? 'Copie…' : 'Copier le snippet' }}
        </FluffmindButton>

        <p class="mt-4 md3-body-md text-on-surface-variant">
          Agent codant (skill) : copiez
          <code class="text-primary">skills/fluffmind/SKILL.md</code>
          dans le dossier de skills de votre agent — voir la
          <a
            href="https://chatondearu.github.io/fluffmind/guide/agents"
            target="_blank"
            rel="noopener"
            class="text-primary underline"
          >documentation « Agent access »</a>.
        </p>
      </div>
    </section>

    <ul v-if="activeAgentTokens.length > 0" class="mt-6 divide-y divide-outline-variant">
      <li
        v-for="token in activeAgentTokens"
        :key="token.id"
        class="flex flex-wrap items-center justify-between gap-2 py-3"
      >
        <div>
          <p class="md3-title-sm">
            {{ token.name }}
          </p>
          <p class="md3-body-md text-on-surface-variant">
            fm_agent_{{ token.tokenPrefix }}… · {{ token.scope }} · créé {{ formatDate(token.createdAt) }}
          </p>
        </div>
        <FluffmindButton
          variant="outlined"
          size="sm"
          :disabled="!canManage"
          @click="revokeAgentToken(token.id)"
        >
          Révoquer
        </FluffmindButton>
      </li>
    </ul>
    <p v-else-if="agentEnabled" class="mt-4 md3-body-md text-on-surface-variant">
      Aucun token actif.
    </p>

    <p v-if="!canManage" class="mt-4 md3-body-md text-on-surface-variant">
      Seuls les propriétaires peuvent gérer les agents.
    </p>
    <p v-if="agentSuccess" class="mt-4 md3-body-md text-tertiary">
      {{ agentSuccess }}
    </p>
    <p v-if="agentError" class="mt-4 md3-body-md text-error">
      {{ agentError }}
    </p>
  </FluffmindCard>
</template>
