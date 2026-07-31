# Admin GitHub App Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give instance admins a GitHub panel on `/settings/admin` to inspect App status/installations and recover via resync, unlink-all, and remove-from-DB.

**Architecture:** New `/api/admin/github/*` routes gated by `requireAdminInstance`. Helper `admin-github.ts` lists installations with linked workspaces and performs unlink-all (keep installation row). Reuse `fetchGitHubAppStatus`, `fetchInstallationAccount`, `upsertGithubAppInstallation`, `removeGithubAppInstallation`. UI is a third panel on existing `admin.vue`.

**Tech Stack:** Nitro/h3, Drizzle, Vue `<script setup lang="ts">`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`  
**PRD:** `prd/PRD-040-admin-github-panel.md`  
**ADR:** `foam/decisions/ADR-014-admin-github-panel.md`

## Global Constraints

- Instance admin only — every route calls `requireAdminInstance` (`user.role === 'admin'`).
- No schema migration.
- Destructive ops (unlink-all, remove-from-DB) require body `{ confirmInstallationId }` matching the installation id.
- Resync has no confirm.
- Remove-from-DB must not call GitHub to uninstall the App or delete remote repos.
- Unlink-all must keep the `github_app_installation` row.
- ASCII-only `statusMessage`; detail in `message`.
- Vue: `<script setup lang="ts>` + typed props; UI copy in French; code comments in English.
- Imports: extensionless in `apps/web`.
- Conventional Commits: `feat(web):`, `test(web):`, `docs:`.
- Verify: `pnpm --filter @fluffmind/web exec vitest run server/utils/admin-github.test.ts`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/server/utils/admin-github.ts` | List + confirm + unlink-all + resync orchestration |
| `apps/web/server/utils/admin-github.test.ts` | Unit tests |
| `apps/web/server/api/admin/github/index.get.ts` | Bundle status + installations + installUrl |
| `apps/web/server/api/admin/github/installations/[installationId]/resync.post.ts` | Resync |
| `apps/web/server/api/admin/github/installations/[installationId]/unlink-workspaces.post.ts` | Unlink-all |
| `apps/web/server/api/admin/github/installations/[installationId]/index.delete.ts` | Remove-from-DB |
| `apps/web/app/pages/settings/admin.vue` | GitHub panel UI |
| `plans/PLAN-040-admin-github-panel.md` | Foam pointer |
| PRD-040 / ADR-014 → shipped/accepted when done |

---

### Task 1: Helper list + confirm + unlink-all (TDD)

**Files:**
- Create: `apps/web/server/utils/admin-github.ts`
- Create: `apps/web/server/utils/admin-github.test.ts`

**Interfaces:**
```ts
export interface AdminGithubLinkedWorkspace {
  organizationId: string
  name: string
  slug: string
  owner: string
  repo: string
}

export interface AdminGithubInstallationRow {
  id: string
  installationId: string
  accountLogin: string
  accountType: string
  createdAt: string
  updatedAt: string
  linkedWorkspaces: AdminGithubLinkedWorkspace[]
}

export function assertConfirmInstallationId(expected: string, provided: unknown): void

export async function listAdminGithubInstallations(): Promise<AdminGithubInstallationRow[]>

export async function unlinkAllWorkspacesForInstallation(installationId: string): Promise<{ unlinked: number }>
```

- [ ] **Step 1: Write failing tests**

Create `admin-github.test.ts` following `admin-workspaces.test.ts` patterns (`vi.hoisted`, mock `@fluffmind/db`, stub `createError`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  githubAppInstallation: {
    id: 'id',
    installationId: 'installationId',
    accountLogin: 'accountLogin',
    accountType: 'accountType',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    installationId: 'installationId',
    owner: 'owner',
    repo: 'repo',
  },
  organization: { id: 'id', name: 'name', slug: 'slug' },
  workspaceConfig: { organizationId: 'organizationId', gitRemoteUrl: 'gitRemoteUrl' },
}))

const { assertConfirmInstallationId, listAdminGithubInstallations, unlinkAllWorkspacesForInstallation }
  = await import('./admin-github')

beforeEach(() => {
  vi.stubGlobal('createError', (options: Record<string, unknown>) => {
    const error = new Error(String(options.message || options.statusMessage))
    Object.assign(error, options)
    return error
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('assertConfirmInstallationId', () => {
  it('throws 400 when id mismatches', () => {
    expect(() => assertConfirmInstallationId('123', '456')).toThrow(
      expect.objectContaining({ statusCode: 400, statusMessage: 'Confirmation mismatch' }),
    )
  })

  it('passes when id matches', () => {
    expect(() => assertConfirmInstallationId('123', '123')).not.toThrow()
  })
})

describe('listAdminGithubInstallations', () => {
  it('returns installations with linked workspaces', async () => {
    // Mock drizzle chains: select installations; select links joined to organization
    // One installation "123" linked to org "org-1" / slug alpha / owner acme repo handbook
    const result = await listAdminGithubInstallations()
    expect(result).toHaveLength(1)
    expect(result[0]!.installationId).toBe('123')
    expect(result[0]!.linkedWorkspaces).toEqual([
      expect.objectContaining({ organizationId: 'org-1', slug: 'alpha', owner: 'acme', repo: 'handbook' }),
    ])
  })
})

describe('unlinkAllWorkspacesForInstallation', () => {
  it('deletes links and clears gitRemoteUrl but does not delete installation', async () => {
    // Assert delete(workspaceGithubLink) called; update workspaceConfig; never delete githubAppInstallation
    const result = await unlinkAllWorkspacesForInstallation('123')
    expect(result.unlinked).toBe(1)
  })

  it('throws 404 when installation missing', async () => {
    await expect(unlinkAllWorkspacesForInstallation('missing')).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Installation not found',
    })
  })
})
```

Wire mocks to match how the implementation queries (look at `github-sync.test.ts` / `admin-workspaces.test.ts` for chain style).

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @fluffmind/web exec vitest run server/utils/admin-github.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
import { getDb, githubAppInstallation, organization, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

export function assertConfirmInstallationId(expected: string, provided: unknown): void {
  if (typeof provided !== 'string' || provided.trim() !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Confirmation mismatch',
      message: `Type "${expected}" to confirm this action.`,
    })
  }
}

export async function listAdminGithubInstallations(): Promise<AdminGithubInstallationRow[]> {
  const db = getDb()
  const installations = await db.select().from(githubAppInstallation)

  const links = await db
    .select({
      installationId: workspaceGithubLink.installationId,
      organizationId: workspaceGithubLink.organizationId,
      owner: workspaceGithubLink.owner,
      repo: workspaceGithubLink.repo,
      name: organization.name,
      slug: organization.slug,
    })
    .from(workspaceGithubLink)
    .innerJoin(organization, eq(organization.id, workspaceGithubLink.organizationId))

  return installations.map((row) => ({
    id: row.id,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    linkedWorkspaces: links
      .filter(link => link.installationId === row.installationId)
      .map(link => ({
        organizationId: link.organizationId,
        name: link.name,
        slug: link.slug,
        owner: link.owner,
        repo: link.repo,
      })),
  }))
}

export async function unlinkAllWorkspacesForInstallation(installationId: string): Promise<{ unlinked: number }> {
  const db = getDb()
  const [existing] = await db
    .select({ installationId: githubAppInstallation.installationId })
    .from(githubAppInstallation)
    .where(eq(githubAppInstallation.installationId, installationId))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  const linked = await db
    .select({ organizationId: workspaceGithubLink.organizationId })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.installationId, installationId))

  await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.installationId, installationId))

  for (const link of linked) {
    await db
      .update(workspaceConfig)
      .set({ gitRemoteUrl: null })
      .where(eq(workspaceConfig.organizationId, link.organizationId))
  }

  return { unlinked: linked.length }
}
```

Do **not** call `removeGithubAppInstallation` here.

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/admin-github.ts apps/web/server/utils/admin-github.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add admin github installations helper

EOF
)"
```

---

### Task 2: GET bundle + resync route

**Files:**
- Create: `apps/web/server/api/admin/github/index.get.ts`
- Create: `apps/web/server/api/admin/github/installations/[installationId]/resync.post.ts`
- Modify: `apps/web/server/utils/admin-github.ts` — add `resyncAdminGithubInstallation`

**Interfaces:**
```ts
export async function resyncAdminGithubInstallation(installationId: string): Promise<AdminGithubInstallationRow>
```

- [ ] **Step 1: Write failing test for resync**

```ts
it('resync upserts account from GitHub and returns updated row', async () => {
  // mock find + fetchInstallationAccount + upsert; assert returned accountLogin
})

it('resync throws 404 when installation missing in DB', async () => {
  // ...
})
```

Mock `./github-installations` module for `fetchInstallationAccount` / `upsertGithubAppInstallation` / or call them via imports with vi.mock.

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```ts
export async function resyncAdminGithubInstallation(installationId: string): Promise<AdminGithubInstallationRow> {
  const db = getDb()
  const [existing] = await db.select().from(githubAppInstallation)
    .where(eq(githubAppInstallation.installationId, installationId)).limit(1)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  try {
    const account = await fetchInstallationAccount(installationId)
    await upsertGithubAppInstallation({
      installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
    })
  }
  catch (error) {
    // If fetchInstallationAccount already throws H3 404, rethrow
    // Otherwise wrap unknown errors as 502 GitHub App request failed
    if (error && typeof error === 'object' && 'statusCode' in error)
      throw error
    throw createError({
      statusCode: 502,
      statusMessage: 'GitHub App request failed',
      message: error instanceof Error ? error.message : 'Failed to refresh installation from GitHub.',
    })
  }

  const rows = await listAdminGithubInstallations()
  const row = rows.find(r => r.installationId === installationId)
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `Installation "${installationId}" disappeared after resync.`,
    })
  }
  return row
}
```

`index.get.ts`:

```ts
import { requireAdminInstance } from '../../../utils/admin'
import { listAdminGithubInstallations } from '../../../utils/admin-github'
import { fetchGitHubAppStatus } from '../../../utils/github-app-status'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const appStatus = await fetchGitHubAppStatus()
  const installations = await listAdminGithubInstallations()
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null
  return { appStatus, installations, installUrl }
})
```

`resync.post.ts`:

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const installation = await resyncAdminGithubInstallation(installationId)
  return { ok: true, installation }
})
```

- [ ] **Step 4: Tests PASS + typecheck**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin github status and resync endpoints

EOF
)"
```

---

### Task 3: Unlink-all + remove-from-DB routes

**Files:**
- Create: `apps/web/server/api/admin/github/installations/[installationId]/unlink-workspaces.post.ts`
- Create: `apps/web/server/api/admin/github/installations/[installationId]/index.delete.ts`

**Interfaces:**
- Consumes: `assertConfirmInstallationId`, `unlinkAllWorkspacesForInstallation`, `removeGithubAppInstallation`, `findGithubAppInstallation` (or select)

- [ ] **Step 1: Implement unlink route**

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const body = await readJsonBody<{ confirmInstallationId?: string }>(event)
  assertConfirmInstallationId(installationId, body.confirmInstallationId)
  const result = await unlinkAllWorkspacesForInstallation(installationId)
  return { ok: true, installationId, ...result }
})
```

- [ ] **Step 2: Implement DELETE route**

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const body = await readJsonBody<{ confirmInstallationId?: string }>(event)
  assertConfirmInstallationId(installationId, body.confirmInstallationId)

  const existing = await findGithubAppInstallation(installationId)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  await removeGithubAppInstallation(installationId)
  return { ok: true, installationId }
})
```

Must import `removeGithubAppInstallation` / `findGithubAppInstallation` from `github-installations` — no GitHub API uninstall.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin github unlink-all and remove-from-db endpoints

EOF
)"
```

---

### Task 4: Admin UI panel

**Files:**
- Modify: `apps/web/app/pages/settings/admin.vue`

**Interfaces:**
- Consumes GET `/api/admin/github` and mutation endpoints from Tasks 2–3

- [ ] **Step 1: Load GitHub bundle** alongside users/workspaces (parallel Promise.all)

```ts
interface AdminGithubBundle {
  appStatus: {
    configured: boolean
    slugConfigured: boolean
    webhookSecretConfigured: boolean
    oauthLoginConfigured: boolean
    requiredOk: boolean
    recommendedOk: boolean
    permissionsError: string | null
  }
  installations: AdminGithubInstallationRow[]
  installUrl: string | null
}
```

- [ ] **Step 2: Render third panel** with French copy:
  - Chips statut App
  - Lien « Installer l'App » si `installUrl`
  - Liste installations + workspaces liés
  - Boutons: « Resynchroniser », « Unlink tous les workspaces », « Retirer de la DB »
  - `prompt` confirm pour unlink/delete (taper `installationId`)
  - Separate error state for GitHub panel (like workspacesError)

Match existing MD3 / FluffmindCard patterns; do not remove Users/Workspaces panels.

- [ ] **Step 3: Typecheck**
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): admin github app recovery panel

EOF
)"
```

---

### Task 5: Docs + ADR accept

**Files:**
- Create: `plans/PLAN-040-admin-github-panel.md`
- Modify: `prd/PRD-040-admin-github-panel.md` → shipped
- Modify: `foam/decisions/ADR-014-admin-github-panel.md` → accepted
- Modify: `foam/decisions/index.md`
- Optional: bullet in `apps/web/AGENTS.md`

- [ ] **Step 1: Write PLAN-040 pointer** (status done when shipping)
- [ ] **Step 2: Mark PRD shipped / ADR accepted** (mirror PRD-039 / ADR-013)
- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship PRD-040 and accept ADR-014 admin github panel

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Admin-only gate | 2–4 |
| GET status + installations + installUrl | 2 |
| Resync | 2 |
| Unlink-all (keep installation) | 1, 3 |
| Remove-from-DB | 3 |
| Admin UI | 4 |
| Docs/ADR | 5 |

## Self-review notes

- Does not change ADR-009 binding model
- Workspace delete (PRD-039) already preserves installations — panel makes them visible
- No GitHub uninstall API
