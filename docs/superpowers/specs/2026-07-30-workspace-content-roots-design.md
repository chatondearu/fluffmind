# Workspace content roots — design

**Date:** 2026-07-30  
**PRD:** [[../../../prd/PRD-038-workspace-content-roots|PRD-038]]  
**ADR:** [[../../../foam/decisions/ADR-012-workspace-content-roots|ADR-012]]

## Problem

Today a Fluffmind workspace maps to an **entire** Git repository: clone, index, and
writes all treat the working-copy root as the vault. Many real repos only keep
markdown knowledge in subfolders (`foam/`, `docs/`, …). Users want to link such a
repo and expose only those folders as the vault.

## Goals

- At workspace create / GitHub link, optionally set one or more **content roots**
- Vault index, read, write, rename, delete, and folders stay inside those roots
- Note ids remain **repo-relative** (`foam/prd/foo`, not `prd/foo`)
- Empty roots = whole repo (current behavior)
- Roots are **immutable** after set (v1)

## Non-goals (v1)

- Git sparse-checkout
- Editing roots in Settings after create/link
- Filtering `VAULT_PATH` / auth-disabled mode
- Multiple remotes per workspace
- Changing 1 workspace ↔ 1 repo binding

## Decision summary

| Topic | Choice |
| ----- | ------ |
| Approach | Full clone + logical filter (`contentRoots`) |
| Note ids | Paths relative to Git root |
| Writes outside roots | Reject (`400`) |
| Reads outside roots | `404` |
| Config timing | Create / GitHub link only; immutable after |
| Default | `[]` / unset = entire repo |
| Auth-off | No content roots (whole `VAULT_PATH`) |

## Data model

Add to `workspace_config`:

```ts
contentRoots: text('content_roots').array().notNull().default([])
```

Semantics:

- `[]` → no filter
- `['foam', 'docs']` → POSIX paths relative to Git root
- Server normalization on write: trim, strip leading `/`, reject `.` / `..` /
  empty segments / absolute paths, dedupe, stable sort optional
- No column on `workspace_github_link` — roots belong to the workspace

Immutability (v1):

- `POST /api/workspaces` may set `contentRoots` (including leaving `[]`)
- GitHub link / create-and-link may set `contentRoots` **only while stored value
  is still `[]`** (so create-empty → link-with-`foam` works)
- Once non-empty, any later change → `400 Content roots are immutable`
- No dedicated `PATCH contentRoots` endpoint

## Runtime behavior

### Config resolution

`resolveWorkspaceConfig` returns:

```ts
{ path, remoteUrl?, branch, contentRoots: string[] }
```

### Index

- Empty roots → walk Git root (today)
- Non-empty → walk each `join(gitRoot, root)`; missing root dirs are skipped
- Note ids via `relative(gitRoot, filePath)` (unchanged shape)

### Path guards

Shared helper `assertWithinContentRoots(noteId | relativePath, contentRoots)`:

- Used by reader, write, rename, delete, folder create
- Empty roots → always allow (within vault/git root traversal rules already in place)

### Writes & Git

- Mutations only touch files under allowed roots
- Commit/push still operate on the full working copy (unchanged)
- Files outside roots on disk are ignored by Fluffmind, not deleted

### Welcome note

- If roots non-empty and no markdown under those roots yet → create
  `{firstRoot}/welcome.md` (not repo-root `welcome.md`)
- If roots empty → current welcome behavior

### MCP / agents

- `get_workspace` (and equivalent workspace info APIs) include `contentRoots`
- Write tools inherit the same path guard (400 on violation)

## API & UI

| Surface | Behavior |
| ------- | -------- |
| `POST /api/workspaces` | Optional `contentRoots?: string[]` |
| GitHub link / create-and-link | Accept `contentRoots` only when still unset/`[]` and first link; else immutable error |
| Workspace GET / sync / MCP info | Return `contentRoots` |
| Settings | Read-only display of roots |
| Create / link UI | Multi-value path input; hint « leave empty = whole repo » |

## Errors

| Case | Status | `statusMessage` (ASCII) |
| ---- | ------ | ----------------------- |
| Invalid root at create/link | 400 | `Invalid content root` |
| Read outside roots | 404 | (same as missing note) |
| Write/rename/delete outside roots | 400 | `Content root violation` |
| Attempt to change roots later | 400 | `Content roots are immutable` |

## Testing

- Normalization rejects `..`, absolute, empty
- Index with `foam` + `docs` excludes e.g. `src/README.md`
- Write rejects `src/foo.md`, accepts `foam/foo.md`
- `[]` matches legacy full-repo behavior
- Persist on create; second mutation of roots rejected

## Follow-ups (out of v1)

- Sparse checkout for large monorepos
- Editable roots with reindex
- Auth-off / env-based content roots

## References

- ADR-002 (server-side Git sync), ADR-006 (workspace_config)
- PRD-034 explicitly deferred monorepo layouts — this feature addresses that gap
  without changing the 1:1 workspace↔repo binding
