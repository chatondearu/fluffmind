# Research: stored vs derived search index today

**Issue:** [#146](https://github.com/chatondearu/fluffmind/issues/146)  
**Branch:** `research/derived-search-index`  
**Date:** 2026-11-13

## Verdict

**Already derived and never stored on disk or synced.** The note/search “index” is an in-process memory cache rebuilt by walking markdown files. Git sync moves files only; nothing indexes into the vault or Postgres for search.

Parent direction in `foam/architecture/rethink-sync.md` (“Derived index, never stored”) matches current behavior for this layer. Adopting that rule as policy would mostly **lock in** what exists, not rip out a persisted index.

## Evidence

| Piece | Role | Persisted? |
| ----- | ---- | ---------- |
| `apps/web/server/vault/index.ts` — `buildVaultIndex` | Walks `.md` under vault / content roots; builds `notes`, `links`, `backlinks` Maps. Comment: “Read-only — never writes to disk.” | No |
| `apps/web/server/vault/service.ts` — `indexCache` | `Map<string, Promise<VaultIndex>>` memoization; `invalidateVaultIndex` deletes entries; optional chokidar debounce rebuild (`VAULT_WATCH !== 'false'`) | Process RAM only |
| `apps/web/server/mcp/handlers.ts` — `searchNotes` | Substring match on note **id** and **title** from that cache | No separate FTS store |
| `apps/web/app/composables/useVaultTree.ts` | Sidebar filter client-side over `GET /api/notes` list (title / id / tags) | Client only |
| `packages/*` | No vault search/index package; Postgres `index(...)` in `packages/db` is SQL table indexes, unrelated | N/A |
| SQLite / on-disk search blob | Not present for notes/search | — |

**Invalidation (drop cache → rebuild on next read):** writes (`write.ts`, `mutations.ts`, `folders.ts`), git pull/bootstrap (`pull.ts`, `sync.ts`), admin ops (`invalidate-index.post.ts`, reset-hard, unlink, etc.).

**Full note body** is not in the index: `reader.ts` reads content from disk per request. Index holds summaries + link graph only.

**Doc drift:** `DESIGN.md` mentions updating the read index “incrementally”; code path is invalidate + full rebuild via `buildVaultIndex`.

## Solo vs hosted if we keep “derived, never stored”

### Solo (`AUTH_DISABLED` / single `VAULT_PATH`)

- **Today:** Restart or invalidate → full walk of local files. No index artifact to back up or conflict with.
- **Policy change:** Near-zero. Avoid any future “commit `.fluffmind/index*` into the vault.” Watcher already keeps cache warm when files change outside the app.

### Hosted (auth + per-workspace clones under `WORKSPACES_ROOT`)

- **Today:** Each server process owns its own `indexCache`. Multi-replica = each rebuilds independently after clone/pull/write. No index to replicate between nodes.
- **Cost:** Cold start / post-invalidate latency scales with vault size (full parse walk). No FTS over body text yet.
- **Ops surface that exists because the cache can go stale:** admin `POST .../invalidate-index`, plus invalidate after pull/write. That stays useful even with a pure derived model; it does not imply a stored index.
- **Policy change:** Explicit rule “never persist/sync the index” prevents adding a shared SQLite/blob later for “faster multi-node search” without an ADR. Live sync rethink can assume peers only exchange files; each peer rebuilds locally.

## What would *not* change

- Git remains the source of truth for note bytes (ADR-002 path).
- Search quality stays title/id (agent API) or title/id/tags (sidebar) until a new derived structure (e.g. body FTS rebuilt locally) is designed.
- No need to migrate or delete an on-disk search index — there isn’t one.

## Gaps / risks (not blockers for the research question)

- Full rebuild only; large vaults = CPU/IO on every invalidate.
- Body text not searchable via `searchNotes`.
- Cache is process-local; external file edits without watcher/`invalidate` can serve stale lists until next rebuild.
