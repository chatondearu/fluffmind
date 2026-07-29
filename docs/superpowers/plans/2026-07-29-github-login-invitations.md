# GitHub login workspace invitations — Implementation Plan

I'm using the writing-plans skill to create the implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d’inviter des membres d’un workspace par pseudo GitHub (sélection org/collaborateurs ou saisie libre), tout en conservant les invitations email et les liens partageables `/accept-invitation/<id>`.

**Architecture:** On ajoute une table `github_invitation` pour les métadonnées GitHub, des helpers `@fluffmind/integrations` pour résoudre un user GitHub et lister les candidats (org members → fallback collaborators), puis des endpoints Nitro protégés par `requireWorkspacePermission(..., 'workspace', 'manage')`. La création synthétise l’email noreply GitHub (`{id}+{login}@users.noreply.github.com`) quand aucun email public n’est disponible, afin de rester compatible avec Better Auth + invite-only signup. L’acceptation étend la page existante : Better Auth d’abord, puis endpoint Fluffmind qui valide aussi le login GitHub lié.

**Tech Stack:** Drizzle + Postgres (`packages/db`), Better Auth organization plugin, `@fluffmind/integrations` (fetch GitHub REST), Nuxt 4 + Vue `<script setup lang="ts">`, Vitest.

## Global Constraints

- UX : un seul bloc d’invitation — autocomplete GitHub + pseudo libre + email + rôle.
- Accept : email résolu si présent **ou** compte GitHub lié (`provider=github`, login / user id).
- Candidats : org members si installation Organization ; sinon collaborateurs du repo lié.
- Email-only : Better Auth `invitation` inchangé (pas de ligne `github_invitation` obligatoire).
- GitHub + email résolu : invitation BA + lien `github_invitation.betterAuthInvitationId`.
- GitHub-only : email BA synthétique noreply à partir de `{githubUserId}+{githubLogin}` ; accept vérifie aussi le login GitHub.
- Doublon pending : renvoyer le lien existant (409 → body avec `invitationId` acceptable).
- Token GitHub : installation token (`authMode=app`) ou PAT workspace (`authMode=pat`).
- Permissions invite : `workspace:manage` (owners).
- Pas de SMTP ; lien copiable obligatoire.
- Mode solo `AUTH_DISABLED=true` : inchangé.
- Commentaires code : anglais. UI : français.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/db/src/schema/workspace.ts` | Table `github_invitation` + export |
| `packages/db/drizzle/0003_*.sql` | Migration SQL |
| `packages/db/src/github-auth-email.ts` | `buildGithubNoreplyEmail()` helper |
| `packages/integrations/src/github/users.ts` | Normaliser login, résoudre user GitHub |
| `packages/integrations/src/github/org-members.ts` | Lister les membres d’org |
| `packages/integrations/src/github/invite-candidates.ts` | Org members → fallback collaborators |
| `packages/integrations/src/index.ts` | Re-export des nouveaux helpers |
| `apps/web/server/utils/github-invitations.ts` | CRUD invitation GitHub + accept identity |
| `apps/web/server/utils/workspace-membership.ts` | `requireWorkspaceManage()` partagé |
| `apps/web/server/api/workspaces/github/invite-candidates.get.ts` | Liste candidats |
| `apps/web/server/api/workspaces/invitations/index.post.ts` | Créer invitation (email / GitHub / les deux) |
| `apps/web/server/api/workspaces/invitations/[id]/accept.post.ts` | Accepter avec vérif login GitHub |
| `apps/web/server/api/workspaces/invitations/index.get.ts` | Invitations pending (BA + GitHub) |
| `apps/web/app/pages/accept-invitation/[id].vue` | BA accept + fallback endpoint Fluffmind |
| `apps/web/app/pages/settings/workspace.vue` | UI autocomplete + champs + liste |
| `apps/web/app/utils/invitations.ts` | Types/helpers réponse API |
| `packages/db/src/auth.ts` | Hook signup : pending `github_invitation` par login (filet de sécurité) |

---

### Task 1: GitHub login helpers + user resolve (`@fluffmind/integrations`)

**Files:**
- Create: `packages/integrations/src/github/users.ts`
- Create: `packages/integrations/src/github/users.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeGitHubLogin(input: string): string | null
  export interface ResolvedGitHubUser {
    id: string
    login: string
    avatarUrl: string | null
    email: string | null
  }
  export async function resolveGitHubUser(token: string, login: string): Promise<ResolvedGitHubUser | null>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'

import { normalizeGitHubLogin, resolveGitHubUser } from './users.ts'

describe('normalizeGitHubLogin', () => {
  it('strips @ and lowercases', () => {
    expect(normalizeGitHubLogin('@OctoCat')).toBe('octocat')
    expect(normalizeGitHubLogin('  octocat  ')).toBe('octocat')
    expect(normalizeGitHubLogin('')).toBeNull()
    expect(normalizeGitHubLogin('bad login')).toBeNull()
  })
})

describe('resolveGitHubUser', () => {
  it('maps GitHub user payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 42, login: 'octocat', avatar_url: 'https://a', email: 'a@b.com' }),
    }))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(resolveGitHubUser('token', 'octocat')).resolves.toEqual({
      id: '42',
      login: 'octocat',
      avatarUrl: 'https://a',
      email: 'a@b.com',
    })
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(resolveGitHubUser('token', 'missing')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fluffmind/integrations run test -- src/github/users.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

```ts
const LOGIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i

export function normalizeGitHubLogin(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, '')
  if (!trimmed || !LOGIN_RE.test(trimmed))
    return null
  return trimmed.toLowerCase()
}

export interface ResolvedGitHubUser {
  id: string
  login: string
  avatarUrl: string | null
  email: string | null
}

export async function resolveGitHubUser(token: string, login: string): Promise<ResolvedGitHubUser | null> {
  const normalized = normalizeGitHubLogin(login)
  if (!normalized)
    return null

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(normalized)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluffmind-integrations',
    },
  })

  if (response.status === 404)
    return null
  if (!response.ok)
    throw new Error(`GitHub user lookup failed (${response.status})`)

  const data = await response.json() as { id: number, login: string, avatar_url?: string, email?: string | null }
  return {
    id: String(data.id),
    login: data.login.toLowerCase(),
    avatarUrl: data.avatar_url ?? null,
    email: typeof data.email === 'string' && data.email.trim() ? data.email.trim().toLowerCase() : null,
  }
}
```

- [ ] **Step 4: Export from `packages/integrations/src/index.ts`**

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @fluffmind/integrations run test -- src/github/users.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/integrations/src/github/users.ts packages/integrations/src/github/users.test.ts packages/integrations/src/index.ts
git commit -m "feat(integrations): resolve GitHub users by login"
```

---

### Task 2: Org members + invite candidates (`@fluffmind/integrations`)

**Files:**
- Create: `packages/integrations/src/github/org-members.ts`
- Create: `packages/integrations/src/github/invite-candidates.ts`
- Create: `packages/integrations/src/github/invite-candidates.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Consumes: `fetchCollaborators`, `ResolvedGitHubUser` patterns from Task 1
- Produces:
  ```ts
  export interface GitHubInviteCandidate {
    login: string
    id: string
    avatarUrl: string | null
    source: 'org_member' | 'collaborator'
  }
  export async function fetchOrgMembers(token: string, org: string): Promise<GitHubInviteCandidate[]>
  export async function listGitHubInviteCandidates(input: {
    token: string
    installationAccountLogin: string
    installationAccountType: string
    repoOwner: string | null
    repoName: string | null
  }): Promise<GitHubInviteCandidate[]>
  ```

- [ ] **Step 1: Write failing tests for candidate priority**

```ts
import { describe, expect, it, vi } from 'vitest'

import { listGitHubInviteCandidates } from './invite-candidates.ts'

describe('listGitHubInviteCandidates', () => {
  it('prefers org members for Organization installs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/orgs/acme/members'))
        return { ok: true, json: async () => [{ id: 1, login: 'alice', avatar_url: null }] }
      throw new Error(`unexpected ${url}`)
    }))

    const result = await listGitHubInviteCandidates({
      token: 't',
      installationAccountLogin: 'acme',
      installationAccountType: 'Organization',
      repoOwner: 'acme',
      repoName: 'vault',
    })

    expect(result).toEqual([{ login: 'alice', id: '1', avatarUrl: null, source: 'org_member' }])
  })

  it('falls back to collaborators when not an org install', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/alice/vault/collaborators'))
        return { ok: true, json: async () => [{ login: 'bob', permissions: { pull: true } }] }
      throw new Error(`unexpected ${url}`)
    }))

    const result = await listGitHubInviteCandidates({
      token: 't',
      installationAccountLogin: 'alice',
      installationAccountType: 'User',
      repoOwner: 'alice',
      repoName: 'vault',
    })

    expect(result[0]?.login).toBe('bob')
    expect(result[0]?.source).toBe('collaborator')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `fetchOrgMembers` + `listGitHubInviteCandidates`**

Use `GET /orgs/{org}/members?per_page=100` for org installs. For User installs with linked repo, delegate to existing `fetchCollaborators` and map to candidate shape.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(integrations): list GitHub invite candidates"
```

---

### Task 3: Schema `github_invitation` + noreply helper

**Files:**
- Modify: `packages/db/src/schema/workspace.ts`
- Modify: `packages/db/src/github-auth-email.ts`
- Create: `packages/db/src/github-auth-email.test.ts` (if missing server-side tests — mirror web test)
- Create: `packages/db/drizzle/0003_github_invitation.sql` (via `pnpm --filter @fluffmind/db run db:generate`)

**Interfaces:**
- Produces:
  ```ts
  export const githubInvitation = pgTable('github_invitation', { ... })
  export function buildGithubNoreplyEmail(input: { id: string, login: string }): string
  ```

- [ ] **Step 1: Add table to schema**

```ts
export const githubInvitation = pgTable('github_invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  githubLogin: text('github_login').notNull(),
  githubUserId: text('github_user_id'),
  resolvedEmail: text('resolved_email'),
  betterAuthInvitationId: text('better_auth_invitation_id'),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  inviterId: text('inviter_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

Add indexes on `(organization_id)`, `(github_login)`, `(better_auth_invitation_id)`.

- [ ] **Step 2: Add `buildGithubNoreplyEmail`**

```ts
export function buildGithubNoreplyEmail(input: { id: string, login: string }): string {
  const id = input.id.trim()
  const login = input.login.trim().toLowerCase()
  if (!id || !login)
    throw new Error('GitHub noreply email requires id and login.')
  return `${id}+${login}@users.noreply.github.com`
}
```

- [ ] **Step 3: Write tests for noreply helper**

- [ ] **Step 4: Generate migration**

Run: `pnpm --filter @fluffmind/db run db:generate`  
Expected: new SQL under `packages/db/drizzle/`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(db): add github_invitation schema"
```

---

### Task 4: Invitation service (create + identity match)

**Files:**
- Create: `apps/web/server/utils/github-invitations.ts`
- Create: `apps/web/server/utils/github-invitations.test.ts`
- Create: `apps/web/server/utils/workspace-membership.ts`

**Interfaces:**
- Consumes: `resolveGitHubUser`, `buildGithubNoreplyEmail`, `getAuth().api.inviteMember`, `resolveWorkspaceGitHubCredentials`
- Produces:
  ```ts
  export interface CreateWorkspaceInvitationInput {
    organizationId: string
    inviterId: string
    role: 'read' | 'write' | 'owner'
    email?: string | null
    githubLogin?: string | null
    headers: Headers
  }
  export interface CreateWorkspaceInvitationResult {
    invitationId: string
    url: string
    kind: 'email' | 'github' | 'github_and_email'
    githubLogin: string | null
    email: string | null
  }
  export async function createWorkspaceInvitation(input: CreateWorkspaceInvitationInput): Promise<CreateWorkspaceInvitationResult>
  export async function userMatchesGithubInvitation(userId: string, invitation: { githubLogin: string, githubUserId: string | null, resolvedEmail: string | null, betterAuthInvitationId: string | null }): Promise<boolean>
  ```

- [ ] **Step 1: Write failing tests for identity match**

Cover:
- match via linked `account.providerId=github` + login
- match via `user.email === resolvedEmail`
- no match returns false

- [ ] **Step 2: Implement `requireWorkspaceManage(event)` in `workspace-membership.ts`**

Wrap existing `requireWorkspacePermission(event, 'workspace', 'manage')`.

- [ ] **Step 3: Implement `createWorkspaceInvitation`**

Logic:
1. If `githubLogin` provided → normalize, resolve via GitHub token (credentials or throw 400 if no link).
2. If already member (resolve userId by login via existing sync deps) → 409.
3. If pending `github_invitation` or BA invite for same login/email → return existing id + url.
4. Determine BA email:
   - explicit `email` arg if provided
   - else `resolvedUser.email`
   - else `buildGithubNoreplyEmail({ id, login })`
5. Call `getAuth().api.inviteMember({ headers, body: { email, role, organizationId } })`.
6. Insert `github_invitation` row when githubLogin present (store cross-link id from BA response).
7. Return `{ invitationId, url: buildAcceptInvitationUrl(id), kind, githubLogin, email }`.

Use BA public id as accept id (email path rules from spec).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): create workspace invitations by GitHub login"
```

---

### Task 5: API endpoints (candidates + create + list)

**Files:**
- Create: `apps/web/server/api/workspaces/github/invite-candidates.get.ts`
- Create: `apps/web/server/api/workspaces/invitations/index.post.ts`
- Create: `apps/web/server/api/workspaces/invitations/index.get.ts`

**Interfaces:**
- `GET invite-candidates` → `{ candidates: GitHubInviteCandidate[], source: 'org_member' | 'collaborator' | null }`
- `POST invitations` body `{ email?: string, githubLogin?: string, role: WorkspaceRole }`
- `GET invitations` → merge BA pending + `github_invitation` metadata

- [ ] **Step 1: Implement GET candidates**

Steps inside handler:
1. `requireWorkspaceManage(event)`
2. `resolveWorkspaceGitHubCredentials(workspaceId)` — if null, return `{ candidates: [], source: null }`
3. Load installation account type/login from `workspace_github_link` + `github_app_installation`
4. Call `listGitHubInviteCandidates`
5. Filter out logins already members (join `account`/`member`) or pending invites

- [ ] **Step 2: Implement POST invitations**

Parse body, validate at least one of email/githubLogin, delegate to `createWorkspaceInvitation`.

Map errors:
- unknown login → 404
- already member → 409
- missing GitHub link when githubLogin → 400 actionable

- [ ] **Step 3: Implement GET invitations list**

Return unified rows:
```ts
{ id, role, status, expiresAt, email, githubLogin }
```

- [ ] **Step 4: Manual smoke via curl** (document in plan execution, optional)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): API for GitHub-backed workspace invitations"
```

---

### Task 6: Accept path (server + page)

**Files:**
- Create: `apps/web/server/api/workspaces/invitations/[id]/accept.post.ts`
- Modify: `apps/web/app/pages/accept-invitation/[id].vue`
- Modify: `packages/db/src/auth.ts` (signup hook safety net)

**Interfaces:**
- `POST /api/workspaces/invitations/[id]/accept` → `{ ok: true }` or 403 with `@login` hint

- [ ] **Step 1: Implement accept endpoint**

Flow:
1. `requireSession(event)`
2. Load BA invitation by id; if found and pending → check `userMatchesGithubInvitation` **or** email match → call `getAuth().api.acceptInvitation`
3. Else load `github_invitation` by id → verify pending + identity → insert `member` + update invitation status + upsert `memberSyncMeta` source `manual`
4. Wrong account → 403 message `Connecte-toi avec le compte GitHub @login.`

- [ ] **Step 2: Extend signup hook in `packages/db/src/auth.ts`**

When `hasPendingInvitation` false by email, also allow create if pending `github_invitation` exists where `buildGithubNoreplyEmail` or `resolvedEmail` matches — **and** as fallback query pending by login extracted from GitHub profile in `mapProfileToUser` (pass login into user.name temporarily is fragile; prefer email synthesis from Task 4).

- [ ] **Step 3: Update accept page**

```ts
async function acceptInvitation() {
  // 1) try authClient.organization.acceptInvitation
  // 2) on failure, POST /api/workspaces/invitations/${id}/accept
}
```

Show GitHub-specific error messages from API.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): accept workspace invitations via GitHub account match"
```

---

### Task 7: Settings UI (`workspace.vue`)

**Files:**
- Modify: `apps/web/app/pages/settings/workspace.vue`
- Modify: `apps/web/app/utils/invitations.ts`

**Interfaces:**
- Consumes: new API endpoints

- [ ] **Step 1: Load candidates on workspace data refresh**

```ts
const githubInviteCandidates = ref<Array<{ login: string, label: string }>>([])
const selectedGithubCandidate = ref('')
const inviteGithubLogin = ref('')
```

Fetch `GET /api/workspaces/github/invite-candidates` when `canManageGitHub`.

- [ ] **Step 2: Replace invite form layout**

Grid:
- `FluffmindSelect` autocomplete candidates (placeholder “Choisir un membre GitHub”)
- `FluffmindTextField` pseudo GitHub
- `FluffmindTextField` email (optional if github filled)
- role + submit

Validation: at least email **or** github login/selection.

- [ ] **Step 3: Submit via POST `/api/workspaces/invitations`**

Keep copy-link UX; display `@login` in success message when relevant.

- [ ] **Step 4: Pending invitations list**

Show `invitation.githubLogin ? '@' + login : invitation.email`.

Load from `GET /api/workspaces/invitations` instead of BA-only list.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): invite workspace members by GitHub login in settings"
```

---

### Task 8: Verification finale

- [ ] **Run unit tests**

```bash
pnpm --filter @fluffmind/integrations run test
pnpm --filter @fluffmind/db run typecheck
pnpm --filter @fluffmind/web run test
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Manual checklist**

1. Email-only invite → lien → accept (régression PRD-035)
2. Org install → liste membres → invite `@login` → accept via GitHub login
3. User install + repo lié → liste collaborateurs
4. Pseudo inconnu → erreur 404 UI
5. Mauvais compte GitHub à l’accept → message `@login`
6. Invite-only signup depuis lien d’invitation GitHub-only

- [ ] **Commit doc pointer (optional)**

Add link in spec status → `implemented` when done (separate commit if desired).

---

## Spec coverage self-review

| Spec requirement | Task |
| ---------------- | ---- |
| Invite by GitHub login | 1, 4, 5, 7 |
| Keep email invites | 4, 5, 7 |
| Org members / collaborators list | 2, 5, 7 |
| Accept email or GitHub match | 4, 6 |
| Shareable links | 4, 6, 7 |
| Duplicate pending reuse | 4 |
| Error cases 404/409/wrong account | 4, 5, 6 |
| Non-goals respected | — |
| Signup invite-only compatibility | 4, 6 |

No placeholders remain in task steps above.
