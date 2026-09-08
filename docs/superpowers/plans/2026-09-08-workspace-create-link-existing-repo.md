# Workspace create: link existing GitHub App repo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners link an existing GitHub App repository when creating a workspace in `WorkspaceCreateDialog`, without new API routes.

**Architecture:** Client two-step — `POST /api/workspaces` then `POST /api/workspaces/github/link` with the new org id. Pure helpers decide body/mode; the dialog loads install repos like Settings. Soft-fail keeps the workspace and emits `githubWarning`.

**Tech Stack:** Vue `<script setup lang="ts">`, Nuxt `$fetch`, Fluffmind Select/Dialog, Vitest for pure helpers.

**Spec:** `docs/superpowers/specs/2026-09-08-workspace-create-link-existing-repo-design.md`  
**Related:** PRD-034, ADR-009

## Global Constraints

- No new backend routes; reuse `POST /api/workspaces`, `POST /api/workspaces/github/link`, installations + repos GETs.
- Modes when App + ≥1 install: `create` | `link` | `none`. Without App/installs: GitHub section hidden (local only).
- Soft-fail on link: workspace kept; `created` emit includes `githubWarning`.
- PAT out of create dialog.
- Vue: `<script setup lang="ts">` + typed props; UI French; comments English.
- Extensionless imports in `apps/web`.
- Conventional Commits: `feat(web):`, `test(web):`, `docs:`.
- Verify: `pnpm --filter @fluffmind/web exec vitest run <tests>`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/app/utils/workspace-create-github.ts` | Pure mode/body helpers |
| `apps/web/app/utils/workspace-create-github.test.ts` | Unit tests |
| `apps/web/app/components/WorkspaceCreateDialog.vue` | Mode UI + create then optional link |
| `apps/docs/guide/github-sync-auth.md` | One short “at create: create or link” note |

---

### Task 1: Pure helpers + tests (TDD)

**Files:**
- Create: `apps/web/app/utils/workspace-create-github.ts`
- Create: `apps/web/app/utils/workspace-create-github.test.ts`

**Interfaces:**
```ts
export type WorkspaceCreateGithubMode = 'none' | 'create' | 'link'

export interface WorkspaceCreateGithubCreateFields {
  installationId: string
  repoName: string
  repoPrivate: boolean
}

export interface WorkspaceCreateGithubLinkFields {
  installationId: string
  repository: string // owner/repo
}

export function defaultGithubModeWhenAvailable(githubAvailable: boolean): WorkspaceCreateGithubMode

export function buildWorkspaceCreatePostBody(input: {
  name: string
  contentRoots: string[]
  mode: WorkspaceCreateGithubMode
  create: WorkspaceCreateGithubCreateFields
}): Record<string, unknown>

export function buildWorkspaceGithubLinkBody(input: {
  workspaceId: string
  contentRoots: string[]
  link: WorkspaceCreateGithubLinkFields
}): {
  workspaceId: string
  mode: 'app'
  installationId: string
  repository: string
  contentRoots?: string[]
}

export function canSubmitWorkspaceCreate(input: {
  name: string
  mode: WorkspaceCreateGithubMode
  installationId: string
  repository: string // link mode only
}): boolean
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceCreatePostBody,
  buildWorkspaceGithubLinkBody,
  canSubmitWorkspaceCreate,
  defaultGithubModeWhenAvailable,
} from './workspace-create-github'

describe('defaultGithubModeWhenAvailable', () => {
  it('defaults to create when GitHub is available', () => {
    expect(defaultGithubModeWhenAvailable(true)).toBe('create')
  })
  it('defaults to none when unavailable', () => {
    expect(defaultGithubModeWhenAvailable(false)).toBe('none')
  })
})

describe('buildWorkspaceCreatePostBody', () => {
  it('omits createGithubRepo for link and none', () => {
    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: ['foam'],
      mode: 'link',
      create: { installationId: '1', repoName: 'x', repoPrivate: true },
    })).toEqual({ name: 'Acme', contentRoots: ['foam'] })

    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'none',
      create: { installationId: '1', repoName: 'x', repoPrivate: true },
    })).toEqual({ name: 'Acme' })
  })

  it('includes createGithubRepo for create mode', () => {
    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'create',
      create: { installationId: '42', repoName: 'fluff-acme', repoPrivate: false },
    })).toEqual({
      name: 'Acme',
      createGithubRepo: {
        installationId: '42',
        name: 'fluff-acme',
        private: false,
      },
    })
  })

  it('omits empty create repo name so server default applies', () => {
    const body = buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'create',
      create: { installationId: '42', repoName: '  ', repoPrivate: true },
    })
    expect(body.createGithubRepo).toEqual({
      installationId: '42',
      private: true,
    })
  })
})

describe('buildWorkspaceGithubLinkBody', () => {
  it('builds app link payload with optional contentRoots', () => {
    expect(buildWorkspaceGithubLinkBody({
      workspaceId: 'ws-1',
      contentRoots: ['docs'],
      link: { installationId: '9', repository: 'acme/notes' },
    })).toEqual({
      workspaceId: 'ws-1',
      mode: 'app',
      installationId: '9',
      repository: 'acme/notes',
      contentRoots: ['docs'],
    })
  })
})

describe('canSubmitWorkspaceCreate', () => {
  it('requires installation for create and repository for link', () => {
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'none', installationId: '', repository: '',
    })).toBe(true)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'create', installationId: '', repository: '',
    })).toBe(false)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'create', installationId: '1', repository: '',
    })).toBe(true)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'link', installationId: '1', repository: '',
    })).toBe(false)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'link', installationId: '1', repository: 'o/r',
    })).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @fluffmind/web exec vitest run app/utils/workspace-create-github.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement helpers**

```ts
export type WorkspaceCreateGithubMode = 'none' | 'create' | 'link'

export function defaultGithubModeWhenAvailable(githubAvailable: boolean): WorkspaceCreateGithubMode {
  return githubAvailable ? 'create' : 'none'
}

export function buildWorkspaceCreatePostBody(input: {
  name: string
  contentRoots: string[]
  mode: WorkspaceCreateGithubMode
  create: { installationId: string, repoName: string, repoPrivate: boolean }
}): Record<string, unknown> {
  const body: Record<string, unknown> = { name: input.name }
  if (input.contentRoots.length)
    body.contentRoots = input.contentRoots

  if (input.mode === 'create' && input.create.installationId) {
    const trimmedName = input.create.repoName.trim()
    body.createGithubRepo = {
      installationId: input.create.installationId,
      private: input.create.repoPrivate,
      ...(trimmedName ? { name: trimmedName } : {}),
    }
  }
  return body
}

export function buildWorkspaceGithubLinkBody(input: {
  workspaceId: string
  contentRoots: string[]
  link: { installationId: string, repository: string }
}) {
  const payload: {
    workspaceId: string
    mode: 'app'
    installationId: string
    repository: string
    contentRoots?: string[]
  } = {
    workspaceId: input.workspaceId,
    mode: 'app',
    installationId: input.link.installationId,
    repository: input.link.repository.trim(),
  }
  if (input.contentRoots.length)
    payload.contentRoots = input.contentRoots
  return payload
}

export function canSubmitWorkspaceCreate(input: {
  name: string
  mode: WorkspaceCreateGithubMode
  installationId: string
  repository: string
}): boolean {
  if (!input.name.trim())
    return false
  if (input.mode === 'create')
    return Boolean(input.installationId)
  if (input.mode === 'link')
    return Boolean(input.installationId && input.repository.trim())
  return true
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @fluffmind/web exec vitest run app/utils/workspace-create-github.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/workspace-create-github.ts apps/web/app/utils/workspace-create-github.test.ts
git commit -m "$(cat <<'EOF'
test(web): add helpers for workspace create GitHub modes

EOF
)"
```

---

### Task 2: Wire `WorkspaceCreateDialog`

**Files:**
- Modify: `apps/web/app/components/WorkspaceCreateDialog.vue`

**Interfaces:**
- Consumes helpers from Task 1
- Produces same `created` emit shape: `{ organizationId, githubWarning? }`
- Repo list shape from Settings: `{ repositories: Array<{ fullName: string, ... }> }` — use `fullName` as select value (`owner/repo`)

- [ ] **Step 1: Replace boolean `createGithub` with mode**

```ts
import {
  type WorkspaceCreateGithubMode,
  buildWorkspaceCreatePostBody,
  buildWorkspaceGithubLinkBody,
  canSubmitWorkspaceCreate,
  defaultGithubModeWhenAvailable,
} from '../utils/workspace-create-github'

const githubMode = ref<WorkspaceCreateGithubMode>('none')
const linkedRepository = ref('')
const repositories = ref<Array<{ value: string, label: string }>>([])
const loadingRepositories = ref(false)
const repositoriesError = ref<string | null>(null)

const githubModeOptions = [
  { value: 'create', label: 'Créer un dépôt GitHub' },
  { value: 'link', label: 'Lier un dépôt existant' },
  { value: 'none', label: 'Sans GitHub (local)' },
]
```

In `loadGitHubOptions`, after installs load:

```ts
githubMode.value = defaultGithubModeWhenAvailable(githubAvailable.value)
```

In `resetForm`, reset `githubMode`, `linkedRepository`, `repositories`, errors.

- [ ] **Step 2: Load repos when mode is link / installation changes**

```ts
async function loadRepositoriesForInstallation(id: string): Promise<void> {
  linkedRepository.value = ''
  repositories.value = []
  repositoriesError.value = null
  if (!id || githubMode.value !== 'link') return

  loadingRepositories.value = true
  try {
    const response = await $fetch<{ repositories?: Array<{ fullName?: string }> }>(
      `/api/github/installations/${id}/repos`,
    )
    const rows = Array.isArray(response.repositories) ? response.repositories : []
    repositories.value = rows
      .map(repo => (typeof repo.fullName === 'string' ? repo.fullName.trim() : ''))
      .filter(Boolean)
      .map(fullName => ({ value: fullName, label: fullName }))
  }
  catch (requestError) {
    const asRecord = requestError as { data?: { message?: string }, message?: string }
    repositoriesError.value = asRecord.data?.message || asRecord.message || 'Impossible de charger les dépôts.'
  }
  finally {
    loadingRepositories.value = false
  }
}

watch(installationId, (id) => {
  if (githubMode.value === 'link')
    void loadRepositoriesForInstallation(id)
})

watch(githubMode, (mode) => {
  if (mode === 'link')
    void loadRepositoriesForInstallation(installationId.value)
  else {
    linkedRepository.value = ''
    repositories.value = []
    repositoriesError.value = null
  }
})
```

- [ ] **Step 3: Rewrite `submit`**

```ts
async function submit(): Promise<void> {
  const trimmedName = name.value.trim()
  if (!canSubmitWorkspaceCreate({
    name: trimmedName,
    mode: githubMode.value,
    installationId: installationId.value,
    repository: linkedRepository.value,
  })) return

  error.value = null
  submitting.value = true

  try {
    const contentRoots = contentRootsText.value
      .split(/[\n,]/)
      .map(root => root.trim())
      .filter(Boolean)

    const body = buildWorkspaceCreatePostBody({
      name: trimmedName,
      contentRoots,
      mode: githubMode.value,
      create: {
        installationId: installationId.value,
        repoName: repoName.value,
        repoPrivate: repoPrivate.value,
      },
    })

    const response = await $fetch<{
      organization: { id: string }
      github?: { ok: true } | { ok: false, message: string }
    }>('/api/workspaces', { method: 'POST', body })

    let githubWarning = response.github && !response.github.ok
      ? response.github.message
      : undefined

    if (githubMode.value === 'link' && !githubWarning) {
      try {
        await $fetch('/api/workspaces/github/link', {
          method: 'POST',
          body: buildWorkspaceGithubLinkBody({
            workspaceId: response.organization.id,
            contentRoots,
            link: {
              installationId: installationId.value,
              repository: linkedRepository.value,
            },
          }),
        })
      }
      catch (linkError) {
        const asRecord = linkError as { data?: { message?: string }, message?: string }
        githubWarning = asRecord.data?.message || asRecord.message || 'Impossible de lier le dépôt GitHub.'
      }
    }

    emit('created', {
      organizationId: response.organization.id,
      githubWarning,
    })
    close()
  }
  catch (requestError) {
    const asRecord = requestError as { data?: { message?: string }, message?: string }
    error.value = asRecord.data?.message || asRecord.message || 'Impossible de créer le workspace.'
  }
  finally {
    submitting.value = false
  }
}
```

- [ ] **Step 4: Template — mode select + conditional panels**

Replace the checkbox block with:

```vue
<section v-if="githubAvailable" class="rounded-xl bg-surface-container-low p-4">
  <label class="block">
    <span class="mb-2 block md3-label-lg">GitHub</span>
    <FluffmindSelect
      v-model="githubMode"
      :options="githubModeOptions"
      :disabled="loadingGitHub || submitting"
    />
  </label>

  <div v-if="githubMode === 'create'" class="mt-4 grid gap-4">
    <!-- existing installation / repo name / private fields -->
  </div>

  <div v-else-if="githubMode === 'link'" class="mt-4 grid gap-4">
    <label class="block">
      <span class="mb-2 block md3-label-lg">Installation GitHub App</span>
      <FluffmindSelect
        v-model="installationId"
        :options="installationOptions"
        placeholder="Choisir une installation"
        :disabled="loadingGitHub || submitting"
      />
    </label>
    <label class="block">
      <span class="mb-2 block md3-label-lg">Dépôt existant</span>
      <FluffmindSelect
        v-model="linkedRepository"
        :options="repositories"
        placeholder="Choisir un dépôt"
        :disabled="loadingRepositories || submitting || !installationId"
      />
      <span v-if="loadingRepositories" class="mt-2 block md3-body-sm text-on-surface-variant">
        Chargement des dépôts…
      </span>
      <span v-else-if="repositoriesError" class="mt-2 block md3-body-sm text-error">
        {{ repositoriesError }}
      </span>
      <span v-else-if="installationId && !repositories.length" class="mt-2 block md3-body-sm text-on-surface-variant">
        Aucun dépôt accessible pour cette installation.
      </span>
    </label>
  </div>
</section>
```

Submit button disabled bind:

```vue
:disabled="submitting || !canSubmitWorkspaceCreate({
  name,
  mode: githubMode,
  installationId,
  repository: linkedRepository,
})"
```

(Or a computed `canSubmit` wrapping the helper for cleaner template.)

Remove unused `FluffmindCheckbox` import if create-private still needs it — keep checkbox for « Dépôt privé » only.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/WorkspaceCreateDialog.vue
git commit -m "$(cat <<'EOF'
feat(web): link existing GitHub App repo when creating a workspace

EOF
)"
```

---

### Task 3: Docs

**Files:**
- Modify: `apps/docs/guide/github-sync-auth.md` (add a short subsection near workspace/GitHub setup)
- If `self-hosting.md` already mentions create-repo only, add one sentence pointing to link-existing

- [ ] **Step 1: Add doc note**

Something like:

```markdown
### At workspace creation

When the GitHub App is installed, the “New workspace” dialog offers:

- **Create a GitHub repository** — creates `fluff-<slug>` (or a custom name) via the App and links it
- **Link an existing repository** — pick a repo from an App installation; the new empty vault clones that remote on first use
- **Local only** — no GitHub binding (you can link later from workspace settings)
```

- [ ] **Step 2: Commit**

```bash
git add apps/docs/guide/github-sync-auth.md apps/docs/guide/self-hosting.md
git commit -m "$(cat <<'EOF'
docs: note link-existing GitHub repo at workspace create

EOF
)"
```

---

## Manual test plan (after Task 2)

- [ ] App available: mode defaults to « Créer un dépôt »; create still works
- [ ] Mode « Lier »: repos load; create+link opens vault with remote notes
- [ ] Force link failure (optional): workspace still created + warning banner in app
- [ ] Mode « Sans GitHub »: local workspace, no link
- [ ] No App / no installs: GitHub section hidden

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| Three modes in dialog | Task 2 |
| App install + repo picker | Task 2 |
| Create then link client sequence | Task 2 |
| Soft-fail githubWarning | Task 2 |
| No new APIs | All |
| Docs | Task 3 |
| Helper test coverage | Task 1 |
| PAT out of scope | Not implemented |
