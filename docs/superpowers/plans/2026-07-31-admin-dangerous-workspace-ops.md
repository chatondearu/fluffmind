# Admin Dangerous Workspace Ops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give instance admins a Workspaces panel on `/settings/admin` to list vaults/orphans, hard-reset Git working copies, force-unlink GitHub, invalidate indexes, delete workspaces, and rebind orphan folders.

**Architecture:** All ops go through `/api/admin/workspaces/*` gated by `requireAdminInstance`. Git hard-reset lives in `@fluffmind/integrations` (`resetHardToRemote`). List/delete/rebind helpers live in `apps/web/server/utils/admin-workspaces.ts`. UI extends the existing admin page with a second panel. Destructive actions require typing the organization slug.

**Tech Stack:** Nitro/h3, Drizzle, Better Auth organizations, simple-git, Vue `<script setup lang="ts">`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`  
**PRD:** `prd/PRD-039-admin-dangerous-workspace-ops.md`  
**ADR:** `foam/decisions/ADR-013-admin-dangerous-workspace-ops.md`

## Global Constraints

- Instance admin only — every route calls `requireAdminInstance` (`user.role === 'admin'`).
- Paths must stay inside `WORKSPACES_ROOT` (default `/data/workspaces`); reject `..` and absolute escapes.
- Destructive ops (`reset-hard`, `delete`, `rebind`) require body `{ confirmSlug }` matching the organization slug (or folder name for rebind).
- Hard reset uses `git fetch` + `git reset --hard origin/<gitBranch>` under `withWorkspaceWriteLock`.
- Delete must not call GitHub to delete the remote repository.
- Unlink reuses `unlinkWorkspaceGithubSync` — clears link + `gitRemoteUrl`, leaves disk alone.
- ASCII-only `statusMessage`; detail in `message`.
- Vue: `<script setup lang="ts>` + typed props; UI copy in French; code comments in English.
- Imports: extensionless in `apps/web`; `.ts` in `packages/integrations`.
- Conventional Commits: `feat(integrations):`, `feat(web):`, `docs:`.
- Verify: `pnpm --filter @fluffmind/integrations run test`, `pnpm --filter @fluffmind/web run test`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/integrations/src/git.ts` | `resetHardToRemote(git, { branch, accessToken? })` |
| `packages/integrations/src/git.test.ts` | Integration tests for reset-hard |
| `packages/integrations/src/index.ts` | Re-export |
| `apps/web/server/utils/admin-workspaces.ts` | List, orphans, delete, rebind, assertConfirmSlug |
| `apps/web/server/utils/admin-workspaces.test.ts` | Unit tests (mocked fs/db) |
| `apps/web/server/api/admin/workspaces/index.get.ts` | List workspaces + orphans |
| `apps/web/server/api/admin/workspaces/[id]/reset-hard.post.ts` | Hard reset |
| `apps/web/server/api/admin/workspaces/[id]/invalidate-index.post.ts` | Drop index cache |
| `apps/web/server/api/admin/workspaces/[id]/unlink-github.post.ts` | Force unlink |
| `apps/web/server/api/admin/workspaces/[id]/index.delete.ts` | Delete workspace |
| `apps/web/server/api/admin/workspaces/rebind.post.ts` | Rebind orphan folder |
| `apps/web/app/pages/settings/admin.vue` | Workspaces panel UI |
| `plans/PLAN-039-admin-dangerous-workspace-ops.md` | Foam pointer |
| ADR-013 → accepted when shipped |

---

### Task 1: List workspaces + orphans helper (TDD)

**Files:**
- Create: `apps/web/server/utils/admin-workspaces.ts`
- Create: `apps/web/server/utils/admin-workspaces.test.ts`
- Create: `apps/web/server/api/admin/workspaces/index.get.ts`

**Interfaces:**
- Consumes: `getDb`, `organization`, `workspaceConfig`, `workspaceGithubLink`, `requireAdminInstance`
- Produces:
  ```ts
  export interface AdminWorkspaceRow {
    organizationId: string
    name: string
    slug: string
    vaultPath: string
    vaultExists: boolean
    gitRemoteUrl: string | null
    gitBranch: string
    contentRoots: string[]
    githubLinked: boolean
    githubOwner: string | null
    githubRepo: string | null
    ahead: number | null
    behind: number | null
  }

  export function assertConfirmSlug(expected: string, provided: unknown): void

  export async function listAdminWorkspaces(): Promise<{
    workspaces: AdminWorkspaceRow[]
    orphans: string[]
  }>
  ```

- [ ] **Step 1: Write failing test**

Create `apps/web/server/utils/admin-workspaces.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  readdir: vi.fn(),
  access: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readdir: mocks.readdir, access: mocks.access }
})

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  organization: {
    id: 'id',
    name: 'name',
    slug: 'slug',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    vaultPath: 'vaultPath',
    gitRemoteUrl: 'gitRemoteUrl',
    gitBranch: 'gitBranch',
    contentRoots: 'contentRoots',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
  },
}))

const { assertConfirmSlug, listAdminWorkspaces } = await import('./admin-workspaces')

describe('assertConfirmSlug', () => {
  it('throws 400 when slug mismatches', () => {
    expect(() => assertConfirmSlug('alpha', 'beta')).toThrow(
      expect.objectContaining({ statusCode: 400, statusMessage: 'Confirmation mismatch' }),
    )
  })

  it('passes when slug matches', () => {
    expect(() => assertConfirmSlug('alpha', 'alpha')).not.toThrow()
  })
})

describe('listAdminWorkspaces', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.WORKSPACES_ROOT
  })

  it('returns workspaces and orphan folder names', async () => {
    process.env.WORKSPACES_ROOT = '/data/workspaces'
    mocks.readdir.mockResolvedValue(['org-1', 'org-orphan', '.fluffmind-locks'])
    mocks.access.mockImplementation(async (p: string) => {
      if (String(p).includes('org-1')) return undefined
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    // Mock drizzle select/from/leftJoin chain to return one workspace row
    // Adjust to match how drizzle joins are written in the implementation.
    const rows = [{
      organizationId: 'org-1',
      name: 'Alpha',
      slug: 'alpha',
      vaultPath: '/data/workspaces/org-1',
      gitRemoteUrl: 'https://github.com/acme/alpha.git',
      gitBranch: 'main',
      contentRoots: [],
      githubOwner: 'acme',
      githubRepo: 'alpha',
    }]
    // Wire mocks.getDb().select()... to resolve `rows`

    const result = await listAdminWorkspaces()
    expect(result.workspaces).toHaveLength(1)
    expect(result.workspaces[0]!.vaultExists).toBe(true)
    expect(result.workspaces[0]!.githubLinked).toBe(true)
    expect(result.orphans).toEqual(['org-orphan'])
  })
})
```

Stub `createError` globally in tests the same way `workspace.test.ts` does.

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @fluffmind/web exec vitest run server/utils/admin-workspaces.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement helper + GET route**

Create `apps/web/server/utils/admin-workspaces.ts`:

```ts
import { access, readdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { getDb, organization, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

const DEFAULT_WORKSPACES_ROOT = '/data/workspaces'

export interface AdminWorkspaceRow {
  organizationId: string
  name: string
  slug: string
  vaultPath: string
  vaultExists: boolean
  gitRemoteUrl: string | null
  gitBranch: string
  contentRoots: string[]
  githubLinked: boolean
  githubOwner: string | null
  githubRepo: string | null
  ahead: number | null
  behind: number | null
}

export function getWorkspacesRoot(): string {
  return resolve(process.env.WORKSPACES_ROOT || DEFAULT_WORKSPACES_ROOT)
}

export function isPathWithinRoot(rootPath: string, path: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}${sep}`)
}

export function assertConfirmSlug(expected: string, provided: unknown): void {
  if (typeof provided !== 'string' || provided.trim() !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Confirmation mismatch',
      message: `Type "${expected}" to confirm this action.`,
    })
  }
}

export async function listAdminWorkspaces(): Promise<{
  workspaces: AdminWorkspaceRow[]
  orphans: string[]
}> {
  const db = getDb()
  const root = getWorkspacesRoot()

  const rows = await db
    .select({
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      vaultPath: workspaceConfig.vaultPath,
      gitRemoteUrl: workspaceConfig.gitRemoteUrl,
      gitBranch: workspaceConfig.gitBranch,
      contentRoots: workspaceConfig.contentRoots,
      githubOwner: workspaceGithubLink.owner,
      githubRepo: workspaceGithubLink.repo,
    })
    .from(organization)
    .leftJoin(workspaceConfig, eq(workspaceConfig.organizationId, organization.id))
    .leftJoin(workspaceGithubLink, eq(workspaceGithubLink.organizationId, organization.id))

  const workspaces: AdminWorkspaceRow[] = []
  for (const row of rows) {
    if (!row.vaultPath) continue
    let vaultExists = false
    try {
      await access(row.vaultPath)
      vaultExists = true
    }
    catch {
      vaultExists = false
    }
    workspaces.push({
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      vaultPath: row.vaultPath,
      vaultExists,
      gitRemoteUrl: row.gitRemoteUrl,
      gitBranch: row.gitBranch || 'main',
      contentRoots: Array.isArray(row.contentRoots) ? row.contentRoots : [],
      githubLinked: Boolean(row.githubOwner && row.githubRepo),
      githubOwner: row.githubOwner,
      githubRepo: row.githubRepo,
      ahead: null,
      behind: null,
    })
  }

  let orphans: string[] = []
  try {
    const entries = await readdir(root)
    const known = new Set(workspaces.map(w => w.organizationId))
    orphans = entries.filter(name =>
      name !== '.fluffmind-locks'
      && !name.startsWith('.')
      && !known.has(name),
    )
  }
  catch {
    orphans = []
  }

  return { workspaces, orphans }
}
```

Create `apps/web/server/api/admin/workspaces/index.get.ts`:

```ts
import { requireAdminInstance } from '../../../utils/admin'
import { listAdminWorkspaces } from '../../../utils/admin-workspaces'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  return listAdminWorkspaces()
})
```

Adjust drizzle join chaining to match repo patterns (`github-sync.ts`). Ahead/behind may stay `null` in v1 if `getSyncStatus` is expensive/fragile — returning null is fine.

Stub `createError` in tests like `workspace.test.ts`.

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @fluffmind/web exec vitest run server/utils/admin-workspaces.test.ts
```

- [ ] **Step 3: Implement helper + GET route**
- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/admin-workspaces.ts \
  apps/web/server/utils/admin-workspaces.test.ts \
  apps/web/server/api/admin/workspaces/index.get.ts
git commit -m "$(cat <<'EOF'
feat(web): list admin workspaces and orphan vault dirs

EOF
)"
```

---

### Task 2: `resetHardToRemote` + admin reset-hard API

**Files:**
- Modify: `packages/integrations/src/git.ts`
- Modify: `packages/integrations/src/git.test.ts`
- Modify: `packages/integrations/src/index.ts`
- Create: `apps/web/server/api/admin/workspaces/[id]/reset-hard.post.ts`

**Interfaces:**
```ts
export async function resetHardToRemote(
  git: SimpleGit,
  options: { branch: string, accessToken?: string, networkRemoteUrl?: string },
): Promise<void>
```

- [ ] **Step 1: Write failing test**

```ts
it('resetHardToRemote discards local commits and matches origin', async () => {
  const bare = await tempDir('fluff-reset-bare-')
  const remoteWork = await tempDir('fluff-reset-remote-')
  const localWork = await tempDir('fluff-reset-local-')
  await simpleGit().init(['--bare', bare])

  const seedGit = await ensureWorkingCopy({ path: remoteWork, remoteUrl: bare, branch: 'main' })
  await writeFile(join(remoteWork, 'remote.md'), '# remote\n', 'utf-8')
  await commitAndPush(seedGit, { branch: 'main', message: 'Remote', remoteConfigured: true })

  await simpleGit().clone(bare, localWork)
  await initIdentity(localWork)
  await writeFile(join(localWork, 'local-only.md'), '# keep?\n', 'utf-8')
  const local = simpleGit(localWork)
  await local.add(['-A'])
  await local.commit('Local only')

  const git = await ensureWorkingCopy({ path: localWork, remoteUrl: bare, branch: 'main' })
  await resetHardToRemote(git, { branch: 'main' })

  const files = await readdir(localWork)
  expect(files).toContain('remote.md')
  expect(files).not.toContain('local-only.md')
})
```

- [ ] **Step 2: Run — expect FAIL** if helper missing

```bash
pnpm --filter @fluffmind/integrations exec vitest run src/git.test.ts
```

- [ ] **Step 3: Implement**

```ts
export async function resetHardToRemote(
  git: SimpleGit,
  options: { branch: string, accessToken?: string, networkRemoteUrl?: string },
): Promise<void> {
  const { branch } = options
  try {
    await fetchRemote(git, branch, options)
    await git.raw(['reset', '--hard', `origin/${branch}`])
  }
  catch (error) {
    rethrowIfGitAuthError(error)
    throw new GitConflictError(
      `Failed to reset branch "${branch}" to origin/${branch}: ${asErrorMessage(error)}`,
    )
  }
}
```

Export from `packages/integrations/src/index.ts`.

Route `apps/web/server/api/admin/workspaces/[id]/reset-hard.post.ts`:

```ts
import { getDb, organization } from '@fluffmind/db'
import { ensureWorkingCopy, resetHardToRemote } from '@fluffmind/integrations'
import { eq } from 'drizzle-orm'
import { requireAdminInstance } from '../../../../utils/admin'
import { assertConfirmSlug } from '../../../../utils/admin-workspaces'
import { readJsonBody } from '../../../../utils/read-json-body'
import { withWorkspaceWriteLock } from '../../../../vault/write'
import { invalidateVaultIndex } from '../../../../vault/service'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from '../../../../vault/workspace'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const body = await readJsonBody<{ confirmSlug?: string }>(event)
  const db = getDb()
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  assertConfirmSlug(org.slug, body.confirmSlug)

  const config = await resolveWorkspaceConfig(id)
  if (!config.remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No git remote',
      message: 'Workspace has no gitRemoteUrl configured.',
    })
  }

  await withWorkspaceWriteLock(id, async () => {
    const network = await resolveWorkspaceGitNetwork(id)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    await resetHardToRemote(git, { branch: config.branch, accessToken: network.accessToken })
    invalidateVaultIndex(id)
  })

  return { ok: true, workspaceId: id }
})
```

Export `resetHardToRemote` from `@fluffmind/integrations`.

- [ ] **Step 1: Write failing test** for `resetHardToRemote`
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement helper + export + route**
- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin reset-hard workspace endpoint

EOF
)"
```

---

### Task 2: List + orphans + GET (if not done in Task 1 of this plan)

If Task 1 above already shipped list+GET, skip. Otherwise implement `listAdminWorkspaces` + GET as described in the design File map / Task 1 above.

---

### Task 3: invalidate-index + force unlink

**Files:**
- Create: `apps/web/server/api/admin/workspaces/[id]/invalidate-index.post.ts`
- Create: `apps/web/server/api/admin/workspaces/[id]/unlink-github.post.ts`

**Interfaces:**
- Consumes: `invalidateVaultIndex`, `unlinkWorkspaceGithubSync`

- [ ] **Step 1: Implement invalidate route**

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })
  const db = getDb()
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  invalidateVaultIndex(id)
  return { ok: true, workspaceId: id }
})
```

- [ ] **Step 2: Implement unlink route**

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })
  const db = getDb()
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  const state = await unlinkWorkspaceGithubSync(id)
  invalidateVaultIndex(id)
  return state
})
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin invalidate-index and force-unlink endpoints

EOF
)"
```

---

### Task 4: Delete workspace

**Files:**
- Modify: `apps/web/server/utils/admin-workspaces.ts` — add `deleteAdminWorkspace`
- Modify: `apps/web/server/utils/admin-workspaces.test.ts`
- Create: `apps/web/server/api/admin/workspaces/[id]/index.delete.ts`

**Interfaces:**
```ts
export async function deleteAdminWorkspace(organizationId: string): Promise<void>
```

- [ ] **Step 1: Write failing test** (mock db deletes + `rm`)

```ts
it('deleteAdminWorkspace removes tokens, link, config, org, and vault dir', async () => {
  // mock db.delete chain; mock rm; assert path under WORKSPACES_ROOT
})
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```ts
export async function deleteAdminWorkspace(organizationId: string): Promise<void> {
  const db = getDb()
  const root = getWorkspacesRoot()
  const [config] = await db.select().from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, organizationId)).limit(1)
  const vaultPath = config?.vaultPath ? resolve(config.vaultPath) : resolve(root, organizationId)
  if (!isPathWithinRoot(root, vaultPath)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid path',
      message: 'Vault path escapes WORKSPACES_ROOT.',
    })
  }

  await db.delete(workspaceAgentToken).where(eq(workspaceAgentToken.organizationId, organizationId))
  await db.delete(githubInvitation).where(eq(githubInvitation.organizationId, organizationId))
  await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.organizationId, organizationId))
  await db.delete(workspaceConfig).where(eq(workspaceConfig.organizationId, organizationId))

  const members = await db.select({ id: member.id }).from(member)
    .where(eq(member.organizationId, organizationId))
  for (const m of members) {
    await db.delete(memberSyncMeta).where(eq(memberSyncMeta.memberId, m.id))
  }
  await db.delete(organization).where(eq(organization.id, organizationId))

  await rm(vaultPath, { recursive: true, force: true })
  invalidateVaultIndex(organizationId)
}
```

Prefer Drizzle deletes over Better Auth `deleteOrganization` so admin need not be an org owner.

Route:

```ts
export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })
  const body = await readJsonBody<{ confirmSlug?: string }>(event)
  const db = getDb()
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  assertConfirmSlug(org.slug, body.confirmSlug)
  await deleteAdminWorkspace(id)
  return { ok: true, workspaceId: id }
})
```

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin delete workspace endpoint

EOF
)"
```

---

### Task 5: Rebind orphan

**Files:**
- Modify: `apps/web/server/utils/admin-workspaces.ts`
- Modify: `apps/web/server/utils/admin-workspaces.test.ts`
- Create: `apps/web/server/api/admin/workspaces/rebind.post.ts`

**Interfaces:**
```ts
export async function rebindOrphanFolder(options: {
  organizationId: string
  folderName: string
}): Promise<{ vaultPath: string }>
```

- [ ] **Step 1: Write failing tests** (reject `..`, reject unknown org, success updates vaultPath)
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```ts
export async function rebindOrphanFolder(options: {
  organizationId: string
  folderName: string
}): Promise<{ vaultPath: string }> {
  const { organizationId, folderName } = options
  if (!folderName || folderName.includes('/') || folderName.includes('\\') || folderName.includes('..') || folderName.startsWith('.')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid path',
      message: 'folderName must be a single non-hidden path segment under WORKSPACES_ROOT.',
    })
  }

  const db = getDb()
  const root = getWorkspacesRoot()
  const vaultPath = resolve(root, folderName)
  if (!isPathWithinRoot(root, vaultPath)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid path',
      message: 'Vault path escapes WORKSPACES_ROOT.',
    })
  }

  const [org] = await db.select({ id: organization.id, slug: organization.slug })
    .from(organization).where(eq(organization.id, organizationId)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }

  await access(vaultPath).catch(() => {
    throw createError({
      statusCode: 404,
      statusMessage: 'Orphan folder not found',
      message: `No folder found at ${vaultPath}.`,
    })
  })

  await db.insert(workspaceConfig).values({
    organizationId,
    vaultPath,
    gitRemoteUrl: null,
    gitBranch: 'main',
    contentRoots: [],
  }).onConflictDoUpdate({
    target: workspaceConfig.organizationId,
    set: { vaultPath },
  })

  return { vaultPath }
}
```

Adjust `onConflictDoUpdate` to match drizzle patterns in this repo.

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin rebind orphan vault folder

EOF
)"
```

---

### Task 6: Admin UI

**Files:**
- Modify: `apps/web/app/pages/settings/admin.vue`

**Interfaces:**
- Consumes all admin workspace APIs from Tasks 1–5

- [ ] **Step 1: Load workspaces** on page mount alongside users

```ts
interface AdminWorkspaceRow {
  organizationId: string
  name: string
  slug: string
  vaultPath: string
  vaultExists: boolean
  gitRemoteUrl: string | null
  gitBranch: string
  contentRoots: string[]
  githubLinked: boolean
  githubOwner: string | null
  githubRepo: string | null
  ahead: number | null
  behind: number | null
}

const workspaces = ref<AdminWorkspaceRow[]>([])
const orphans = ref<string[]>([])

async function loadWorkspaces() {
  const response = await $fetch<{ workspaces: AdminWorkspaceRow[], orphans: string[] }>('/api/admin/workspaces')
  workspaces.value = response.workspaces
  orphans.value = response.orphans
}
```

- [ ] **Step 2: Wire actions** with French copy:
  - « Réinitialiser sur origin » (reset-hard)
  - « Invalider l'index »
  - « Forcer unlink GitHub »
  - « Supprimer le workspace »
  - « Réassocier » for orphans

- [ ] **Step 3: Manual smoke** — open `/settings/admin` as admin

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): admin workspaces danger panel

EOF
)"
```

---

### Task 7: Docs + ADR accept

**Files:**
- Create: `plans/PLAN-039-admin-dangerous-workspace-ops.md`
- Modify: `prd/PRD-039-admin-dangerous-workspace-ops.md` → shipped when done
- Modify: `foam/decisions/ADR-013-admin-dangerous-workspace-ops.md` → accepted
- Modify: `foam/decisions/index.md`
- Optional bullet in `apps/web/AGENTS.md`

- [x] **Step 1: Write PLAN-039 pointer**

```md
# PLAN-039 — Admin dangerous workspace ops

- **Status**: ready
- **PRD**: [[../prd/PRD-039-admin-dangerous-workspace-ops|PRD-039]]
- **Date**: 2026-07-31

## Pointer

`docs/superpowers/plans/2026-07-31-admin-dangerous-workspace-ops.md`

Design: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`
```

- [x] **Step 2: Mark ADR accepted + PRD shipped**
- [x] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: add PLAN-039 and accept ADR-013 admin workspace ops

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Admin-only gate | 1–6 |
| List + orphans | 1 |
| reset-hard | 2 |
| invalidate-index | 3 |
| force unlink | 3 |
| delete workspace | 4 |
| rebind orphan | 5 |
| Admin UI | 6 |
| Docs/ADR | 7 |

## Self-review notes

- No owner danger zone (by design — choice B)
- Owner unlink path unchanged
- Hard reset discards local-only commits intentionally
- Unrelated histories on reset/pull surface as 409 with actionable message
