# Create GitHub Repo on Workspace Create — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionally create a GitHub repository via the instance GitHub App when creating a Fluffmind workspace, then link it (`authMode=app`), with soft-fail + Settings retry.

**Architecture:** Add `createGithubRepository` in `@fluffmind/integrations`. Server helper mints an installation token, creates the repo, upserts `workspace_github_link` + `gitRemoteUrl` (same shape as `link.post.ts`). Extend `POST /api/workspaces` and add `POST /api/workspaces/github/create-and-link`. UI: create-workspace dialog (none exists today) + Settings « Créer un dépôt ».

**Tech Stack:** Nitro/h3, Drizzle, `@fluffmind/integrations` fetch to GitHub REST, Vue `<script setup>`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-github-repo-on-workspace-create-design.md`  
**PRD:** `prd/PRD-034-github-repo-on-workspace-create.md`  
**ADR:** `foam/decisions/ADR-009-github-app-installations.md` (extend docs only)

## Global Constraints

- App path only — no PAT-based repo creation.
- Soft-fail after workspace exists: HTTP 200 + `github: { ok: false, message }` for GitHub API failures.
- Hard 400/403 when `createGithubRepo` is sent but App/installation/auth is invalid (validate installation **before** `createOrganization` when possible).
- Default repo name `fluff-<slug>`; default `private: true`; `auto_init: true`.
- Repository permission **Administration: Read and write** required (document in README).
- Preserve ADR-009: 1 workspace ↔ 1 repo; PAT fallback unchanged.
- Server remains sole Git writer (ADR-002).
- Vue: `<script setup lang="ts>` + typed props; UI copy in French; code comments in English.
- Import extensions: `.ts` in `packages/integrations`; extensionless in `apps/web`.
- Conventional Commits: `feat(integrations):`, `feat(web):`, `docs:`.
- Tests: `pnpm --filter @fluffmind/integrations run test`, `pnpm --filter @fluffmind/web run test`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/integrations/src/github/create-repo.ts` | `createGithubRepository` — org vs user REST create |
| `packages/integrations/src/github/create-repo.test.ts` | Unit tests (mocked `fetch`) |
| `packages/integrations/src/index.ts` | Re-export |
| `apps/web/server/utils/github-create-repo.ts` | Defaults, validate input, create+link upsert |
| `apps/web/server/utils/github-create-repo.test.ts` | Unit tests with mocked DB / integrations |
| `apps/web/server/api/workspaces/index.post.ts` | Accept `createGithubRepo`; soft-fail github |
| `apps/web/server/api/workspaces/github/create-and-link.post.ts` | Settings retry |
| `apps/web/app/pages/settings/workspace.vue` | « Créer un dépôt » block when unlinked |
| `apps/web/app/components/WorkspaceCreateDialog.vue` | Create workspace + optional GitHub fields |
| `apps/web/app/app.vue` | Open dialog from workspace switcher |
| `README.md`, `.env.example`, `AGENTS.md`, `apps/web/AGENTS.md` | Administration permission + remove “not shipped” note |
| `plans/PLAN-034-github-repo-on-workspace-create.md` | Foam pointer |
| `prd/PRD-034-…`, `foam/index.md` | Point at plan |

---

### Task 1: `createGithubRepository` (integrations, TDD)

**Files:**
- Create: `packages/integrations/src/github/create-repo.ts`
- Create: `packages/integrations/src/github/create-repo.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GithubAccountType = 'Organization' | 'User'

  export interface CreateGithubRepositoryInput {
    token: string
    accountLogin: string
    accountType: GithubAccountType
    name: string
    private?: boolean
    autoInit?: boolean
    fetchImpl?: typeof fetch
  }

  export interface CreatedGithubRepository {
    owner: string
    repo: string
    htmlUrl: string
    cloneUrl: string
  }

  export class GithubApiError extends Error {
    readonly status: number
    readonly githubMessage: string
    constructor(status: number, githubMessage: string)
  }

  export function createGithubRepository(
    input: CreateGithubRepositoryInput,
  ): Promise<CreatedGithubRepository>
  ```

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubRepository, GithubApiError } from './create-repo.ts'

describe('createGithubRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to /orgs/{org}/repos for Organization', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'fluff-docs',
        owner: { login: 'acme' },
        html_url: 'https://github.com/acme/fluff-docs',
        clone_url: 'https://github.com/acme/fluff-docs.git',
      }),
    })

    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'fluff-docs',
        private: true,
        autoInit: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
      cloneUrl: 'https://github.com/acme/fluff-docs.git',
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/orgs/acme/repos',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ghs_x',
          Accept: 'application/vnd.github+json',
        }),
        body: JSON.stringify({
          name: 'fluff-docs',
          private: true,
          auto_init: true,
        }),
      }),
    )
  })

  it('POSTs to /user/repos for User', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'fluff-solo',
        owner: { login: 'alice' },
        html_url: 'https://github.com/alice/fluff-solo',
        clone_url: 'https://github.com/alice/fluff-solo.git',
      }),
    })

    await createGithubRepository({
      token: 'ghs_x',
      accountLogin: 'alice',
      accountType: 'User',
      name: 'fluff-solo',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.github.com/user/repos')
  })

  it('throws GithubApiError on non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Repository creation failed.' }),
    })

    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'taken',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      status: 422,
      githubMessage: 'Repository creation failed.',
    })
    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'taken',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(GithubApiError)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @fluffmind/integrations run test -- src/github/create-repo.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `create-repo.ts`**

```ts
export type GithubAccountType = 'Organization' | 'User'

export interface CreateGithubRepositoryInput {
  token: string
  accountLogin: string
  accountType: GithubAccountType
  name: string
  private?: boolean
  autoInit?: boolean
  fetchImpl?: typeof fetch
}

export interface CreatedGithubRepository {
  owner: string
  repo: string
  htmlUrl: string
  cloneUrl: string
}

export class GithubApiError extends Error {
  readonly status: number
  readonly githubMessage: string

  constructor(status: number, githubMessage: string) {
    super(`GitHub repository create failed (${status}): ${githubMessage}`)
    this.name = 'GithubApiError'
    this.status = status
    this.githubMessage = githubMessage
  }
}

interface CreateRepoApiPayload {
  name: string
  html_url: string
  clone_url: string
  owner: { login: string }
}

export async function createGithubRepository(
  input: CreateGithubRepositoryInput,
): Promise<CreatedGithubRepository> {
  const fetchImpl = input.fetchImpl ?? fetch
  const isOrg = input.accountType === 'Organization'
  const url = isOrg
    ? `https://api.github.com/orgs/${encodeURIComponent(input.accountLogin)}/repos`
    : 'https://api.github.com/user/repos'

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${input.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluffmind-integrations',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      private: input.private ?? true,
      auto_init: input.autoInit ?? true,
    }),
  })

  if (!response.ok) {
    let githubMessage = 'Unknown error'
    try {
      const body = await response.json() as { message?: string }
      if (body.message)
        githubMessage = body.message
    }
    catch {
      // keep default
    }
    throw new GithubApiError(response.status, githubMessage)
  }

  const data = await response.json() as CreateRepoApiPayload
  return {
    owner: data.owner.login,
    repo: data.name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
  }
}
```

Export from `packages/integrations/src/index.ts`:

```ts
export { createGithubRepository, GithubApiError } from './github/create-repo'
export type {
  CreateGithubRepositoryInput,
  CreatedGithubRepository,
  GithubAccountType,
} from './github/create-repo'
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/integrations run test -- src/github/create-repo.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/github/create-repo.ts \
  packages/integrations/src/github/create-repo.test.ts \
  packages/integrations/src/index.ts
git commit -m "$(cat <<'EOF'
feat(integrations): add createGithubRepository helper

EOF
)"
```

---

### Task 2: Server helper — defaults + create-and-link (TDD)

**Files:**
- Create: `apps/web/server/utils/github-create-repo.ts`
- Create: `apps/web/server/utils/github-create-repo.test.ts`

**Interfaces:**
- Consumes: `createGithubRepository`, `createInstallationToken`, `buildGitHubHttpsRemoteUrl`, `findGithubAppInstallation`, `getGitHubAppCredentials`, `isGitHubAppConfigured`, Drizzle `workspaceGithubLink` / `workspaceConfig`
- Produces:
  ```ts
  export interface CreateGithubRepoBody {
    installationId: string
    name?: string
    private?: boolean
  }

  export type GithubCreateLinkResult =
    | { ok: true, owner: string, repo: string, htmlUrl: string }
    | { ok: false, message: string }

  export function defaultGithubRepoName(workspaceSlug: string): string
  export function parseCreateGithubRepoBody(raw: unknown): CreateGithubRepoBody | null
  /** Throws createError 400 if App/installation invalid. */
  export function assertCanCreateGithubRepo(input: CreateGithubRepoBody): Promise<{
    installation: GithubAppInstallationRecord
    credentials: GitHubAppCredentials
  }>
  export function createAndLinkGithubRepo(options: {
    workspaceId: string
    workspaceSlug: string
    input: CreateGithubRepoBody
    /** When true, 409 if workspace already has a github link. */
    refuseIfLinked?: boolean
  }): Promise<GithubCreateLinkResult>
  ```

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createGithubRepository: vi.fn(),
  createInstallationToken: vi.fn(),
  buildGitHubHttpsRemoteUrl: vi.fn(),
  findGithubAppInstallation: vi.fn(),
  getGitHubAppCredentials: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
    authMode: 'authMode',
    installationId: 'installationId',
    syncToken: 'syncToken',
    lastSyncedAt: 'lastSyncedAt',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    gitRemoteUrl: 'gitRemoteUrl',
  },
}))

vi.mock('@fluffmind/integrations', () => ({
  createGithubRepository: mocks.createGithubRepository,
  createInstallationToken: mocks.createInstallationToken,
  buildGitHubHttpsRemoteUrl: mocks.buildGitHubHttpsRemoteUrl,
  GithubApiError: class GithubApiError extends Error {
    status: number
    githubMessage: string
    constructor(status: number, githubMessage: string) {
      super(githubMessage)
      this.status = status
      this.githubMessage = githubMessage
    }
  },
}))

vi.mock('./github-credentials', () => ({
  getGitHubAppCredentials: mocks.getGitHubAppCredentials,
  isGitHubAppConfigured: mocks.isGitHubAppConfigured,
}))

vi.mock('./github-installations', () => ({
  findGithubAppInstallation: mocks.findGithubAppInstallation,
}))

import {
  createAndLinkGithubRepo,
  defaultGithubRepoName,
  parseCreateGithubRepoBody,
} from './github-create-repo'

describe('defaultGithubRepoName', () => {
  it('prefixes fluff-', () => {
    expect(defaultGithubRepoName('handbook')).toBe('fluff-handbook')
  })
})

describe('parseCreateGithubRepoBody', () => {
  it('requires installationId', () => {
    expect(parseCreateGithubRepoBody({ installationId: '12', name: 'x' })).toEqual({
      installationId: '12',
      name: 'x',
      private: undefined,
    })
    expect(parseCreateGithubRepoBody(false)).toBeNull()
    expect(parseCreateGithubRepoBody({})).toBeNull()
  })
})

describe('createAndLinkGithubRepo', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok:false on GithubApiError without throwing', async () => {
    const { GithubApiError } = await import('@fluffmind/integrations')
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'k' })
    mocks.findGithubAppInstallation.mockResolvedValue({
      installationId: '99',
      accountLogin: 'acme',
      accountType: 'Organization',
    })
    mocks.createInstallationToken.mockResolvedValue({ token: 'ghs_x', expiresAt: 't' })
    mocks.createGithubRepository.mockRejectedValue(new GithubApiError(422, 'name already exists'))
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    })

    await expect(
      createAndLinkGithubRepo({
        workspaceId: 'org_1',
        workspaceSlug: 'docs',
        input: { installationId: '99' },
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'name already exists',
    })
  })

  it('upserts link and remote on success', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'k' })
    mocks.findGithubAppInstallation.mockResolvedValue({
      installationId: '99',
      accountLogin: 'acme',
      accountType: 'Organization',
    })
    mocks.createInstallationToken.mockResolvedValue({ token: 'ghs_x', expiresAt: 't' })
    mocks.createGithubRepository.mockResolvedValue({
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
      cloneUrl: 'https://github.com/acme/fluff-docs.git',
    })
    mocks.buildGitHubHttpsRemoteUrl.mockReturnValue('https://github.com/acme/fluff-docs.git')

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values: insertValues })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set: updateSet })
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert,
      update,
    })

    await expect(
      createAndLinkGithubRepo({
        workspaceId: 'org_1',
        workspaceSlug: 'docs',
        input: { installationId: '99' },
      }),
    ).resolves.toEqual({
      ok: true,
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
    })

    expect(mocks.createGithubRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fluff-docs',
        private: true,
        autoInit: true,
        accountType: 'Organization',
        accountLogin: 'acme',
      }),
    )
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        owner: 'acme',
        repo: 'fluff-docs',
        authMode: 'app',
        installationId: '99',
        syncToken: null,
      }),
    )
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/github-create-repo.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `github-create-repo.ts`**

Implement to match interfaces above:

- `defaultGithubRepoName`: `fluff-${slug}` (slug already sanitized).
- `parseCreateGithubRepoBody`: return `null` for `false` / missing / empty `installationId`; trim `name`; pass through `private` only if boolean.
- `assertCanCreateGithubRepo`: if `!isGitHubAppConfigured()` or no credentials → `createError` 400 `GitHub App unavailable`; if installation missing → 400 `Unknown installation`.
- `createAndLinkGithubRepo`:
  1. Call `assertCanCreateGithubRepo`.
  2. If `refuseIfLinked`: select existing link → if present `createError` 409 `Workspace already linked`.
  3. Mint token via `createInstallationToken`.
  4. `createGithubRepository` with `name: input.name?.trim() || defaultGithubRepoName(workspaceSlug)`, `private: input.private ?? true`, `autoInit: true`.
  5. On `GithubApiError` → `{ ok: false, message: error.githubMessage }`; on other Error → `{ ok: false, message: error.message }`.
  6. Upsert `workspaceGithubLink` like `link.post.ts` (`authMode: 'app'`, `syncToken: null`).
  7. Update `workspaceConfig.gitRemoteUrl` via `buildGitHubHttpsRemoteUrl`.
  8. Return `{ ok: true, owner, repo, htmlUrl }`.

Normalize `accountType`: treat case-insensitive `organization` / `Organization` as `'Organization'`, else `'User'`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web run test -- server/utils/github-create-repo.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/github-create-repo.ts \
  apps/web/server/utils/github-create-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add GitHub create-and-link server helper

EOF
)"
```

---

### Task 3: API — extend `POST /api/workspaces` + `create-and-link`

**Files:**
- Modify: `apps/web/server/api/workspaces/index.post.ts`
- Create: `apps/web/server/api/workspaces/github/create-and-link.post.ts`

**Interfaces:**
- Consumes: `parseCreateGithubRepoBody`, `assertCanCreateGithubRepo`, `createAndLinkGithubRepo`
- Produces response shape from design spec (`github?` on create; sync state or github result on retry)

- [ ] **Step 1: Extend `index.post.ts` body + flow**

1. Extend `CreateWorkspaceBody` with `createGithubRepo?: CreateGithubRepoBody | false`.
2. After parsing name/slug, if `body.createGithubRepo` is an object:
   - `const parsed = parseCreateGithubRepoBody(body.createGithubRepo)` — if null → 400.
   - `await assertCanCreateGithubRepo(parsed)` **before** `createOrganization`.
3. After insert `workspaceConfig` (as today), if parsed create was requested:
   ```ts
   const github = await createAndLinkGithubRepo({
     workspaceId: organization.id,
     workspaceSlug: organization.slug,
     input: parsed,
   })
   ```
   Include `github` in the return payload. If `github.ok`, set returned `config.gitRemoteUrl` to the linked remote (re-read or compute via `buildGitHubHttpsRemoteUrl(github.owner, github.repo)`).
4. If `createGithubRepo === false` or absent → behavior unchanged (no `github` field).

- [ ] **Step 2: Add `create-and-link.post.ts`**

Mirror owner check from `link.post.ts` (`requireOwnerRole` on active workspace). Body: same `CreateGithubRepoBody` fields (or nested `createGithubRepo`). Load active workspace slug from Better Auth org or `workspaceConfig` / organization table — use `getAuth().api.getFullOrganization` or DB `organization` slug via existing patterns. Simplest: accept optional `name`/`private`/`installationId` at top level; resolve slug from `getDb()` `organization` table (`@fluffmind/db`) by `organizationId`.

```ts
export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId) // copy helper from link.post or extract shared
  const body = await readJsonBody<CreateGithubRepoBody>(event)
  const parsed = parseCreateGithubRepoBody(body)
  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"installationId" is required.',
    })
  }
  // load slug from organization row
  const github = await createAndLinkGithubRepo({
    workspaceId,
    workspaceSlug: slug,
    input: parsed,
    refuseIfLinked: true,
  })
  if (!github.ok) {
    return { github }
  }
  return {
    github,
    ...(await getWorkspaceGitHubSyncState(workspaceId)),
  }
})
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/api/workspaces/index.post.ts \
  apps/web/server/api/workspaces/github/create-and-link.post.ts
git commit -m "$(cat <<'EOF'
feat(web): create GitHub repo on workspace create API

EOF
)"
```

---

### Task 4: Settings UI — « Créer un dépôt »

**Files:**
- Modify: `apps/web/app/pages/settings/workspace.vue`

**Interfaces:**
- Consumes: `GET /api/github/app/status`, `GET /api/github/installations`, `POST /api/workspaces/github/create-and-link`
- Shows create block when `githubAppConfigured && !githubAuthMode` (or authMode null / no link)

- [ ] **Step 1: Add state + handlers**

Reuse existing installation select state where possible. Add:

```ts
const createRepoName = ref('')
const createRepoPrivate = ref(true)
const creatingGithubRepo = ref(false)

const showCreateGithubRepo = computed(() =>
  githubAppConfigured.value
  && canManageGitHub.value
  && !githubAuthMode.value
  && githubInstallations.value.length > 0,
)

watch(showCreateGithubRepo, (show) => {
  if (show && !createRepoName.value) {
    // prefills fluff-<slug> from organization slug if available; else fluff-workspace
    createRepoName.value = `fluff-${organizationSlug.value || 'workspace'}`
  }
})

async function createGithubRepositoryForWorkspace() {
  creatingGithubRepo.value = true
  githubLinkError.value = null
  try {
    const response = await $fetch<{
      github?: { ok: true, owner: string, repo: string, htmlUrl: string } | { ok: false, message: string }
      authMode?: string | null
    }>('/api/workspaces/github/create-and-link', {
      method: 'POST',
      body: {
        installationId: githubInstallationId.value,
        name: createRepoName.value.trim() || undefined,
        private: createRepoPrivate.value,
      },
    })
    if (response.github && !response.github.ok) {
      githubLinkError.value = response.github.message
      return
    }
    await loadGitHubSyncState() // existing reload helper / page load
  }
  catch (error) {
    const asRecord = error as { data?: { message?: string }, message?: string }
    githubLinkError.value = asRecord.data?.message || asRecord.message || 'Création du dépôt impossible.'
  }
  finally {
    creatingGithubRepo.value = false
  }
}
```

Ensure `organizationSlug` is captured when loading full organization (add field next to `organizationName`).

- [ ] **Step 2: Template — section under App link**

Inside the GitHub App section, when `showCreateGithubRepo`:

```vue
<section v-if="showCreateGithubRepo" class="mt-6 border-t border-outline-variant pt-6">
  <h3 class="md3-title-sm">
    Créer un dépôt GitHub
  </h3>
  <p class="mt-1 md3-body-md text-on-surface-variant">
    Crée un dépôt via l’App et le lie à ce workspace (privé par défaut).
  </p>
  <div class="mt-4 grid gap-4 md:grid-cols-2">
    <!-- installation select: reuse githubInstallationId -->
    <!-- FluffmindTextField v-model="createRepoName" -->
    <!-- checkbox / select private -->
  </div>
  <FluffmindButton
    class="mt-4"
    :disabled="creatingGithubRepo || !githubInstallationId || !canManageGitHub"
    @click="createGithubRepositoryForWorkspace"
  >
    {{ creatingGithubRepo ? 'Création…' : 'Créer un dépôt' }}
  </FluffmindButton>
</section>
```

Match existing MD3 / Fluffmind component patterns in the file (no new card chrome if siblings use the same section style).

- [ ] **Step 3: Manual sanity (or typecheck)**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/settings/workspace.vue
git commit -m "$(cat <<'EOF'
feat(web): add Settings create GitHub repo action

EOF
)"
```

---

### Task 5: Workspace create dialog (API was unused in UI)

**Files:**
- Create: `apps/web/app/components/WorkspaceCreateDialog.vue`
- Modify: `apps/web/app/app.vue`

**Interfaces:**
- Consumes: `GET /api/github/app/status`, `GET /api/github/installations`, `POST /api/workspaces`
- Emits success so parent reloads organizations and sets active workspace

- [ ] **Step 1: Implement `WorkspaceCreateDialog.vue`**

Composable `<script setup lang="ts">` with typed props:

```ts
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [payload: { organizationId: string, githubWarning?: string }]
}>()
```

Fields: `name` (required), checkbox `createGithub` (default true when App+installations loaded), installation select, repo name (`fluff-<slugify(name)>` watched), private toggle.

On open: fetch status + installations; if not ready, force `createGithub = false` and hide GitHub block.

Submit:

```ts
const body: Record<string, unknown> = { name: name.value.trim() }
if (createGithub.value && installationId.value) {
  body.createGithubRepo = {
    installationId: installationId.value,
    name: repoName.value.trim() || undefined,
    private: repoPrivate.value,
  }
}
const response = await $fetch<{
  organization: { id: string }
  github?: { ok: true } | { ok: false, message: string }
}>('/api/workspaces', { method: 'POST', body })

emit('created', {
  organizationId: response.organization.id,
  githubWarning: response.github && !response.github.ok ? response.github.message : undefined,
})
emit('update:open', false)
```

Reuse existing dialog patterns (`PromptDialog` / `FolderCreateDialog`) for overlay structure and Fluffmind inputs.

- [ ] **Step 2: Wire `app.vue`**

Near the workspace switcher: button « Nouveau » (owners / any signed-in user with auth) opens the dialog. On `created`:

1. `await loadOrganizations()`
2. `await setActiveWorkspace(organizationId)`
3. If `githubWarning`, set `workspaceError` (or a one-shot banner) to the French message prefix + GitHub detail.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/WorkspaceCreateDialog.vue apps/web/app/app.vue
git commit -m "$(cat <<'EOF'
feat(web): create workspace dialog with optional GitHub repo

EOF
)"
```

---

### Task 6: Operator docs + foam pointer

**Files:**
- Modify: `README.md` (permissions table + remove “not shipped” callout; document create checkbox / Settings retry; recommend install on **All repositories** or re-add new repos when using selective access)
- Modify: `.env.example` comment line for App permissions
- Modify: `AGENTS.md`, `apps/web/AGENTS.md` (Administration R/W)
- Create: `plans/PLAN-034-github-repo-on-workspace-create.md`
- Modify: `prd/PRD-034-github-repo-on-workspace-create.md` (plan pointer)
- Modify: `foam/index.md` (PLAN-034 link)

- [ ] **Step 1: Update README permissions row**

Add:

| Administration | Read & write | create repositories for new workspaces |

Replace the “not shipped yet” blockquote with a short “Create workspace → optional Créer un dépôt GitHub” note. Mention operators must **re-approve** the App install after adding Administration.

- [ ] **Step 2: Write PLAN-034 pointer**

```markdown
# PLAN-034 — Create GitHub repo on workspace create

- **Status**: in progress
- **PRD**: [[../prd/PRD-034-github-repo-on-workspace-create|PRD-034]]
- **Date**: 2026-07-27

## Pointer

`docs/superpowers/plans/2026-07-27-github-repo-on-workspace-create.md`

Design: `docs/superpowers/specs/2026-07-27-github-repo-on-workspace-create-design.md`
```

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example AGENTS.md apps/web/AGENTS.md \
  plans/PLAN-034-github-repo-on-workspace-create.md \
  prd/PRD-034-github-repo-on-workspace-create.md \
  foam/index.md
git commit -m "$(cat <<'EOF'
docs: document GitHub repo create on workspace (PRD-034)

EOF
)"
```

---

## Verification (end-to-end)

1. App with Administration R/W + org install (All repos): create workspace with checkbox → repo `fluff-<slug>` exists, Settings shows mode `app`, note push works.
2. Duplicate name → workspace exists, warning shown, Settings retry with new name succeeds.
3. App unset → dialog has no GitHub block; create still works.
4. User installation → repo under user account.
5. `pnpm --filter @fluffmind/integrations run test && pnpm --filter @fluffmind/web run test && pnpm --filter @fluffmind/web run typecheck`

---

## Spec coverage checklist

| Spec requirement | Task |
| ---------------- | ---- |
| `createGithubRepository` org/user | 1 |
| Defaults `fluff-<slug>`, private, auto_init | 2 |
| Soft-fail `github.ok: false` | 2–3 |
| Validate App/installation before org create | 3 |
| Extend `POST /api/workspaces` | 3 |
| `create-and-link` + 409 if linked | 3 |
| Settings « Créer un dépôt » | 4 |
| Create-workspace UI checkbox | 5 |
| Administration docs | 6 |
