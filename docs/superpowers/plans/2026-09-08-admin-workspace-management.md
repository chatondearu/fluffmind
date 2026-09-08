# Admin Workspace Management Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let instance admins fully manage any workspace (members, invitations, GitHub, tokens) without membership, via one shared authority guard, explicit `workspaceId` APIs, `admin_audit`, and `/settings/admin/workspaces/[id]`.

**Architecture:** App-level override `requireWorkspaceManageAuthority` (admin **or** owner of target id). Management routes stop using the active-workspace cookie as authority; callers pass `workspaceId` (body on mutations, query on GETs). Admin console reuses extracted owner settings components. Admin writes land in `admin_audit`.

**Tech Stack:** Nitro/h3, Drizzle/Postgres, Vue `<script setup lang="ts">`, Vitest, Better Auth member/org tables.

**Spec:** `docs/superpowers/specs/2026-09-08-admin-workspace-management-design.md`  
**PRD:** `prd/PRD-041-admin-workspace-management.md`  
**ADR:** `foam/decisions/ADR-015-instance-admin-workspace-authority.md`  
**Foam plan:** `plans/PLAN-041-admin-workspace-management.md`

## Global Constraints

- Admin authority is **not** a new Better Auth role — instance `user.role === 'admin'` OR `member.role === 'owner'` on the target workspace.
- Non-admin, non-owner → **403** on every migrated management endpoint.
- Explicit `workspaceId` required; cookie must not grant authority.
- `admin_audit` rows only when `actor === 'admin'` (owner mutations no-op audit).
- ASCII-only `statusMessage`; detail in `message`.
- Paths must not escape `WORKSPACES_ROOT` (danger ops stay under `/api/admin/**`).
- Vue: `<script setup lang="ts">` + typed props; UI copy French; code comments English.
- Imports: extensionless in `apps/web`; `.ts` extensions in `packages/*` per AGENTS.md.
- Conventional Commits: `feat(web):`, `feat(db):`, `test(web):`, `refactor(web):`, `docs:`.
- Verify frequently: `pnpm --filter @fluffmind/web exec vitest run <files>`, `pnpm --filter @fluffmind/db run test`, `pnpm --filter @fluffmind/web run typecheck`.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/db/src/schema/workspace.ts` | `adminAudit` table |
| `packages/db/drizzle/0007_*.sql` + journal | Migration |
| `packages/db/src/admin-audit.ts` | `insertAdminAudit` helper |
| `packages/db/src/index.ts` | Re-export helper |
| `apps/web/server/utils/workspace-manage-authority.ts` | Guard + `parseWorkspaceId` + `auditAdminAction` |
| `apps/web/server/utils/workspace-manage-authority.test.ts` | Guard/audit unit tests |
| `apps/web/server/api/workspaces/github/*.ts` | Id + shared guard |
| `apps/web/server/api/workspaces/agent/**` | Id + shared guard |
| `apps/web/server/api/workspaces/invitations/index.{get,post}.ts` | Id + shared guard |
| `apps/web/server/api/workspaces/github/invite-candidates.get.ts` | Id + shared guard |
| `apps/web/server/api/workspaces/[workspaceId]/members.get.ts` | Id-scoped member list |
| `apps/web/server/api/admin/workspace-members.get.ts` | Instance-wide read-only overview |
| `apps/web/app/components/settings/WorkspaceMembersSection.vue` | Extracted members/invites UI |
| `apps/web/app/components/settings/WorkspaceGitHubSection.vue` | Extracted GitHub + content roots |
| `apps/web/app/components/settings/WorkspaceAgentSection.vue` | Extracted agent/tokens |
| `apps/web/app/components/ConfirmActionDialog.vue` | Name/slug echo confirm |
| `apps/web/app/pages/settings/workspace.vue` | Compose extracted sections |
| `apps/web/app/pages/settings/admin.vue` | Links + overview + ConfirmActionDialog |
| `apps/web/app/pages/settings/admin/workspaces/[id].vue` | Per-workspace admin console |
| foam PRD/ADR/PLAN | Status updates when shipped |

**Targeting convention (locked):**

- Mutations: body field `workspaceId: string` (required).
- GETs: query `?workspaceId=`.
- Helper `parseWorkspaceId(raw)` → trimmed non-empty string or 400.

---

### Task 1: `admin_audit` schema + `insertAdminAudit`

**Files:**
- Modify: `packages/db/src/schema/workspace.ts`
- Create: `packages/db/src/admin-audit.ts`
- Create: `packages/db/src/admin-audit.test.ts`
- Modify: `packages/db/src/index.ts`
- Create: migration via `pnpm --filter @fluffmind/db run db:generate` (do not hand-edit journal)

**Interfaces:**
- Consumes: Drizzle `getDb`, schema tables
- Produces:
```ts
export type AdminAuditActor = 'admin' | 'owner'

export interface InsertAdminAuditInput {
  actorUserId: string
  actor: AdminAuditActor
  action: string
  targetWorkspaceId: string
  detail?: Record<string, unknown>
}

export async function insertAdminAudit(input: InsertAdminAuditInput): Promise<void>
```

- [ ] **Step 1: Write failing test**

Create `packages/db/src/admin-audit.test.ts` mocking `getDb` insert (follow existing vitest style in `packages/db` if present; otherwise mirror `apps/web` `vi.hoisted` pattern):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
}))

vi.mock('./client.ts', () => ({
  getDb: () => ({
    insert: mocks.insert,
  }),
}))

mocks.insert.mockReturnValue({ values: mocks.values })
mocks.values.mockResolvedValue(undefined)

// eslint-disable-next-line import/first
import { insertAdminAudit } from './admin-audit.ts'

describe('insertAdminAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insert.mockReturnValue({ values: mocks.values })
  })

  it('inserts a row with required fields', async () => {
    await insertAdminAudit({
      actorUserId: 'user-1',
      actor: 'admin',
      action: 'workspace.github.link',
      targetWorkspaceId: 'ws-1',
      detail: { repository: 'acme/notes' },
    })

    expect(mocks.insert).toHaveBeenCalled()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1',
      actor: 'admin',
      action: 'workspace.github.link',
      targetWorkspaceId: 'ws-1',
    }))
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (module/table missing)

Run: `pnpm --filter @fluffmind/db exec vitest run src/admin-audit.test.ts`  
Expected: FAIL (cannot resolve module or table)

- [ ] **Step 3: Add schema**

Append to `packages/db/src/schema/workspace.ts`:

```ts
export const adminAuditActor = pgEnum('admin_audit_actor', ['admin', 'owner'])

export const adminAudit = pgTable(
  'admin_audit',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    actor: adminAuditActor('actor').notNull(),
    action: text('action').notNull(),
    targetWorkspaceId: text('target_workspace_id').notNull(),
    detail: text('detail'), // JSON.stringify — no jsonb elsewhere in schema
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('admin_audit_targetWorkspaceId_idx').on(table.targetWorkspaceId),
    index('admin_audit_createdAt_idx').on(table.createdAt),
  ],
)
```

- [ ] **Step 4: Implement `insertAdminAudit`**

```ts
import { randomUUID } from 'node:crypto'
import { getDb } from './client.ts'
import { adminAudit } from './schema/workspace.ts'
import type { InsertAdminAuditInput } from './admin-audit.ts' // or inline types in same file

export async function insertAdminAudit(input: InsertAdminAuditInput): Promise<void> {
  const db = getDb()
  await db.insert(adminAudit).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    actor: input.actor,
    action: input.action,
    targetWorkspaceId: input.targetWorkspaceId,
    detail: input.detail === undefined ? null : JSON.stringify(input.detail),
  })
}
```

Export from `packages/db/src/index.ts`: `export { insertAdminAudit } from './admin-audit.ts'` (match package import-extension convention).

- [ ] **Step 5: Generate migration**

Run: `pnpm --filter @fluffmind/db run db:generate`  
Expected: new `packages/db/drizzle/0007_*.sql` + journal entry. Commit the generated SQL as-is.

- [ ] **Step 6: Run test — expect PASS**

Run: `pnpm --filter @fluffmind/db exec vitest run src/admin-audit.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/workspace.ts packages/db/src/admin-audit.ts packages/db/src/admin-audit.test.ts packages/db/src/index.ts packages/db/drizzle
git commit -m "$(cat <<'EOF'
feat(db): add admin_audit table and insert helper

EOF
)"
```

---

### Task 2: `requireWorkspaceManageAuthority` + `auditAdminAction`

**Files:**
- Create: `apps/web/server/utils/workspace-manage-authority.ts`
- Create: `apps/web/server/utils/workspace-manage-authority.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `requireAdminInstance`, `getDb`, `member`, `insertAdminAudit`
- Produces:
```ts
export type WorkspaceManageActor = 'admin' | 'owner'

export interface WorkspaceManageAuthority {
  workspaceId: string
  actor: WorkspaceManageActor
  session: Awaited<ReturnType<typeof requireSession>>
}

export function parseWorkspaceId(raw: unknown): string

export async function requireWorkspaceManageAuthority(
  event: H3Event,
  workspaceId: string,
): Promise<WorkspaceManageAuthority>

export async function auditAdminAction(
  authority: WorkspaceManageAuthority,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void>
```

- [ ] **Step 1: Write failing tests**

```ts
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireAdminInstance: vi.fn(),
  getDb: vi.fn(),
  insertAdminAudit: vi.fn(),
}))

vi.mock('./auth', () => ({ requireSession: mocks.requireSession }))
vi.mock('./admin', () => ({ requireAdminInstance: mocks.requireAdminInstance }))
vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: { role: 'role', organizationId: 'organizationId', userId: 'userId' },
  insertAdminAudit: mocks.insertAdminAudit,
}))

// eslint-disable-next-line import/first
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from './workspace-manage-authority'

const event = { headers: new Headers() } as unknown as H3Event

describe('parseWorkspaceId', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (o: object) => Object.assign(new Error('x'), o))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('trims a valid id', () => {
    expect(parseWorkspaceId('  ws-1  ')).toBe('ws-1')
  })

  it('rejects empty', () => {
    expect(() => parseWorkspaceId('')).toThrow()
  })
})

describe('requireWorkspaceManageAuthority', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (o: object) => Object.assign(new Error('x'), o))
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('allows instance admin without membership', async () => {
    const session = { user: { id: 'a1', role: 'admin' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockResolvedValue(session)

    await expect(requireWorkspaceManageAuthority(event, 'ws-foreign')).resolves.toMatchObject({
      workspaceId: 'ws-foreign',
      actor: 'admin',
    })
  })

  it('allows owner member', async () => {
    const session = { user: { id: 'u1', role: 'user' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockRejectedValue(
      Object.assign(new Error('Admin instance required.'), { statusCode: 403 }),
    )
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ role: 'owner' }],
          }),
        }),
      }),
    })

    await expect(requireWorkspaceManageAuthority(event, 'ws-1')).resolves.toMatchObject({
      workspaceId: 'ws-1',
      actor: 'owner',
    })
  })

  it('rejects non-owner non-admin with 403', async () => {
    const session = { user: { id: 'u2', role: 'user' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockRejectedValue(
      Object.assign(new Error('Admin instance required.'), { statusCode: 403 }),
    )
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ role: 'write' }],
          }),
        }),
      }),
    })

    await expect(requireWorkspaceManageAuthority(event, 'ws-1')).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})

describe('auditAdminAction', () => {
  it('writes only for admin actor', async () => {
    const session = { user: { id: 'a1', role: 'admin' } }
    await auditAdminAction(
      { workspaceId: 'ws-1', actor: 'admin', session: session as never },
      'workspace.github.sync',
      { run: true },
    )
    expect(mocks.insertAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'a1',
      actor: 'admin',
      action: 'workspace.github.sync',
      targetWorkspaceId: 'ws-1',
    }))

    mocks.insertAdminAudit.mockClear()
    await auditAdminAction(
      { workspaceId: 'ws-1', actor: 'owner', session: session as never },
      'workspace.github.sync',
    )
    expect(mocks.insertAdminAudit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/web exec vitest run server/utils/workspace-manage-authority.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb, insertAdminAudit, member } from '@fluffmind/db'

import { requireAdminInstance } from './admin'
import { requireSession } from './auth'

export type WorkspaceManageActor = 'admin' | 'owner'

export interface WorkspaceManageAuthority {
  workspaceId: string
  actor: WorkspaceManageActor
  session: Awaited<ReturnType<typeof requireSession>>
}

export function parseWorkspaceId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'workspaceId is required.',
    })
  }
  return raw.trim()
}

export async function requireWorkspaceManageAuthority(
  event: H3Event,
  workspaceId: string,
): Promise<WorkspaceManageAuthority> {
  const session = await requireSession(event)

  try {
    await requireAdminInstance(event)
    return { workspaceId, actor: 'admin', session }
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    if (statusCode !== 403)
      throw error
  }

  const db = getDb()
  const [workspaceMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember || workspaceMember.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Workspace manage authority required.',
    })
  }

  return { workspaceId, actor: 'owner', session }
}

export async function auditAdminAction(
  authority: WorkspaceManageAuthority,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (authority.actor !== 'admin')
    return

  await insertAdminAudit({
    actorUserId: authority.session.user.id,
    actor: 'admin',
    action,
    targetWorkspaceId: authority.workspaceId,
    detail,
  })
}
```

Note: `requireAdminInstance` already calls `requireSession` — calling both is fine (session twice). Optionally refactor later; do not change `admin.ts` in this task.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web exec vitest run server/utils/workspace-manage-authority.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/workspace-manage-authority.ts apps/web/server/utils/workspace-manage-authority.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add workspace manage authority guard

EOF
)"
```

---

### Task 3: Migrate GitHub workspace endpoints

**Files:**
- Modify: `apps/web/server/api/workspaces/github/link.post.ts`
- Modify: `apps/web/server/api/workspaces/github/link.delete.ts`
- Modify: `apps/web/server/api/workspaces/github/create-and-link.post.ts`
- Modify: `apps/web/server/api/workspaces/github/sync.post.ts`
- Modify: `apps/web/server/api/workspaces/github/invite-candidates.get.ts`
- Modify: owner UI call sites in `workspace.vue` (pass `workspaceId` once components still inline — minimal: add `workspaceId` to each `$fetch` body/query from `activeWorkspace.id` / resolved org id). Prefer deferring full UI extract to Task 7 but **must** pass id so owner flows keep working after this task.

**Interfaces:**
- Consumes: `parseWorkspaceId`, `requireWorkspaceManageAuthority`, `auditAdminAction`
- Produces: same HTTP shapes as today; authz via shared guard

- [ ] **Step 1: Rely on Task 2 guard tests** — do not add Nitro handler e2e in this task. After migration, typecheck must pass and owner UI must send `workspaceId`.

- [ ] **Step 2: Migrate each handler** — replace local `requireOwnerRole` + `resolveActiveWorkspaceId` with:

```ts
const body = await readJsonBody<{ workspaceId?: unknown } & /* existing */>(event)
const workspaceId = parseWorkspaceId(body.workspaceId)
const authority = await requireWorkspaceManageAuthority(event, workspaceId)
// ... existing logic using authority.workspaceId ...
await auditAdminAction(authority, 'workspace.github.link', { repository })
```

For `invite-candidates.get.ts`:

```ts
const query = getQuery(event)
const workspaceId = parseWorkspaceId(query.workspaceId)
const authority = await requireWorkspaceManageAuthority(event, workspaceId)
```

Action name strings (stable):

| Endpoint | `action` |
|----------|----------|
| link.post | `workspace.github.link` |
| link.delete | `workspace.github.unlink` |
| create-and-link.post | `workspace.github.create_and_link` |
| sync.post (when `run`) | `workspace.github.sync` |
| invite-candidates | no audit (read) |

- [ ] **Step 3: Update `workspace.vue` `$fetch` calls** to include `workspaceId: <active org id>` (and query for invite-candidates). Find the active id from the same source used today after `getFullOrganization` / `active.get`.

- [ ] **Step 4: Typecheck + targeted tests**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Run: `pnpm --filter @fluffmind/web exec vitest run server/utils/workspace-manage-authority.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/api/workspaces/github apps/web/app/pages/settings/workspace.vue
git commit -m "$(cat <<'EOF'
feat(web): target GitHub workspace APIs by explicit id

EOF
)"
```

---

### Task 4: Migrate agent + token endpoints

**Files:**
- Modify: `apps/web/server/api/workspaces/agent/index.get.ts`
- Modify: `apps/web/server/api/workspaces/agent/index.patch.ts`
- Modify: `apps/web/server/api/workspaces/agent/tokens.post.ts`
- Modify: `apps/web/server/api/workspaces/agent/tokens/[id].delete.ts`
- Modify: `workspace.vue` agent `$fetch` call sites (pass `workspaceId`)

**Interfaces:** same guard as Task 2.

- [ ] **Step 1: Migrate handlers** — delete local `requireOwnerRole` / `requireOwnerSession`; use:

GET: `parseWorkspaceId(getQuery(event).workspaceId)`  
PATCH/POST/DELETE: `parseWorkspaceId(body.workspaceId)`

Audit actions: `workspace.agent.patch`, `workspace.agent.token.create`, `workspace.agent.token.revoke` (skip GET).

- [ ] **Step 2: Update UI fetches** with `workspaceId`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/api/workspaces/agent apps/web/app/pages/settings/workspace.vue
git commit -m "$(cat <<'EOF'
feat(web): target agent workspace APIs by explicit id

EOF
)"
```

---

### Task 5: Migrate invitations endpoints

**Files:**
- Modify: `apps/web/server/api/workspaces/invitations/index.get.ts`
- Modify: `apps/web/server/api/workspaces/invitations/index.post.ts`
- Modify: `workspace.vue` invite `$fetch` call sites
- Do **not** change `invitations/[id]/accept.post.ts`

**Interfaces:** replace `requireWorkspaceManage` with shared guard + explicit id.

- [ ] **Step 1: Migrate GET/POST**

```ts
// post
const body = await readJsonBody<unknown>(event)
const parsed = parseWorkspaceInvitationBody(body) // keep existing parser
const workspaceId = parseWorkspaceId((body as { workspaceId?: unknown }).workspaceId)
const authority = await requireWorkspaceManageAuthority(event, workspaceId)
const result = await createWorkspaceInvitation({ organizationId: workspaceId, inviterId: authority.session.user.id, ... })
await auditAdminAction(authority, 'workspace.invitation.create', { role: parsed.role })
return result
```

If `parseWorkspaceInvitationBody` strips unknown fields, read `workspaceId` from raw body **before** or extend the parser to allow optional `workspaceId` without validating it as invite field.

- [ ] **Step 2: Update UI**

- [ ] **Step 3: Typecheck + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): target invitation APIs by explicit id

EOF
)"
```

---

### Task 6: Id-scoped members list + admin overview API

**Files:**
- Create: `apps/web/server/api/workspaces/members.get.ts` (query `workspaceId`)
- Create: `apps/web/server/api/admin/workspace-members.get.ts`
- Create: `apps/web/server/utils/workspace-members.ts` (shared query helpers)
- Create: `apps/web/server/utils/workspace-members.test.ts`

**Interfaces:**
```ts
export interface WorkspaceMemberRow {
  memberId: string
  userId: string
  email: string
  name: string
  role: string
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]>

export interface AdminWorkspaceMembersGroup {
  organizationId: string
  name: string
  slug: string
  members: WorkspaceMemberRow[]
}

export async function listAllWorkspaceMembers(): Promise<AdminWorkspaceMembersGroup[]>
```

- [ ] **Step 1: Failing tests** for `listWorkspaceMembers` (mock drizzle joins on `member` + `user`).

- [ ] **Step 2: Implement helpers** using `member` + `user` from `@fluffmind/db` (`eq(member.organizationId, workspaceId)`).

- [ ] **Step 3: Routes**

`members.get.ts`:
```ts
const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
await requireWorkspaceManageAuthority(event, workspaceId)
return { members: await listWorkspaceMembers(workspaceId) }
```

`admin/workspace-members.get.ts`:
```ts
await requireAdminInstance(event)
return { workspaces: await listAllWorkspaceMembers() }
```

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add id-scoped workspace members APIs

EOF
)"
```

---

### Task 7: Extract owner settings sections

**Files:**
- Create: `apps/web/app/components/settings/WorkspaceMembersSection.vue`
- Create: `apps/web/app/components/settings/WorkspaceGitHubSection.vue`
- Create: `apps/web/app/components/settings/WorkspaceAgentSection.vue`
- Modify: `apps/web/app/pages/settings/workspace.vue` (thin composer)

**Interfaces (props):**
```ts
// each section
defineProps<{
  workspaceId: string
  // pass through only what the section needs (role flags, initial data, or self-fetch)
}>()
```

Each section **self-fetches** with `workspaceId` (required for admin reuse). Owner page passes `workspaceId` from active workspace.

- [ ] **Step 1: Extract GitHub section** (largest) — move link/unlink/create/sync/content-roots UI + script into `WorkspaceGitHubSection.vue`. All `$fetch` include `workspaceId`.

- [ ] **Step 2: Extract Agent section**

- [ ] **Step 3: Extract Members section** — load members via `GET /api/workspaces/members?workspaceId=`; invitations via migrated invitations API; invite form posts with `workspaceId`.

- [ ] **Step 4: Slim `workspace.vue`** to layout + pass `workspaceId` + session repair card if still page-level.

- [ ] **Step 5: Typecheck + commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(web): extract workspace settings sections by workspaceId

EOF
)"
```

---

### Task 8: Admin per-workspace console page

**Files:**
- Create: `apps/web/app/pages/settings/admin/workspaces/[id].vue`
- Modify: `apps/web/app/pages/settings/admin.vue` (link each workspace row to the console)

**Interfaces:** page loads workspace metadata from existing `GET /api/admin/workspaces` row or a small fetch; gates with client check that user is instance admin (same pattern as `admin.vue`).

- [ ] **Step 1: Create page** composing:

```vue
<script setup lang="ts">
definePageMeta({ ssr: false }) // match admin.vue if it uses client-only
const route = useRoute()
const workspaceId = computed(() => String(route.params.id))
</script>

<template>
  <!-- header: name + slug + back link to /settings/admin -->
  <WorkspaceMembersSection :workspace-id="workspaceId" />
  <WorkspaceGitHubSection :workspace-id="workspaceId" />
  <WorkspaceAgentSection :workspace-id="workspaceId" />
  <!-- danger zone: reuse mutation helpers from admin.vue or shared composable -->
</template>
```

Extract danger-zone mutation functions into `apps/web/app/composables/useAdminWorkspaceDanger.ts` and use it from both `admin.vue` and `[id].vue`.

- [ ] **Step 2: Link from admin list** — workspace name/slug → `/settings/admin/workspaces/${organizationId}`.

- [ ] **Step 3: Typecheck + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add admin per-workspace management console

EOF
)"
```

---

### Task 9: `ConfirmActionDialog` + remove `window.prompt`

**Files:**
- Create: `apps/web/app/components/ConfirmActionDialog.vue`
- Modify: `apps/web/app/pages/settings/admin.vue`
- Modify: `apps/web/app/pages/settings/admin/workspaces/[id].vue` (danger confirms)
- No Vue component unit test required (repo has no established Vue harness for dialogs); verify via `rg` + typecheck.

**Interfaces:**
```ts
defineProps<{
  title: string
  description: string
  confirmValue: string // slug or installationId to echo
  confirmLabel?: string
  inputLabel?: string
}>()
defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })
```

- [ ] **Step 1: Implement dialog** — based on `PromptDialog.vue`; enable confirm button only when `input.trim() === confirmValue`.

- [ ] **Step 2: Replace every `window.prompt` in admin surfaces** with dialog state (`pendingAction` + `open`).

- [ ] **Step 3: Grep guarantee**

Run: `rg "window\\.prompt" apps/web/app/pages/settings`  
Expected: no matches

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): replace admin prompts with ConfirmActionDialog

EOF
)"
```

---

### Task 10: Read-only members overview on `/settings/admin`

**Files:**
- Modify: `apps/web/app/pages/settings/admin.vue`
- Uses: `GET /api/admin/workspace-members`

- [ ] **Step 1: Fetch overview** when admin page loads (parallel with workspaces list).

- [ ] **Step 2: Render** a French read-only section: for each workspace, name/slug + member email/role list. No edit controls. Link to console for management.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add read-only admin workspace members overview

EOF
)"
```

---

### Task 11: Docs + foam ship checklist

**Files:**
- Modify: `foam/decisions/ADR-015-instance-admin-workspace-authority.md` → status `accepted`
- Modify: `prd/PRD-041-admin-workspace-management.md` → check goals / status as appropriate
- Modify: `plans/PLAN-041-admin-workspace-management.md` → check completed tasks
- Modify: `apps/docs` admin guide if one exists for settings/admin (search `admin` under `apps/docs`)
- Touch `AGENTS.md` / `apps/web/AGENTS.md` only if behavior/env docs need a one-liner about admin console authority

- [ ] **Step 1: Update statuses** to match shipped reality.

- [ ] **Step 2: Full verify**

Run: `pnpm lint && pnpm typecheck && pnpm test` (or turbo equivalents from root)  
Expected: green

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: accept ADR-015 and mark PRD-041 shipped

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Shared manage authority guard | Task 2 |
| Explicit workspaceId targeting | Tasks 3–5 |
| `admin_audit` | Task 1 + audit calls in 3–5 |
| Admin console route | Task 8 |
| Reuse owner components | Task 7 → 8 |
| ConfirmActionDialog | Task 9 |
| Read-only members overview | Tasks 6 + 10 |
| Content roots via GitHub link | Task 3 (no separate route) |
| Id-scoped members (BA active-org gap) | Task 6 |
| Docs / ADR accepted | Task 11 |
| Single PR backend-first | Task order 1→11 |

No TBD placeholders. Types for guard/audit/members are consistent across tasks.
