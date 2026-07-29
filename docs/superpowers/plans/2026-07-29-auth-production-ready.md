# Auth production-ready (invite-only signup + instance admin) — Implementation Plan

I'm using the writing-plans skill to create the implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En production, rendre l’auth “lisible” (redirections + messages), ajouter un mode `invite-only` (par défaut) contrôlé par `AUTH_PUBLIC_SIGNUP`, produire des invitations partageables sans SMTP, assurer `ensureWorkspaceOnboarding()` + redirection cohérente pour tous les sign-in/sign-up (email + social), et fournir une UI/API “admin instance” pour gérer comptes et sessions.

**Architecture:** On sécurise d’abord l’expérience côté navigation via `apps/web/app/middleware/auth.global.ts` (gating de `/signup` en mode invite-only + redirection explicite vers `/login`). On factorise la logique de redirect/callback et d’invitation (helpers purs unit-testés). On renforce ensuite l’enforcement serveur via `disabledAt` (schema Better Auth + `requireSession()` + hook Better Auth bloquant la création de session). Enfin, on ajoute une couche `requireAdminInstance()` et de nouveaux endpoints admin protégés, consommés par une nouvelle page UI `/settings/admin`.

**Tech Stack:** Nuxt 4 route middleware + pages Vue `<script setup lang="ts">`, Better Auth + Drizzle (Postgres), Nitro endpoints, Vitest.

## Global Constraints

- `AUTH_PUBLIC_SIGNUP=true` : inscription publique activée
- `AUTH_PUBLIC_SIGNUP=false` (valeur par défaut recommandée en multi-comptes) : inscription publique bloquée
- En `invite-only` (`AUTH_PUBLIC_SIGNUP=false`), l’accès à `/signup` doit être conditionné : autorisé uniquement si la navigation provient d’un contexte d’invitation (ex. `redirect` pointe vers `/accept-invitation/<id>`).
- Lorsque `authEnabled` est vrai (i.e. `AUTH_DISABLED=false` et `DATABASE_URL` présent), toutes les routes applicatives non listées comme publiques redirigent vers `/login?redirect=...`.
- Un message UX doit indiquer clairement qu’il faut être connecté / membre d’un workspace avant d’éditer.
- Les flows suivants doivent déclencher *systématiquement* : `ensureWorkspaceOnboarding()` (création workspace si besoin + cookie workspace actif) ; navigation vers l’URL de redirection (`callbackURL`) cohérente avec le paramètre `redirect`.
- Couvrir explicitement : email/password login ; social login (GitHub) ; email/password signup ; social signup (si disponible).
- Quand un admin invite un membre depuis `Settings > workspace` : la réponse de l’API Better Auth doit permettre d’obtenir l’`invitationId` (ou équivalent) ; l’UI doit afficher un lien partageable au format `/accept-invitation/<invitationId>` ; l’UI doit permettre de copier le lien ; pas de dépendance à un transport SMTP dans ce package.
- Définition : “admin instance” = utilisateur Better Auth dont `user.role === 'admin'`.
- `requireSession()` doit refuser (401/403) les actions quand l’utilisateur est désactivé.
- Les endpoints admin doivent refuser (403) pour tout non-admin instance.
- Compatibilité : le mode solo (`AUTH_DISABLED=true`) doit rester inchangé.
- Sécurité : aucun endpoint admin ne doit être accessible sans vérification admin instance.
- Ergonomie : messages d’erreurs actionnables (pas de “silent failure” côté UI).
---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/app/middleware/auth.global.ts` | Middleware auth + gating `/signup` en mode invite-only |
| `apps/web/app/pages/login.vue` | Login email/social avec `callbackURL` + onboarding |
| `apps/web/app/pages/signup.vue` | Signup email/social avec `callbackURL` + onboarding |
| `apps/web/app/pages/accept-invitation/[id].vue` | Accept invitation + onboarding + post-accept redirect |
| `apps/web/app/pages/settings/workspace.vue` | UI invitation: affichage lien copiable (sans SMTP) |
| `packages/db/src/schema/auth.ts` | Schéma user Better Auth: ajout `disabledAt` |
| `packages/db/src/auth.ts` | Better Auth config: `disabledAt` additionalFields + hook bloquant session |
| `apps/web/server/utils/auth.ts` | `requireSession()` + enforcement disabledAt |
| `apps/web/server/utils/admin.ts` | `requireAdminInstance()` |
| `apps/web/server/api/admin/**` | Endpoints admin (list/users role/disable/revoke) |
| `apps/web/app/pages/settings/admin.vue` | UI admin instance |

---

### Task 1: Signup invite-only gating (`AUTH_PUBLIC_SIGNUP`) + middleware (TDD)

**Files:**

- Create: `apps/web/app/utils/signup-access.ts`
- Create: `apps/web/app/utils/signup-access.test.ts`
- Modify: `apps/web/app/middleware/auth.global.ts`
- Modify: `apps/web/nuxt.config.ts`

**Interfaces:**

```ts
export function getInternalRedirectPath(redirectQuery: unknown): string | null
export function getInvitationRedirectPath(redirectQuery: unknown): string | null
export function canAccessSignup(options: {
  authPublicSignupEnabled: boolean
  redirectQuery: unknown
}): boolean
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'

import { canAccessSignup, getInternalRedirectPath, getInvitationRedirectPath } from './signup-access'

describe('signup-access', () => {
  it('parses only internal redirect paths', () => {
    expect(getInternalRedirectPath('/foo')).toBe('/foo')
    expect(getInternalRedirectPath('https://example.com')).toBeNull()
    expect(getInternalRedirectPath(null)).toBeNull()
    expect(getInternalRedirectPath(undefined)).toBeNull()
    expect(getInternalRedirectPath(123)).toBeNull()
  })

  it('detects invitation redirect paths', () => {
    expect(getInvitationRedirectPath('/accept-invitation/abc')).toBe('/accept-invitation/abc')
    expect(getInvitationRedirectPath('/accept-invitation')).toBeNull()
    expect(getInvitationRedirectPath('/accept-invitation/abc?x=1')).toBe('/accept-invitation/abc?x=1')
    expect(getInvitationRedirectPath('/other')).toBeNull()
  })

  it('allows signup when public signup is enabled', () => {
    expect(canAccessSignup({ authPublicSignupEnabled: true, redirectQuery: null })).toBe(true)
    expect(canAccessSignup({ authPublicSignupEnabled: true, redirectQuery: 'https://evil.com' })).toBe(true)
  })

  it('allows signup in invite-only mode only from invitation redirect context', () => {
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/accept-invitation/abc' })).toBe(true)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/accept-invitation' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/notes' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: 'https://example.com' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/signup-access.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

```ts
export function getInternalRedirectPath(redirectQuery: unknown): string | null {
  if (typeof redirectQuery !== 'string')
    return null
  if (!redirectQuery.startsWith('/'))
    return null
  return redirectQuery
}

export function getInvitationRedirectPath(redirectQuery: unknown): string | null {
  const redirectPath = getInternalRedirectPath(redirectQuery)
  if (!redirectPath)
    return null
  if (!redirectPath.startsWith('/accept-invitation/'))
    return null
  return redirectPath
}

export function canAccessSignup(options: {
  authPublicSignupEnabled: boolean
  redirectQuery: unknown
}): boolean {
  if (options.authPublicSignupEnabled)
    return true
  return Boolean(getInvitationRedirectPath(options.redirectQuery))
}
```

Modify `apps/web/nuxt.config.ts` (add `authPublicSignupEnabled`):

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      authEnabled: process.env.AUTH_DISABLED !== 'true' && Boolean(process.env.DATABASE_URL),
      githubOAuthEnabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      authPublicSignupEnabled: process.env.AUTH_PUBLIC_SIGNUP === 'true',
    },
  },
})
```

Modify `apps/web/app/middleware/auth.global.ts`:

```ts
import { canAccessSignup } from '../utils/signup-access'

const PUBLIC_ROUTES = new Set(['/login'])
const PUBLIC_ROUTE_PREFIXES = ['/accept-invitation/']

export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { authEnabled, authPublicSignupEnabled } } = useRuntimeConfig()

  if (!authEnabled)
    return

  if (PUBLIC_ROUTES.has(to.path))
    return

  if (PUBLIC_ROUTE_PREFIXES.some(prefix => to.path.startsWith(prefix)))
    return

  if (to.path === '/signup') {
    const allowed = canAccessSignup({
      authPublicSignupEnabled,
      redirectQuery: to.query.redirect,
    })

    if (!allowed)
      return navigateTo(`/login?redirect=${encodeURIComponent('/')}&reason=invite-only`)

    return
  }

  const { authClient } = await import('../composables/useAuth')
  const session = await authClient.getSession()

  if (!session.data?.session)
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}&reason=auth-required`)
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/signup-access.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/signup-access.ts \
  apps/web/app/utils/signup-access.test.ts \
  apps/web/app/middleware/auth.global.ts \
  apps/web/nuxt.config.ts
git commit -m "$(cat <<'EOF'
feat(web): gate public signup behind invite-only mode

EOF
)"
```

---

### Task 2: CallbackURL + onboarding cohérents (email + social login/signup) (TDD)

**Files:**

- Create: `apps/web/app/utils/auth-callback-url.ts`
- Create: `apps/web/app/utils/auth-callback-url.test.ts`
- Modify: `apps/web/app/pages/login.vue`
- Modify: `apps/web/app/pages/signup.vue`
- Modify: `apps/web/app/pages/accept-invitation/[id].vue`

**Interfaces:**

```ts
export function getAuthCallbackUrl(redirectQuery: unknown, defaultUrl: string): string
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'

import { getAuthCallbackUrl } from './auth-callback-url'

describe('getAuthCallbackUrl', () => {
  it('uses internal redirect when provided', () => {
    expect(getAuthCallbackUrl('/accept-invitation/abc', '/')).toBe('/accept-invitation/abc')
    expect(getAuthCallbackUrl('/notes', '/')).toBe('/notes')
    expect(getAuthCallbackUrl('/settings/workspace?x=1', '/')).toBe('/settings/workspace?x=1')
  })

  it('falls back to default when redirect is not a string or not internal', () => {
    expect(getAuthCallbackUrl(undefined, '/')).toBe('/')
    expect(getAuthCallbackUrl(null, '/')).toBe('/')
    expect(getAuthCallbackUrl(123, '/')).toBe('/')
    expect(getAuthCallbackUrl('https://example.com', '/')).toBe('/')
    expect(getAuthCallbackUrl('mailto:alice@example.com', '/')).toBe('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/auth-callback-url.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

```ts
export function getAuthCallbackUrl(redirectQuery: unknown, defaultUrl: string): string {
  if (typeof redirectQuery !== 'string')
    return defaultUrl
  if (!redirectQuery.startsWith('/'))
    return defaultUrl
  return redirectQuery
}
```

Modify `apps/web/app/pages/login.vue` (use helper + ensure onboarding for GitHub):

```vue
<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindDivider,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

import { authClient } from '../composables/useAuth'
import { ensureWorkspaceOnboarding } from '../composables/useOnboarding'
import { getAuthCallbackUrl } from '../utils/auth-callback-url'

const route = useRoute()
const { public: { githubOAuthEnabled } } = useRuntimeConfig()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const callbackUrl = computed(() => getAuthCallbackUrl(route.query.redirect, '/'))
const infoMessage = computed(() => {
  const reason = route.query.reason
  if (typeof reason !== 'string')
    return null
  if (reason === 'auth-required')
    return 'Connexion requise pour accéder à cette page.'
  if (reason === 'invite-only')
    return 'Les inscriptions publiques sont désactivées. Utilisez un lien d’invitation.'
  return null
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
    return
  }

  await ensureWorkspaceOnboarding()
  await navigateTo(callbackUrl.value)
}
</script>
```

Template insertion in `apps/web/app/pages/login.vue` (dans `<FluffmindCard>`, après le paragraphe “Connecte-toi …” et avant le `<form>`):

```vue
<p class="mt-2 mb-6 md3-body-md text-on-surface-variant">
  Connecte-toi à ton espace Fluffmind.
</p>

<p v-if="infoMessage" class="mt-2 mb-4 md3-body-md text-tertiary">
  {{ infoMessage }}
</p>

<form class="flex flex-col gap-4" @submit.prevent="loginWithEmail">
```

Modify `apps/web/app/pages/signup.vue` (use helper + ensure onboarding + honor redirect):

```vue
<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindDivider,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

import { authClient } from '../composables/useAuth'
import { ensureWorkspaceOnboarding } from '../composables/useOnboarding'
import { getAuthCallbackUrl } from '../utils/auth-callback-url'

const route = useRoute()
const { public: { githubOAuthEnabled } } = useRuntimeConfig()

const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const callbackUrl = computed(() => getAuthCallbackUrl(route.query.redirect, '/'))

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

async function signupWithGitHub() {
  loading.value = true
  errorMessage.value = null

  const response = await authClient.signIn.social({
    provider: 'github',
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
</script>
```

Modify `apps/web/app/pages/accept-invitation/[id].vue` (post-accept onboarding + redirect):

```vue
<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindCard,
} from '@fluffmind/design-system/src/components'

import { authClient, useAuth } from '../../composables/useAuth'
import { ensureWorkspaceOnboarding } from '../../composables/useOnboarding'
import { getAuthCallbackUrl } from '../../utils/auth-callback-url'

const route = useRoute()
const { data: authSession, isPending } = await useAuth()

const invitationId = computed(() => {
  const rawId = route.params.id
  return typeof rawId === 'string' ? rawId : ''
})

const loading = ref(false)
const accepted = ref(false)
const errorMessage = ref<string | null>(null)
const started = ref(false)

const postAcceptRedirect = computed(() => getAuthCallbackUrl(route.query.redirect, '/settings/workspace'))

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

    await ensureWorkspaceOnboarding()
    await navigateTo(postAcceptRedirect.value)
  }
  catch (error) {
    const asRecordError = error as { message?: string }
    errorMessage.value = asRecordError.message || 'Impossible d’accepter l’invitation.'
  }
  finally {
    loading.value = false
  }
}

watchEffect(() => {
  if (isPending)
    return
  void acceptInvitation()
})
</script>
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/auth-callback-url.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/auth-callback-url.ts \
  apps/web/app/utils/auth-callback-url.test.ts \
  apps/web/app/pages/login.vue \
  apps/web/app/pages/signup.vue \
  apps/web/app/pages/accept-invitation/[id].vue
git commit -m "$(cat <<'EOF'
feat(web): align auth redirect + onboarding across all providers

EOF
)"
```

---

### Task 3: Invitations sans SMTP — lien partageable + copie (TDD)

**Files:**

- Create: `apps/web/app/utils/invitations.ts`
- Create: `apps/web/app/utils/invitations.test.ts`
- Modify: `apps/web/app/pages/settings/workspace.vue`

**Interfaces:**

```ts
export function extractInvitationIdFromInviteMemberResponse(response: unknown): string | null
export function buildAcceptInvitationUrl(invitationId: string): string
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'

import { buildAcceptInvitationUrl, extractInvitationIdFromInviteMemberResponse } from './invitations'

describe('invitations', () => {
  it('builds accept-invitation URL from an invitationId', () => {
    expect(buildAcceptInvitationUrl('inv_123')).toBe('/accept-invitation/inv_123')
  })

  it('extracts invitationId from Better Auth inviteMember response shapes', () => {
    expect(extractInvitationIdFromInviteMemberResponse({ data: { id: 'inv_1' } })).toBe('inv_1')
    expect(extractInvitationIdFromInviteMemberResponse({ data: { invitationId: 'inv_2' } })).toBe('inv_2')
    expect(extractInvitationIdFromInviteMemberResponse({ invitationId: 'inv_3' })).toBe('inv_3')
    expect(extractInvitationIdFromInviteMemberResponse(null)).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({})).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({ data: null })).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({ data: { id: 123 } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/invitations.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

```ts
export function extractInvitationIdFromInviteMemberResponse(response: unknown): string | null {
  const asRecord = response as Record<string, unknown> | null
  if (!asRecord || typeof asRecord !== 'object')
    return null

  const topLevelId = asRecord.invitationId
  if (typeof topLevelId === 'string' && topLevelId.trim())
    return topLevelId

  const data = asRecord.data
  const dataRecord = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null
  if (!dataRecord)
    return null

  const id = dataRecord.id
  if (typeof id === 'string' && id.trim())
    return id

  const dataInvitationId = dataRecord.invitationId
  if (typeof dataInvitationId === 'string' && dataInvitationId.trim())
    return dataInvitationId

  return null
}

export function buildAcceptInvitationUrl(invitationId: string): string {
  return `/accept-invitation/${invitationId}`
}
```

Modify `apps/web/app/pages/settings/workspace.vue` (show invitation link + copy; extract invitationId from response):

1) Add imports + state near top:

```ts
import { extractInvitationIdFromInviteMemberResponse, buildAcceptInvitationUrl } from '../../utils/invitations'

const invitationLink = ref<string | null>(null)
const copyingInvitationLink = ref(false)
```

2) Update `inviteMember()`:

```ts
async function inviteMember() {
  const email = inviteEmail.value.trim().toLowerCase()
  if (!email) {
    inviteError.value = 'L’email est requis.'
    inviteSuccess.value = null
    invitationLink.value = null
    return
  }

  submittingInvitation.value = true
  inviteSuccess.value = null
  inviteError.value = null
  invitationLink.value = null

  try {
    const response = await authClient.organization.inviteMember({
      email,
      role: inviteRole.value,
    })

    const errorMessage = extractErrorMessage(response, 'Invitation impossible.')
    if (errorMessage) {
      inviteError.value = errorMessage
      return
    }

    const invitationId = extractInvitationIdFromInviteMemberResponse(response)
    if (!invitationId) {
      inviteError.value = 'Invitation créée, mais le lien n’est pas disponible.'
      return
    }

    const link = buildAcceptInvitationUrl(invitationId)
    invitationLink.value = link

    inviteEmail.value = ''
    inviteRole.value = 'read'
    inviteSuccess.value = 'Invitation prête (lien copiable).'
    await loadWorkspaceData(true)
  } catch (error) {
    const asRecordError = error as { message?: string }
    inviteError.value = asRecordError.message || 'Invitation impossible.'
  } finally {
    submittingInvitation.value = false
  }
}

async function copyInvitationLink() {
  if (!invitationLink.value)
    return

  copyingInvitationLink.value = true
  try {
    await navigator.clipboard.writeText(invitationLink.value)
    inviteSuccess.value = 'Lien copié dans le presse-papiers.'
  } catch (error) {
    const asRecordError = error as { message?: string }
    inviteError.value = asRecordError.message || 'Impossible de copier le lien.'
  } finally {
    copyingInvitationLink.value = false
  }
}
```

3) Update template under the existing `inviteSuccess` / `inviteError` block:

```vue
<p v-if="inviteSuccess" class="mt-4 md3-body-md text-tertiary">
  {{ inviteSuccess }}
</p>

<div v-if="invitationLink" class="mt-4">
  <p class="md3-body-md text-on-surface-variant">
    Lien d’invitation :
  </p>
  <code class="block break-all text-primary">
    {{ invitationLink }}
  </code>
  <FluffmindButton
    variant="outlined"
    size="sm"
    class="mt-2"
    :disabled="copyingInvitationLink"
    @click="copyInvitationLink"
  >
    {{ copyingInvitationLink ? 'Copie…' : 'Copier le lien' }}
  </FluffmindButton>
</div>

<p v-if="inviteError" class="mt-4 md3-body-md text-error">
  {{ inviteError }}
</p>
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web run test -- app/utils/invitations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/invitations.ts \
  apps/web/app/utils/invitations.test.ts \
  apps/web/app/pages/settings/workspace.vue
git commit -m "$(cat <<'EOF'
feat(web): show shareable invitation links in workspace settings

EOF
)"
```

---

### Task 4: Better Auth `disabledAt` + `requireSession()` enforcement (TDD)

**Files:**

- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/auth.ts`
- Modify: `apps/web/server/utils/auth.ts`
- Create: `apps/web/server/utils/auth.disabledAt.test.ts`

**Interfaces:**

```ts
// apps/web/server/utils/auth.ts
export async function requireSession(event: H3Event): Promise<{
  user: {
    id: string
    disabledAt?: Date | string | null
  }
  [key: string]: unknown
}>
```

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
    },
  }),
}))

import { requireSession } from './auth'

const event = { headers: {} } as any

describe('requireSession disabledAt enforcement', () => {
  afterEach(() => {
    delete process.env.AUTH_DISABLED
    delete process.env.DATABASE_URL
    vi.clearAllMocks()
  })

  it('throws 400 when auth is disabled by env', async () => {
    process.env.AUTH_DISABLED = 'true'
    process.env.DATABASE_URL = 'postgres://x'

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('throws 401 when there is no session', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue(null)

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('throws 403 when the Better Auth user has disabledAt set', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue({
      user: {
        id: 'user_1',
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('allows the session when disabledAt is null', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue({
      user: {
        id: 'user_1',
        disabledAt: null,
      },
    })

    await expect(requireSession(event)).resolves.toMatchObject({
      user: {
        id: 'user_1',
        disabledAt: null,
      },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/auth.disabledAt.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

Modify `packages/db/src/schema/auth.ts` (add `disabledAt` on Better Auth user table):

```ts
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text('role').default('owner'),
  disabledAt: timestamp('disabled_at'),
})
```

Modify `packages/db/src/auth.ts` (map `disabledAt` additionalFields + block session creation):

```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'

import { getDb } from './client'
import { ac, roles } from './permissions'
import * as schema from './schema/index'

function getInvitationBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || 'http://localhost:3000'
  return configured.replace(/\/+$/, '')
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required when authentication is enabled.')
  }

  return betterAuth({
    secret,
    baseURL: getInvitationBaseUrl(),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {},
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'owner',
          input: false,
        },
        disabledAt: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    plugins: [
      organization({
        ac,
        roles,
        async sendInvitationEmail(data) {
          const invitationLink = `${getInvitationBaseUrl()}/accept-invitation/${data.id}`
          // Invitation email is currently logged (transactional email integration is not implemented in this repo).
          console.log(
            '[auth] invitation link',
            JSON.stringify({
              invitationId: data.id,
              email: data.email,
              role: data.role,
              organizationId: data.organization.id,
              invitationLink,
            }),
          )
        },
        organizationHooks: {
          async afterAcceptInvitation({ member }) {
            await getDb()
              .insert(schema.memberSyncMeta)
              .values({
                memberId: member.id,
                source: 'manual',
              })
              .onConflictDoUpdate({
                target: schema.memberSyncMeta.memberId,
                set: {
                  source: 'manual',
                },
              })
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          async after(user) {
            const [{ total } = { total: 0 }] = await getDb()
              .select({ total: count() })
              .from(schema.user)

            if (Number(total) !== 1)
              return

            await getDb()
              .update(schema.user)
              .set({ role: 'admin' })
              .where(eq(schema.user.id, user.id))
          },
        },
      },
      session: {
        create: {
          async before(session) {
            const userId = (session as any).userId ?? (session as any).user?.id
            if (!userId)
              return

            const rows = await getDb()
              .select({ disabledAt: schema.user.disabledAt })
              .from(schema.user)
              .where(eq(schema.user.id, userId))
              .limit(1)

            const disabledAt = rows[0]?.disabledAt ?? null
            if (disabledAt)
              return false
          },
        },
      },
    },
  })
}

let authInstance: ReturnType<typeof createAuth> | null = null

/** Lazily initializes Better Auth so solo mode (`AUTH_DISABLED=true`) never loads it. */
export function getAuth() {
  if (!authInstance)
    authInstance = createAuth()
  return authInstance
}
```

Modify `apps/web/server/utils/auth.ts` (enforce disabledAt in `requireSession()`):

```ts
export async function requireSession(event: H3Event) {
  if (!isAuthEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Auth disabled',
      message: 'Authentication is disabled for this environment.',
    })
  }

  const session = await getSession(event)

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Authentication is required for this endpoint.',
    })
  }

  const disabledAt = (session as any).user?.disabledAt
  if (disabledAt)
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Account is disabled.',
    })

  return session
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/auth.disabledAt.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/auth.ts \
  packages/db/src/auth.ts \
  apps/web/server/utils/auth.ts \
  apps/web/server/utils/auth.disabledAt.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): enforce disabledAt across session creation + server access

EOF
)"
```

---

### Task 5: Instance admin (`user.role === 'admin'`) — UI + API endpoints (TDD for enforcement)

**Files:**

- Create: `apps/web/server/utils/admin.ts`
- Create: `apps/web/server/utils/admin.test.ts`
- Create: `apps/web/server/api/admin/users.get.ts`
- Create: `apps/web/server/api/admin/users/[userId]/role.post.ts`
- Create: `apps/web/server/api/admin/users/[userId]/disabled.post.ts`
- Create: `apps/web/server/api/admin/users/[userId]/sessions/revoke.post.ts`
- Create: `apps/web/app/pages/settings/admin.vue`
- Modify: `apps/web/app/pages/settings/index.vue`

**Interfaces:**

```ts
export const INSTANCE_ADMIN_ROLE: 'admin'
export async function requireAdminInstance(event: H3Event): Promise<unknown>
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}))

vi.mock('./auth', () => ({
  requireSession: mocks.requireSession,
}))

import { requireAdminInstance } from './admin'

const event = { headers: {} } as any

describe('requireAdminInstance', () => {
  it('allows admin instance users', async () => {
    mocks.requireSession.mockResolvedValue({
      user: { role: 'admin' },
    })

    await expect(requireAdminInstance(event)).resolves.toEqual({
      user: { role: 'admin' },
    })
  })

  it('rejects non-admin users with 403', async () => {
    mocks.requireSession.mockResolvedValue({
      user: { role: 'owner' },
    })

    await expect(requireAdminInstance(event)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/admin.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/server/utils/admin.ts`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'

import { requireSession } from './auth'

export const INSTANCE_ADMIN_ROLE = 'admin' as const

export async function requireAdminInstance(event: H3Event) {
  const session = await requireSession(event)
  const role = (session as any)?.user?.role

  if (role !== INSTANCE_ADMIN_ROLE) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Admin instance required.',
    })
  }

  return session
}
```

Create admin endpoints (all protected by `requireAdminInstance()`):

1) `apps/web/server/api/admin/users.get.ts`:

```ts
import { getDb, user } from '@fluffmind/db'
import { desc } from 'drizzle-orm'

import { requireAdminInstance } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const query = getQuery(event)
  const limitRaw = query.limit
  const limit = typeof limitRaw === 'string' ? Math.max(1, Number(limitRaw) || 50) : 50

  const db = getDb()
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      disabledAt: user.disabledAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit)

  return {
    users: rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    })),
  }
})
```

2) `apps/web/server/api/admin/users/[userId]/role.post.ts`:

```ts
import { getDb, user } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { readJsonBody } from '../../../../utils/read-json-body'
import { requireAdminInstance } from '../../../../utils/admin'

type UpdateRoleBody = {
  role: 'admin' | 'owner'
}

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const body = await readJsonBody<UpdateRoleBody>(event)
  if (body?.role !== 'admin' && body?.role !== 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role',
      message: '"role" must be "admin" or "owner".',
    })
  }

  const db = getDb()
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  await db.update(user).set({ role: body.role }).where(eq(user.id, userId))

  return { ok: true }
})
```

3) `apps/web/server/api/admin/users/[userId]/disabled.post.ts`:

```ts
import { getDb, user } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { readJsonBody } from '../../../../utils/read-json-body'
import { requireAdminInstance } from '../../../../utils/admin'

type DisableBody = {
  disabled: boolean
}

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const body = await readJsonBody<DisableBody>(event)
  if (typeof body?.disabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"disabled" must be a boolean.',
    })
  }

  const db = getDb()
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  const disabledAt = body.disabled ? new Date() : null
  await db.update(user).set({ disabledAt }).where(eq(user.id, userId))

  return { ok: true }
})
```

4) `apps/web/server/api/admin/users/[userId]/sessions/revoke.post.ts`:

```ts
import { getDb, session } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const db = getDb()
  await db.delete(session).where(eq(session.userId, userId))

  return { ok: true }
})
```

Admin UI:

1) Create `apps/web/app/pages/settings/admin.vue`:

```vue
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
  } catch (error) {
    const asRecordError = error as { data?: { message?: string }, message?: string }
    pageError.value = asRecordError.data?.message || asRecordError.message || 'Impossible de charger les users.'
  } finally {
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
          Chargement des users…
        </p>
      </template>

      <template v-else>
        <ul class="divide-y divide-outline-variant">
          <li v-for="u in users" :key="u.id" class="py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="md3-title-sm">
                  {{ u.name }} <span class="text-on-surface-variant">({{ u.email }})</span>
                </p>
                <p class="md3-body-md text-on-surface-variant break-all">
                  {{ u.id }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <FluffmindChip class="uppercase">
                    {{ u.role }}
                  </FluffmindChip>
                  <FluffmindChip v-if="u.disabledAt" variant="outlined">
                    disabled
                  </FluffmindChip>
                  <FluffmindChip v-else variant="outlined">
                    enabled
                  </FluffmindChip>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <FluffmindButton variant="outlined" size="sm" @click="promoteOrDemote(u)">
                  {{ u.role === 'admin' ? 'Rétrograder admin' : 'Promouvoir admin' }}
                </FluffmindButton>
                <FluffmindButton
                  variant="outlined"
                  size="sm"
                  @click="setDisabled(u, !u.disabledAt)"
                >
                  {{ u.disabledAt ? 'Réactiver compte' : 'Désactiver compte' }}
                </FluffmindButton>
                <FluffmindButton variant="tonal" size="sm" @click="revokeSessions(u)">
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
```

2) Modify `apps/web/app/pages/settings/index.vue` to link to `/settings/admin` when auth is enabled:

```vue
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
  <NuxtLink to="/settings/admin" class="mt-4 inline-block">
    <FluffmindButton variant="tonal" size="sm">
      Administration →
    </FluffmindButton>
  </NuxtLink>
  <p v-if="!data.githubOAuthConfigured" class="mt-4 md3-body-md text-on-surface-variant">
    Login GitHub non configuré — seule la connexion email est disponible.
  </p>
</FluffmindCard>
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/admin.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/admin.ts \
  apps/web/server/utils/admin.test.ts \
  apps/web/server/api/admin/users.get.ts \
  apps/web/server/api/admin/users/[userId]/role.post.ts \
  apps/web/server/api/admin/users/[userId]/disabled.post.ts \
  apps/web/server/api/admin/users/[userId]/sessions/revoke.post.ts \
  apps/web/app/pages/settings/admin.vue \
  apps/web/app/pages/settings/index.vue
git commit -m "$(cat <<'EOF'
feat(admin): add admin instance enforcement + user/session management UI/API

EOF
)"
```

---

## Spec coverage checklist

- Invite-only signup default using `AUTH_PUBLIC_SIGNUP` + middleware gating: Task 1
- Social login (GitHub) + signup flows: Task 2
- Onboarding + redirect consistency (callbackURL / redirect): Task 2 (+ accept-invitation)
- Invitation UI without SMTP: Task 3
- `disabledAt` field + `requireSession()` enforcement: Task 4
- Admin instance UI + API endpoints: Task 5
- Unit tests (Vitest) for pure helpers + server enforcement: Tasks 1–5

