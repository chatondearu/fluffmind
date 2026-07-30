# Workspace Content Roots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow optional `contentRoots` on a workspace so the vault indexes and mutates only selected repo folders (`foam/`, `docs/`, …) while keeping a full Git working copy.

**Architecture:** Persist `contentRoots: string[]` on `workspace_config` (default `[]` = whole tree). Clone remains full-repo. A shared `content-roots.ts` helper normalizes paths and guards reads/writes. Index walks each root; note ids stay Git-root-relative. Roots are set at create and/or while still `[]` on GitHub link; immutable once non-empty.

**Tech Stack:** Nitro/h3, Drizzle (`text[]`), Vitest, Vue `<script setup lang="ts">`, existing vault engine in `apps/web/server/vault/`.

**Spec:** `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`  
**PRD:** `prd/PRD-038-workspace-content-roots.md`  
**ADR:** `foam/decisions/ADR-012-workspace-content-roots.md`

## Global Constraints

- Full clone + logical filter only — no sparse-checkout in v1.
- Empty `contentRoots` ≡ current full-repo behavior.
- Note ids remain relative to Git working-copy root (`foam/prd/foo`).
- Writes outside roots → `400` / `statusMessage: Content root violation`.
- Reads outside roots → `404` (same as missing note).
- Invalid root strings at create/link → `400` / `statusMessage: Invalid content root`.
- Changing non-empty roots later → `400` / `statusMessage: Content roots are immutable`.
- Auth-disabled / `VAULT_PATH`: always `contentRoots: []` (no filtering).
- ASCII-only `statusMessage`; detail in `message`.
- Vue: `<script setup lang="ts>` + typed props; UI copy in French; code comments in English.
- Imports: extensionless in `apps/web`; `.ts` only in `packages/*` standalone scripts.
- Conventional Commits: `feat(db):`, `feat(web):`, `test(web):`, `docs:`.
- Verify: `pnpm --filter @fluffmind/db run test`, `pnpm --filter @fluffmind/web run test`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/server/vault/content-roots.ts` | Normalize, validate, `assertWithinContentRoots` |
| `apps/web/server/vault/content-roots.test.ts` | Unit tests for helper |
| `packages/db/src/schema/workspace.ts` | `contentRoots` column |
| `packages/db/drizzle/0005_*.sql` | Migration (via `db:generate`) |
| `apps/web/server/vault/workspace.ts` | Expose `contentRoots` on `WorkspaceConfig` |
| `apps/web/server/vault/index.ts` | `buildVaultIndex(path, contentRoots?)` |
| `apps/web/server/vault/service.ts` | Pass roots into index build / rebuild |
| `apps/web/server/vault/folders.ts` | Filter / walk roots for folder list + create guard |
| `apps/web/server/vault/write.ts` | Guard before write |
| `apps/web/server/vault/mutations.ts` | Guard note/folder mutations |
| `apps/web/server/vault/sync.ts` | Welcome under first root when roots set |
| `apps/web/server/api/workspaces/index.post.ts` | Accept + persist `contentRoots` |
| `apps/web/server/api/workspaces/github/link.post.ts` | Set roots only while `[]` |
| `apps/web/server/api/workspaces/github/create-and-link.post.ts` | Same optional roots rule |
| `apps/web/server/api/workspaces/active.get.ts` | Return `contentRoots` |
| `apps/web/server/mcp/handlers.ts` | `get_workspace` includes `contentRoots` |
| `apps/web/app/components/WorkspaceCreateDialog.vue` | Multi-path input |
| `apps/web/app/pages/settings/workspace.vue` | Read-only roots + link form field |
| `plans/PLAN-038-workspace-content-roots.md` | Foam pointer |
| ADR-012 status → accepted when shipped |

---

### Task 1: Content-roots helper (TDD)

**Files:**
- Create: `apps/web/server/vault/content-roots.ts`
- Create: `apps/web/server/vault/content-roots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class ContentRootViolationError extends Error {
    constructor(message: string)
  }

  export class InvalidContentRootError extends Error {
    constructor(message: string)
  }

  /** Normalize + validate a body array. Throws InvalidContentRootError. */
  export function normalizeContentRoots(input: unknown): string[]

  /** Empty roots → true. Else path must equal a root or start with `root/`. */
  export function isPathWithinContentRoots(
    relativePath: string,
    contentRoots: string[],
  ): boolean

  export function assertWithinContentRoots(
    relativePath: string,
    contentRoots: string[],
  ): void
  ```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  assertWithinContentRoots,
  ContentRootViolationError,
  InvalidContentRootError,
  isPathWithinContentRoots,
  normalizeContentRoots,
} from './content-roots'

describe('normalizeContentRoots', () => {
  it('returns [] for undefined / null / empty array', () => {
    expect(normalizeContentRoots(undefined)).toEqual([])
    expect(normalizeContentRoots(null)).toEqual([])
    expect(normalizeContentRoots([])).toEqual([])
  })

  it('strips leading slashes, trims, dedupes', () => {
    expect(normalizeContentRoots(['/foam', ' foam ', 'foam', 'docs'])).toEqual(['foam', 'docs'])
  })

  it('rejects .., empty segments, backslashes, non-strings', () => {
    expect(() => normalizeContentRoots(['foam/../x'])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots([''])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots(['foam//docs'])).toThrow(InvalidContentRootError)
    expect(() => normalizeContentRoots([123])).toThrow(InvalidContentRootError)
  })
})

describe('isPathWithinContentRoots', () => {
  it('allows everything when roots empty', () => {
    expect(isPathWithinContentRoots('src/readme', [])).toBe(true)
  })

  it('allows exact root and descendants only', () => {
    const roots = ['foam', 'docs']
    expect(isPathWithinContentRoots('foam', roots)).toBe(true)
    expect(isPathWithinContentRoots('foam/prd/foo', roots)).toBe(true)
    expect(isPathWithinContentRoots('docs/guide', roots)).toBe(true)
    expect(isPathWithinContentRoots('src/readme', roots)).toBe(false)
    expect(isPathWithinContentRoots('foamy', roots)).toBe(false)
  })
})

describe('assertWithinContentRoots', () => {
  it('throws ContentRootViolationError when outside', () => {
    expect(() => assertWithinContentRoots('src/x', ['foam'])).toThrow(ContentRootViolationError)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @fluffmind/web exec vitest run server/vault/content-roots.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement helper**

```ts
// apps/web/server/vault/content-roots.ts
export class ContentRootViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentRootViolationError'
  }
}

export class InvalidContentRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidContentRootError'
  }
}

function normalizeOneRoot(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!trimmed) {
    throw new InvalidContentRootError('Content root must not be empty')
  }
  if (trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new InvalidContentRootError('Content root must use forward slashes only')
  }
  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new InvalidContentRootError('Content root contains invalid path segments')
    }
  }
  return segments.join('/')
}

export function normalizeContentRoots(input: unknown): string[] {
  if (input == null) return []
  if (!Array.isArray(input)) {
    throw new InvalidContentRootError('contentRoots must be an array of strings')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string') {
      throw new InvalidContentRootError('contentRoots must be an array of strings')
    }
    const root = normalizeOneRoot(item)
    if (seen.has(root)) continue
    seen.add(root)
    out.push(root)
  }
  return out
}

export function isPathWithinContentRoots(
  relativePath: string,
  contentRoots: string[],
): boolean {
  if (contentRoots.length === 0) return true
  const path = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
  return contentRoots.some(root => path === root || path.startsWith(`${root}/`))
}

export function assertWithinContentRoots(
  relativePath: string,
  contentRoots: string[],
): void {
  if (!isPathWithinContentRoots(relativePath, contentRoots)) {
    throw new ContentRootViolationError(
      `Path "${relativePath}" is outside configured content roots`,
    )
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @fluffmind/web exec vitest run server/vault/content-roots.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/vault/content-roots.ts apps/web/server/vault/content-roots.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add content-roots path helper

EOF
)"
```

---

### Task 2: Schema + `resolveWorkspaceConfig`

**Files:**
- Modify: `packages/db/src/schema/workspace.ts`
- Generate: `packages/db/drizzle/0005_*.sql` via drizzle-kit
- Modify: `apps/web/server/vault/workspace.ts`
- Modify: `apps/web/server/vault/workspace.test.ts` (mock rows include `contentRoots: []`)

**Interfaces:**
- Consumes: nothing new
- Produces: `WorkspaceConfig.contentRoots: string[]` always present (auth-off → `[]`)

- [ ] **Step 1: Add column to schema**

```ts
// packages/db/src/schema/workspace.ts — inside workspaceConfig
contentRoots: text('content_roots').array().notNull().default([]),
```

- [ ] **Step 2: Generate migration**

```bash
pnpm --filter @fluffmind/db run db:generate
```

Expected: new `0005_*.sql` with `ALTER TABLE "workspace_config" ADD COLUMN "content_roots" text[] DEFAULT '{}' NOT NULL;`

- [ ] **Step 3: Extend `WorkspaceConfig` + resolution**

```ts
export interface WorkspaceConfig {
  path: string
  remoteUrl?: string
  branch: string
  contentRoots: string[]
}
```

In auth-on branch of `resolveWorkspaceConfig`, return:

```ts
contentRoots: Array.isArray(config.contentRoots) ? config.contentRoots : []
```

In `workspaceConfigFromEnv()`:

```ts
return { path, remoteUrl: ..., branch: ..., contentRoots: [] }
```

- [ ] **Step 4: Fix workspace tests / typecheck for new field**

```bash
pnpm --filter @fluffmind/web exec vitest run server/vault/workspace.test.ts
pnpm --filter @fluffmind/db run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/workspace.ts packages/db/drizzle apps/web/server/vault/workspace.ts apps/web/server/vault/workspace.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add workspace_config.content_roots

EOF
)"
```

---

### Task 3: Index, folders, service (TDD)

**Files:**
- Modify: `apps/web/server/vault/index.ts`
- Create or extend: `apps/web/server/vault/index.test.ts` (if missing, create focused tests with `mkdtemp`)
- Modify: `apps/web/server/vault/folders.ts`
- Modify: `apps/web/server/vault/service.ts`
- Modify: `apps/web/server/api/notes/index.get.ts` (pass roots into `listVaultFolders` if signature changes)

**Interfaces:**
- Consumes: `contentRoots` from `WorkspaceConfig`
- Produces:
  ```ts
  export async function buildVaultIndex(
    vaultPath: string,
    contentRoots: string[] = [],
  ): Promise<VaultIndex>

  export async function vaultHasMarkdownNotes(
    vaultPath: string,
    contentRoots: string[] = [],
  ): Promise<boolean>

  export async function listVaultFolders(
    vaultPath: string,
    contentRoots: string[] = [],
  ): Promise<string[]>
  ```

- [ ] **Step 1: Failing index test**

Create temp tree: `foam/a.md`, `docs/b.md`, `src/c.md`. Assert `buildVaultIndex(root, ['foam','docs'])` has ids `foam/a`, `docs/b` only; `buildVaultIndex(root, [])` includes `src/c`.

- [ ] **Step 2: Run — expect FAIL** (signature / filter missing)

- [ ] **Step 3: Implement index walk**

When `contentRoots.length === 0`, keep `findMarkdownFiles(vaultPath)`.  
Else: for each root, `const dir = join(vaultPath, ...root.split('/'))`; if dir exists, concatenate `findMarkdownFiles(dir)`. Keep `toNoteId(vaultPath, filePath)` so ids stay repo-relative.

Update `vaultHasMarkdownNotes` the same way.

- [ ] **Step 4: Folders**

`listVaultFolders(vaultPath, contentRoots)`: if empty roots, current walk; else walk each root dir and return POSIX paths still relative to `vaultPath` (e.g. `foam/prd`).

`createVaultFolder`: after path validation, `assertWithinContentRoots(folderPath, config.contentRoots)` using workspace config (load inside function like today).

- [ ] **Step 5: Service**

```ts
indexCache.set(workspaceId, buildVaultIndex(config.path, config.contentRoots))
// scheduleRebuild / watcher rebuild must resolve config or pass contentRoots
```

Prefer resolving config inside rebuild so roots stay correct:

```ts
async function rebuildIndex(workspaceId: string) {
  const config = await resolveWorkspaceConfig(workspaceId)
  indexCache.set(workspaceId, buildVaultIndex(config.path, config.contentRoots))
}
```

- [ ] **Step 6: Tests PASS + commit**

```bash
pnpm --filter @fluffmind/web exec vitest run server/vault/index.test.ts
git add apps/web/server/vault/index.ts apps/web/server/vault/index.test.ts \
  apps/web/server/vault/folders.ts apps/web/server/vault/service.ts \
  apps/web/server/api/notes/index.get.ts
git commit -m "$(cat <<'EOF'
feat(web): filter vault index by content roots

EOF
)"
```

---

### Task 4: Write / mutations / welcome + HTTP mapping

**Files:**
- Modify: `apps/web/server/vault/write.ts`
- Modify: `apps/web/server/vault/mutations.ts`
- Modify: `apps/web/server/vault/sync.ts`
- Modify note/folder API routes that catch `InvalidNoteIdError` to also map `ContentRootViolationError` → 400 `Content root violation`
- Create: `apps/web/server/vault/content-roots.integration.test.ts` (or extend write tests) for accept/reject paths

**Interfaces:**
- Consumes: `assertWithinContentRoots`, `config.contentRoots`
- Produces: guarded mutations; welcome at `{firstRoot}/welcome.md`

- [ ] **Step 1: Failing tests**

With `contentRoots: ['foam']` mocked via env auth-off is always `[]` — prefer unit-testing helpers already covered, plus a small test that calls `assertWithinContentRoots` from a thin wrapper if write tests are heavy. Minimum: test that `writeToWorkspace` path calls guard — or extract:

```ts
export function assertNoteIdAllowed(id: string, contentRoots: string[]): void {
  assertWithinContentRoots(id, contentRoots)
}
```

If existing write tests use real disk + `VAULT_PATH`, add one test file that mocks `resolveWorkspaceConfig` **only if** the codebase already mocks it; otherwise rely on helper tests + manual guard call sites. Prefer adding:

```ts
// In write.ts after resolveNoteFilePath:
assertWithinContentRoots(id, config.contentRoots)
```

and a vitest that imports write with mocked workspace module if patterns exist in `workspace.test.ts`. Keep YAGNI: helper tests + one disk test for index is enough if guards are one-liners in write/mutations.

- [ ] **Step 2: Guard all mutation entry points**

| Function | Guard on |
|----------|----------|
| `writeToWorkspace` | `id` |
| `deleteNoteFromWorkspace` | `id` |
| `renameNoteInWorkspace` | `id` and `newId` |
| `renameVaultFolder` | `oldPath` and `newPath` |
| `deleteVaultFolder` | `folderPath` |
| `createVaultFolder` | `folderPath` |

- [ ] **Step 3: Welcome seed**

Change `seedWelcomeNoteIfEmpty` to accept `contentRoots: string[]`:

```ts
if (await vaultHasMarkdownNotes(vaultPath, contentRoots)) return

const welcomeRel = contentRoots.length > 0
  ? join(contentRoots[0]!, 'welcome.md')
  : 'welcome.md'
const welcomePath = join(vaultPath, welcomeRel)
await mkdir(dirname(welcomePath), { recursive: true })
await writeFile(welcomePath, WELCOME_NOTE, 'utf-8')
```

Pass `config.contentRoots` from `bootstrapWorkspace`.

- [ ] **Step 4: HTTP / MCP error mapping**

Where routes catch `InvalidNoteIdError`, also:

```ts
if (error instanceof ContentRootViolationError) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Content root violation',
    message: error.message,
  })
}
```

For **GET** note by id: if index miss OR (optional) path outside roots → already 404 via index. Optionally assert before read for defense: outside roots → 404 not 400.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): enforce content roots on vault mutations

EOF
)"
```

---

### Task 5: Create / link / active APIs

**Files:**
- Modify: `apps/web/server/api/workspaces/index.post.ts`
- Modify: `apps/web/server/api/workspaces/onboarding.post.ts` (insert `contentRoots: []` explicitly if required)
- Modify: `apps/web/server/api/workspaces/github/link.post.ts`
- Modify: `apps/web/server/api/workspaces/github/create-and-link.post.ts`
- Modify: `apps/web/server/utils/github-create-repo.ts` if create-and-link should accept roots (prefer handle in route)
- Modify: `apps/web/server/api/workspaces/active.get.ts`
- Add unit tests for persistence helpers if extracted; else route-level tests optional

**Interfaces:**
- Produces shared helper (recommended in `apps/web/server/utils/content-roots-config.ts` or vault helper):

```ts
export async function setWorkspaceContentRootsIfAllowed(
  organizationId: string,
  incoming: unknown,
): Promise<string[]>
```

Behavior:
1. `normalized = normalizeContentRoots(incoming)` — throws `InvalidContentRootError`
2. Load current `contentRoots` from DB
3. If current non-empty && normalized differs → throw immutable error (map to 400)
4. If current non-empty && normalized equal/empty-skip → no-op return current
5. If current `[]` && normalized length ≥ 0 → update DB when normalized non-empty OR on create insert

**Create workspace (`index.post.ts`):**

```ts
let contentRoots: string[] = []
try {
  contentRoots = normalizeContentRoots(body.contentRoots)
} catch (e) {
  if (e instanceof InvalidContentRootError) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid content root',
      message: e.message,
    })
  }
  throw e
}

await db.insert(workspaceConfig).values({
  organizationId: organization.id,
  vaultPath,
  gitBranch,
  gitRemoteUrl,
  contentRoots,
})

// return config.contentRoots in response
```

**GitHub `link.post.ts`:**

```ts
// After assertWorkspaceGithubLinkAbsent, before/after link insert:
if (body.contentRoots !== undefined) {
  const [row] = await db.select({ contentRoots: workspaceConfig.contentRoots })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, workspaceId))
    .limit(1)
  const current = row?.contentRoots ?? []
  const next = normalizeContentRoots(body.contentRoots)
  if (current.length > 0 && JSON.stringify(current) !== JSON.stringify(next)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Content roots are immutable',
      message: 'contentRoots can only be set while still empty.',
    })
  }
  if (current.length === 0 && next.length > 0) {
    await db.update(workspaceConfig)
      .set({ contentRoots: next })
      .where(eq(workspaceConfig.organizationId, workspaceId))
  }
}
```

Same pattern for `create-and-link.post.ts` body field `contentRoots?: string[]`.

**`active.get.ts`:** select + return `contentRoots` (auth-off → `[]`).

- [ ] **Step 1: Implement + map InvalidContentRootError**
- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): persist contentRoots on workspace create and link

EOF
)"
```

---

### Task 6: MCP `get_workspace`

**Files:**
- Modify: `apps/web/server/mcp/handlers.ts`
- Modify: `apps/web/server/mcp/handlers.test.ts`
- Optionally: `getWorkspaceIdentity` to include roots, or call `resolveWorkspaceConfig` in `getWorkspaceInfo`

**Interfaces:**
- Produces:
  ```ts
  export interface GetWorkspaceResult {
    id: string
    name: string
    slug: string
    scope: McpContext['scope']
    mcpEnabled: boolean
    contentRoots: string[]
  }
  ```

- [ ] **Step 1: Extend failing test expectation** for `getWorkspaceInfo` to include `contentRoots: []` (auth-off fixture)
- [ ] **Step 2: Implement**

```ts
const config = await resolveWorkspaceConfig(ctx.workspaceId)
return {
  id: ctx.workspaceId,
  name: identity?.name ?? ctx.workspaceId,
  slug: identity?.slug ?? ctx.workspaceId,
  scope: ctx.scope,
  mcpEnabled: true,
  contentRoots: config.contentRoots,
}
```

- [ ] **Step 3: Tests PASS + commit**

```bash
pnpm --filter @fluffmind/web exec vitest run server/mcp/handlers.test.ts
git commit -m "$(cat <<'EOF'
feat(web): expose contentRoots on MCP get_workspace

EOF
)"
```

---

### Task 7: UI create + settings

**Files:**
- Modify: `apps/web/app/components/WorkspaceCreateDialog.vue`
- Modify: `apps/web/app/pages/settings/workspace.vue`

**Interfaces:**
- Consumes: `POST /api/workspaces` `{ contentRoots?: string[] }`, link bodies same
- Produces: French UI for multi-path input

- [ ] **Step 1: Create dialog**

Add `contentRootsText` ref (comma- or newline-separated). On submit:

```ts
const roots = contentRootsText.value
  .split(/[\n,]/)
  .map(s => s.trim())
  .filter(Boolean)
if (roots.length) body.contentRoots = roots
```

UI: `FluffmindTextField` (or textarea) label « Dossiers du vault (optionnel) », hint « Ex. foam, docs — laisser vide = dépôt entier ».

- [ ] **Step 2: Settings**

- Read `contentRoots` from `/api/workspaces/active` (extend client types).
- Read-only block when `contentRoots.length > 0`: list chips/`<code>`.
- On GitHub link forms (App + PAT), if `contentRoots.length === 0`, show same optional field and pass in link POST body.
- Hide edit when already non-empty.

- [ ] **Step 3: Manual smoke** (dev): create workspace with `foam`, confirm settings shows it; link path optional.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): UI for workspace content roots

EOF
)"
```

---

### Task 8: Docs + ADR accept

**Files:**
- Create: `plans/PLAN-038-workspace-content-roots.md` (pointer like PLAN-034)
- Modify: `prd/PRD-038-workspace-content-roots.md` status → `in progress` then `shipped` when done
- Modify: `foam/decisions/ADR-012-workspace-content-roots.md` status → `accepted`
- Modify: `foam/decisions/index.md` status column
- Optionally: `apps/web/AGENTS.md` one bullet on `contentRoots`

- [x] **Step 1: Write pointer**

```md
# PLAN-038 — Workspace content roots

- **Status**: in progress
- **PRD**: [[../prd/PRD-038-workspace-content-roots|PRD-038]]
- **Date**: 2026-07-30

## Pointer

`docs/superpowers/plans/2026-07-30-workspace-content-roots.md`

Design: `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`
```

- [x] **Step 2: Mark ADR accepted + PRD update**
- [x] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: add PLAN-038 and accept ADR-012 content roots

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `contentRoots` column default `[]` | 2 |
| Normalize / reject bad paths | 1, 5 |
| Index only under roots; ids repo-relative | 3 |
| Write/rename/delete/folder guards | 4 |
| Welcome under first root | 4 |
| Create + link while `[]`; immutable after | 5 |
| `active` + MCP expose roots | 5, 6 |
| Create/link UI + Settings read-only | 7 |
| Auth-off no filter | 2 (`[]`) |
| No sparse-checkout | — (non-goal) |

## Self-review notes

- No sparse-checkout / no PATCH roots / no `VAULT_PATH` filter — deferred.
- Watcher still watches full tree; rebuild uses filtered index (acceptable).
- `create-and-link` and `link` both must accept optional `contentRoots` while empty.
