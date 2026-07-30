# Agent access (CLI, skill & REST) — Implementation Plan

I'm using the writing-plans skill to create the implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize MCP workspace tokens into agent tokens, expose REST `/api/agent/*` on the same vault handlers, and ship a TypeScript `fluffmind` CLI + installable skill (with install script and Nix flake package).

**Architecture:** Rename DB/API from MCP-only naming to agent tokens (`fm_agent_…`, compat `fm_mcp_…`). Add Nitro routes under `/api/agent` that call `apps/web/server/mcp/handlers.ts`. CLI in `packages/cli` is a thin HTTP client. MCP Streamable HTTP at `/api/mcp` stays; skill documents CLI-first for agents.

**Tech Stack:** Drizzle + Postgres, Nuxt Nitro, Vitest, Node CLI (`packages/cli`), Nix flake, Cursor skill markdown.

## Global Constraints

- Writes only via `writeToWorkspace` (ADR-002).
- New tokens issued as `fm_agent_<8hex>_<secret>`; resolve accepts `fm_agent_` and `fm_mcp_`.
- `/api/agent/*` = Bearer agent token only (no session cookies).
- `/api/mcp` path unchanged; owner CRUD moves to `/api/workspaces/agent`.
- PG enum name `mcp_token_scope` may stay (values unchanged); rename table + `mcp_enabled` → `agent_enabled`.
- CLI stdout JSON by default; exit codes 0/1/2/3.
- Code comments English; UI French.
- Conventional Commits; do not push unless asked.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/db/src/schema/workspace.ts` | `agentEnabled`, `workspaceAgentToken` |
| `packages/db/drizzle/0005_*.sql` + meta | Rename migration |
| `apps/web/server/utils/agent-tokens.ts` | Token hash/create/resolve (replaces `mcp-tokens.ts`) |
| `apps/web/server/utils/agent-tokens.test.ts` | Unit tests + dual prefix |
| `apps/web/server/api/workspaces/agent/*` | Owner CRUD (replaces `…/mcp/*`) |
| `apps/web/server/routes/api/mcp.ts` | Use agent-tokens helpers |
| `apps/web/server/mcp/context.ts` | `AgentTokenScope` alias / rename |
| `apps/web/server/mcp/handlers.ts` | `agentEnabled` in `getWorkspaceInfo` |
| `apps/web/server/utils/agent-auth.ts` | `requireAgentBearer(event)` shared by agent routes |
| `apps/web/server/api/agent/**` | REST mirror of MCP tools |
| `apps/web/app/pages/settings/workspace.vue` | Section Agents + CLI snippet |
| `packages/cli/*` | `fluffmind` binary |
| `scripts/install-cli.sh` | curl-pipe installer |
| `flake.nix` | `packages.fluffmind-cli` |
| `skills/fluffmind/SKILL.md` | Agent skill SoT |
| `apps/docs/guide/agents.md` (+ link from mcp.md) | Docs |
| `DESIGN.md` | Agent surfaces section |

---

### Task 1: DB rename migration (`agent_enabled` + `workspace_agent_token`)

**Files:**
- Modify: `packages/db/src/schema/workspace.ts`
- Create: `packages/db/drizzle/0005_agent_tokens.sql`
- Modify: `packages/db/drizzle/meta/_journal.json` (+ snapshot if repo convention requires)

**Interfaces:**
- Produces:
  ```ts
  // workspaceConfig.agentEnabled → column agent_enabled
  // workspaceAgentToken → table workspace_agent_token
  // mcpTokenScope enum SQL name may remain mcp_token_scope
  ```

- [ ] **Step 1: Update Drizzle schema**

```ts
// workspace.ts — replace mcpEnabled / workspaceMcpToken
export const workspaceConfig = pgTable('workspace_config', {
  organizationId: text('organization_id').primaryKey(),
  vaultPath: text('vault_path').notNull(),
  gitRemoteUrl: text('git_remote_url'),
  gitBranch: text('git_branch').notNull().default('main'),
  agentEnabled: boolean('agent_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const mcpTokenScope = pgEnum('mcp_token_scope', ['read', 'write'])

export const workspaceAgentToken = pgTable(
  'workspace_agent_token',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    scope: mcpTokenScope('scope').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    index('workspace_agent_token_organizationId_idx').on(table.organizationId),
    index('workspace_agent_token_tokenHash_idx').on(table.tokenHash),
  ],
)
```

- [ ] **Step 2: Write SQL migration `0005_agent_tokens.sql`**

```sql
ALTER TABLE "workspace_config" RENAME COLUMN "mcp_enabled" TO "agent_enabled";
ALTER TABLE "workspace_mcp_token" RENAME TO "workspace_agent_token";
ALTER INDEX "workspace_mcp_token_organizationId_idx" RENAME TO "workspace_agent_token_organizationId_idx";
ALTER INDEX "workspace_mcp_token_tokenHash_idx" RENAME TO "workspace_agent_token_tokenHash_idx";
```

(Adjust index rename names to match actual names in `0004_*.sql` if different.)

- [ ] **Step 3: Register journal entry** for tag `0005_agent_tokens` (follow existing `_journal.json` pattern / `drizzle-kit` generate if that is the repo workflow).

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
refactor(db): rename MCP tokens schema to agent tokens

EOF
)"
```

---

### Task 2: `agent-tokens` utils (issue `fm_agent_`, accept legacy `fm_mcp_`)

**Files:**
- Create: `apps/web/server/utils/agent-tokens.ts`
- Create: `apps/web/server/utils/agent-tokens.test.ts`
- Delete: `apps/web/server/utils/mcp-tokens.ts`, `mcp-tokens.test.ts` (after import updates in later steps, or rename in this task and fix compile in same commit)

**Interfaces:**
- Produces:
  ```ts
  export type AgentTokenScope = 'read' | 'write'
  export function hashAgentToken(token: string): string
  export function generateAgentTokenPlaintext(): { token: string, tokenPrefix: string }
  export function extractAgentBearerToken(authorizationHeader: string | undefined): string | null
  export function resolveAgentBearerAuth(token: string): Promise<{
    workspaceId: string
    scope: AgentTokenScope
    tokenId: string
  }>
  export function getWorkspaceAgentStatus(organizationId: string): Promise<{
    agentEnabled: boolean
    tokens: AgentTokenPublic[]
  }>
  export function setWorkspaceAgentEnabled(organizationId: string, agentEnabled: boolean): Promise<void>
  export function createWorkspaceAgentToken(options: {
    organizationId: string
    name: string
    scope: AgentTokenScope
    createdByUserId: string
  }): Promise<CreatedAgentToken>
  export function revokeWorkspaceAgentToken(organizationId: string, tokenId: string): Promise<void>
  export function getWorkspaceIdentity(workspaceId: string): Promise<{ id: string, name: string, slug: string } | null>
  ```

- [ ] **Step 1: Write failing tests** (`agent-tokens.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import {
  extractAgentBearerToken,
  generateAgentTokenPlaintext,
  hashAgentToken,
} from './agent-tokens'

describe('agent-tokens', () => {
  it('generates fm_agent_ tokens', () => {
    const { token, tokenPrefix } = generateAgentTokenPlaintext()
    expect(token).toMatch(/^fm_agent_[a-f0-9]{8}_[a-f0-9]+$/)
    expect(token).toContain(tokenPrefix)
  })

  it('extracts fm_agent_ and legacy fm_mcp_ Bearer tokens', () => {
    expect(extractAgentBearerToken('Bearer fm_agent_aa_bb')).toBe('fm_agent_aa_bb')
    expect(extractAgentBearerToken('Bearer fm_mcp_aa_bb')).toBe('fm_mcp_aa_bb')
    expect(extractAgentBearerToken('Bearer other')).toBeNull()
  })

  it('hashes stably', () => {
    expect(hashAgentToken('fm_agent_x')).toBe(hashAgentToken('fm_agent_x'))
  })
})
```

Also port `resolveAgentBearerAuth` mock tests from `mcp-tokens.test.ts`, asserting field `agentEnabled` instead of `mcpEnabled`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/web exec vitest run server/utils/agent-tokens.test.ts`  
(or the web package’s usual vitest path)

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `agent-tokens.ts`**

Copy logic from `mcp-tokens.ts` with these changes:
- `generateAgentTokenPlaintext` → `fm_agent_${tokenPrefix}_${secret}`
- `isAgentBearerToken` → `value.startsWith('fm_agent_') || value.startsWith('fm_mcp_')`
- Use `workspaceConfig.agentEnabled` and `workspaceAgentToken`
- Error messages say « Agent » / « agent tokens » instead of MCP where user-facing
- Gate create/resolve on `agentEnabled`

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): agent token helpers with fm_mcp compat

EOF
)"
```

---

### Task 3: Owner API `/api/workspaces/agent` + Settings UI

**Files:**
- Create: `apps/web/server/api/workspaces/agent/index.get.ts`
- Create: `apps/web/server/api/workspaces/agent/index.patch.ts`
- Create: `apps/web/server/api/workspaces/agent/tokens.post.ts`
- Create: `apps/web/server/api/workspaces/agent/tokens/[id].delete.ts`
- Delete: `apps/web/server/api/workspaces/mcp/**`
- Modify: `apps/web/app/pages/settings/workspace.vue`
- Modify: any imports still pointing at `mcp-tokens`

**Interfaces:**
- Consumes: `getWorkspaceAgentStatus`, `setWorkspaceAgentEnabled`, `createWorkspaceAgentToken`, `revokeWorkspaceAgentToken`
- Produces HTTP:
  - `GET/PATCH /api/workspaces/agent` → `{ agentEnabled, tokens }`
  - `POST /api/workspaces/agent/tokens` → `{ token, … }` once
  - `DELETE /api/workspaces/agent/tokens/:id`

- [ ] **Step 1: Port route handlers** from `workspaces/mcp/*` replacing names (`mcpEnabled` → `agentEnabled`, utils imports).

- [ ] **Step 2: Update Settings UI** — section title « Agents », toggle bound to `agentEnabled`, token prefix display `fm_agent_…`, keep Cursor MCP snippet URL `/api/mcp` with note that the same token works, add CLI snippet:

```bash
export FLUFFMIND_URL=https://<host>
export FLUFFMIND_TOKEN=fm_agent_…
fluffmind whoami
```

- [ ] **Step 3: Manual smoke** — typecheck web package.

Run: `pnpm --filter @fluffmind/web run typecheck`  
Expected: PASS (or fix remaining `mcp-tokens` / `mcpEnabled` references)

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): owner agent token APIs and settings UI

EOF
)"
```

---

### Task 4: Wire `/api/mcp` + handlers to agent tokens

**Files:**
- Modify: `apps/web/server/routes/api/mcp.ts`
- Modify: `apps/web/server/mcp/context.ts`
- Modify: `apps/web/server/mcp/handlers.ts` (`getWorkspaceInfo` → `agentEnabled: true`)
- Modify: `apps/web/server/mcp/server.ts` if copy mentions MCP-only auth
- Delete leftover `mcp-tokens*` if still present

- [ ] **Step 1: Update mcp route**

```ts
import { extractAgentBearerToken, resolveAgentBearerAuth } from '../../utils/agent-tokens'
// …
const bearer = extractAgentBearerToken(getHeader(event, 'authorization'))
if (bearer) {
  const auth = await resolveAgentBearerAuth(bearer)
  workspaceId = auth.workspaceId
  scope = auth.scope
}
```

- [ ] **Step 2: Align `McpContext.scope` type** with `AgentTokenScope` (re-export or rename in `context.ts`).

- [ ] **Step 3: Run existing MCP / token tests**

Run: `pnpm --filter @fluffmind/web exec vitest run server/mcp server/utils/agent-tokens`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(web): MCP HTTP auth uses agent tokens

EOF
)"
```

---

### Task 5: Shared `requireAgentBearer` + REST `/api/agent/*`

**Files:**
- Create: `apps/web/server/utils/agent-auth.ts`
- Create: `apps/web/server/api/agent/workspace.get.ts`
- Create: `apps/web/server/api/agent/notes/search.get.ts`
- Create: `apps/web/server/api/agent/notes/[...id].get.ts`
- Create: `apps/web/server/api/agent/notes/[...id].put.ts`
- Create: `apps/web/server/api/agent/notes/[...id]/backlinks.get.ts`
- Create: `apps/web/server/api/agent/graph.get.ts`
- Create: `apps/web/server/api/agent/tasks.post.ts`
- Create: `apps/web/server/api/agent/agent-routes.test.ts` (or colocated vitest with mocked handlers)

**Interfaces:**
- Produces:
  ```ts
  export async function requireAgentBearer(event: H3Event): Promise<{
    workspaceId: string
    scope: AgentTokenScope
    tokenId: string
  }>
  export function assertAgentWriteScope(scope: AgentTokenScope): void
  ```

- [ ] **Step 1: Implement `agent-auth.ts`**

```ts
import type { H3Event } from 'h3'
import { extractAgentBearerToken, resolveAgentBearerAuth, type AgentTokenScope } from './agent-tokens'

export async function requireAgentBearer(event: H3Event) {
  const token = extractAgentBearerToken(getHeader(event, 'authorization'))
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Missing or invalid agent Bearer token.',
    })
  }
  return resolveAgentBearerAuth(token)
}

export function assertAgentWriteScope(scope: AgentTokenScope): void {
  if (scope !== 'write') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'This agent token is read-only.',
    })
  }
}
```

- [ ] **Step 2: Write failing route tests** for search (200) and write with `scope: 'read'` (403). Prefer testing helper + thin handlers, or mock `requireAgentBearer` / vault handlers.

- [ ] **Step 3: Implement routes** calling handlers:

| Route | Handler call |
|-------|----------------|
| `GET workspace` | `getWorkspaceInfo({ workspaceId, scope })` |
| `GET notes/search?q&limit` | `searchNotes(q, limit, workspaceId)` |
| `GET notes/[...id]` | `readNoteById(id, workspaceId)` → 404 if null |
| `PUT notes/[...id]` | `assertAgentWriteScope` + `writeNoteContent(ctx, id, content)` |
| `GET notes/[...id]/backlinks` | `listBacklinks(id, workspaceId)` |
| `GET graph` | `getVaultGraph(workspaceId)` |
| `POST tasks` | `assertAgentWriteScope` + `createTask(ctx, content, noteId?)` |

Body for PUT: `{ content: string }`. Body for tasks: `{ content: string, noteId?: string }`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add Bearer REST /api/agent vault surface

EOF
)"
```

---

### Task 6: Scaffold `packages/cli` + HTTP client

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/config.ts`
- Create: `packages/cli/src/client.ts`
- Create: `packages/cli/src/client.test.ts`
- Create: `packages/cli/src/cli.ts` (entry)
- Create: `packages/cli/src/bin.ts` or `"bin": { "fluffmind": "./dist/bin.js" }` — for v1 source-run via `node --experimental-strip-types` or tsc build; match monorepo patterns
- Modify: root workspace already includes `packages/*`

**Interfaces:**
- Produces:
  ```ts
  export interface FluffmindConfig { url: string, token: string }
  export function loadConfig(env: NodeJS.ProcessEnv, flags: Partial<FluffmindConfig>): FluffmindConfig
  export class FluffmindClient {
    constructor(config: FluffmindConfig)
    whoami(): Promise<unknown>
    search(query: string, limit?: number): Promise<unknown>
    read(id: string): Promise<unknown>
    write(id: string, content: string): Promise<unknown>
    backlinks(id: string): Promise<unknown>
    graph(): Promise<unknown>
    task(content: string, noteId?: string): Promise<unknown>
  }
  ```

- [ ] **Step 1: Failing client tests** — mock `fetch`, assert `Authorization: Bearer …` and paths `/api/agent/notes/search?q=…`.

- [ ] **Step 2: Implement config + client**

Config precedence: flags > `FLUFFMIND_URL` / `FLUFFMIND_TOKEN` > `~/.config/fluffmind/config.json`.

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(cli): scaffold fluffmind HTTP client package

EOF
)"
```

---

### Task 7: CLI commands + exit codes

**Files:**
- Create: `packages/cli/src/commands/*.ts` (or single `commands.ts`)
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/package.json` scripts (`fluffmind`, `test`, `typecheck`)

**Interfaces:**
- CLI:
  ```text
  fluffmind whoami | search | read | write | backlinks | graph | task | config
  ```
- Exit: `0` ok, `1` HTTP 4xx business, `2` missing config, `3` network/5xx
- Flags: `--url`, `--token`, `--pretty`, `--file`, `--stdin`, `--limit`, `--note`

- [ ] **Step 1: Implement argv parser** (hand-rolled or `node:util` parseArgs — avoid heavy deps).

- [ ] **Step 2: Wire each command** to `FluffmindClient`; print `JSON.stringify(result, null, pretty ? 2 : 0)`.

- [ ] **Step 3: Smoke locally** against a running instance if available; otherwise rely on client unit tests.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(cli): add fluffmind subcommands for agent REST API

EOF
)"
```

---

### Task 8: Install script + Nix flake package

**Files:**
- Create: `scripts/install-cli.sh`
- Modify: `flake.nix`

- [ ] **Step 1: `install-cli.sh`** — detect OS/arch; install via `npm install -g` from published tarball **or** for v1 monorepo-friendly path: clone/copy instructions + `pnpm --filter @fluffmind/cli exec` / link into `~/.local/bin`. Prefer a approach that works before npm publish: download release asset **or** `pnpm dlx` when published; document monorepo: `pnpm --filter @fluffmind/cli link --global`. Script must be non-interactive and set `-euo pipefail`.

Minimal v1 acceptable behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Install @fluffmind/cli from the git repo path or npm when available.
# Writes a wrapper to "${FLUFFMIND_BIN_DIR:-$HOME/.local/bin}/fluffmind"
```

- [ ] **Step 2: Extend `flake.nix`**

```nix
packages.fluffmind-cli = pkgs.writeShellApplication {
  name = "fluffmind";
  runtimeInputs = [ pkgs.nodejs_22 pkgs.pnpm ];
  text = ''
    exec pnpm --dir "$FLUFFMIND_ROOT" --filter @fluffmind/cli start "$@"
  '';
};
```

(Or build with `buildNpmPackage` once packaging is clearer — document exact approach in commit message.)

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: add fluffmind CLI install script and flake package

EOF
)"
```

---

### Task 9: Skill + docs + DESIGN.md

**Files:**
- Create: `skills/fluffmind/SKILL.md`
- Create: `apps/docs/guide/agents.md` (or extend `mcp.md` + rename nav)
- Modify: `apps/docs/guide/mcp.md` — point to agents page
- Modify: `DESIGN.md` — replace/expand MCP section to « Agent surfaces »
- Modify: Settings already has snippets (Task 3) — ensure skill path linked

- [ ] **Step 1: Write `skills/fluffmind/SKILL.md`**

Frontmatter + body covering: prefer CLI over MCP for context; require `FLUFFMIND_URL` + `FLUFFMIND_TOKEN`; command examples; never invent endpoints; never commit tokens; when MCP is appropriate (native tool UIs).

- [ ] **Step 2: Docs page** listing MCP | CLI | skill with install + token creation pointers.

- [ ] **Step 3: DESIGN.md** update (~handlers once, three transports: stdio MCP, HTTP MCP, REST agent + CLI).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: agent skill and CLI/MCP surface guide

EOF
)"
```

- [ ] **Step 5: Mark PRD-037 exit criteria** checkboxes as done when verified; set status `shipped` only after merge.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Token rename + `fm_agent_` + compat | 1–2 |
| Owner `/api/workspaces/agent` + UI | 3 |
| `/api/mcp` keeps working | 4 |
| REST `/api/agent/*` | 5 |
| `packages/cli` | 6–7 |
| install script + flake | 8 |
| Skill + docs | 9 |
| Non-goals (compiled binary, multi-ws, session on agent) | out of plan |

## Plan self-review

- No TBD placeholders left for required behavior.
- Types aligned: `AgentTokenScope`, `requireAgentBearer`, `FluffmindClient`.
- Owner `/mcp` aliases intentionally omitted (breaking rename same release as UI).
