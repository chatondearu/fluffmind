# Vault engine

Markdown vault engine backing the Fluffmind viewer and the P1 server-side Git sync
path. Reads always go through the in-memory index; writes go exclusively through
`writeToWorkspace` (never ad-hoc disk writes elsewhere).

## Read path

- `parser.ts` — markdown + frontmatter parsing (gray-matter + remark), one mdast AST
  reused for indexing and rendering.
- `wikilinks.ts` — extracts raw `[[target]]` / `[[target|alias]]` references from an AST.
- `index.ts` — walks `VAULT_PATH`, builds the in-memory index (notes, resolved links,
  backlinks, graph). A file that fails to parse is skipped with a `console.warn`, not
  fatal to the rest of the vault.
- `reader.ts` — reads a single note fresh from disk by id.
- `wikilink-render.ts` — turns `[[...]]` into real links (or a styled dead link) using
  the index's resolved link data, right before rendering.
- `render.ts` — generic mdast → HTML rendering (remark-rehype + rehype-stringify),
  no wikilink awareness.
- `service.ts` — memoized `getVaultIndex()`; awaits `bootstrapWorkspace()` before the
  first index build. In dev, a chokidar watcher invalidates the cache on file changes.
- `note-id.ts` — validates caller-supplied note ids on create (path traversal guards).

## Write path (P1 / P7a)

- `workspace.ts` — resolves workspace config (env or Postgres).
- `sync.ts` — `bootstrapWorkspace()` (clone/init/fetch at boot) and sync-status for
  `GET /api/sync-status`.
- `lock.ts` — `withWorkspaceLock` (ADR-007): Postgres advisory when `DATABASE_URL`
  is set, else `proper-lockfile` under `WORKSPACES_ROOT/.fluffmind-locks/`.
- `write.ts` — `writeToWorkspace`: lock, create/update note, commit + optional push
  via `@fluffmind/integrations`.
- `mutations.ts` — rename/delete note & folder (same lock).

## Read-only guarantee (P0-AC-6)

Verified manually before P1: computed sha1 + mtime for every `.md` file in a real
vault, ran a full navigation session (list, individual notes, graph, 404), then
re-computed both — zero diff, and `git status` in that vault was unchanged before/after.
Writes intentionally break this for edited/created notes only through `writeToWorkspace`.
