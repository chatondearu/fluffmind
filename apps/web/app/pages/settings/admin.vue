<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
} from '@fluffmind/design-system/src/components'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  disabledAt: string | null
}

const loading = ref(true)
const pageError = ref<string | null>(null)
const users = ref<AdminUser[]>([])

async function loadUsers() {
  loading.value = true
  pageError.value = null
  try {
    const response = await $fetch<{ users: AdminUser[] }>('/api/admin/users')
    users.value = response.users
  }
  catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    pageError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les utilisateurs.'
  }
  finally {
    loading.value = false
  }
}

await loadUsers()

async function promoteOrDemote(user: AdminUser) {
  const nextRole = user.role === 'admin' ? 'owner' : 'admin'
  await $fetch(`/api/admin/users/${user.id}/role`, {
    method: 'POST',
    body: { role: nextRole },
  })
  await loadUsers()
}

async function setDisabled(user: AdminUser, disabled: boolean) {
  await $fetch(`/api/admin/users/${user.id}/disabled`, {
    method: 'POST',
    body: { disabled },
  })
  await loadUsers()
}

async function revokeSessions(user: AdminUser) {
  await $fetch(`/api/admin/users/${user.id}/sessions/revoke`, {
    method: 'POST',
  })
  await loadUsers()
}
</script>

<template>
  <main class="md3-page max-w-4xl">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="md3-display-sm">
          Administration
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Gestion des comptes et révocation des sessions.
        </p>
      </div>
    </header>

    <FluffmindCard v-if="pageError" padding="lg" variant="outlined" class="mb-6">
      <p class="md3-body-md text-error">
        {{ pageError }}
      </p>
    </FluffmindCard>

    <FluffmindCard v-else padding="lg" class="mb-6">
      <template v-if="loading">
        <p class="md3-body-md text-on-surface-variant">
          Chargement des utilisateurs…
        </p>
      </template>

      <template v-else>
        <ul class="divide-y divide-outline-variant">
          <li v-for="user in users" :key="user.id" class="py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="md3-title-sm">
                  {{ user.name }} <span class="text-on-surface-variant">({{ user.email }})</span>
                </p>
                <p class="md3-body-md text-on-surface-variant break-all">
                  {{ user.id }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <FluffmindChip class="uppercase">
                    {{ user.role }}
                  </FluffmindChip>
                  <FluffmindChip v-if="user.disabledAt" variant="outlined">
                    disabled
                  </FluffmindChip>
                  <FluffmindChip v-else variant="outlined">
                    enabled
                  </FluffmindChip>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <FluffmindButton variant="outlined" size="sm" @click="promoteOrDemote(user)">
                  {{ user.role === 'admin' ? 'Rétrograder admin' : 'Promouvoir admin' }}
                </FluffmindButton>
                <FluffmindButton
                  variant="outlined"
                  size="sm"
                  @click="setDisabled(user, !user.disabledAt)"
                >
                  {{ user.disabledAt ? 'Réactiver compte' : 'Désactiver compte' }}
                </FluffmindButton>
                <FluffmindButton variant="tonal" size="sm" @click="revokeSessions(user)">
                  Révoquer sessions
                </FluffmindButton>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </FluffmindCard>
  </main>
</template>
