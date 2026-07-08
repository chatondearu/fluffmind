# Agent instructions — apps/web

See the root `AGENTS.md` and `DESIGN.md` first. This file covers this app specifically.

## Vault engine (`server/vault/`)

- `parser.ts` — markdown + frontmatter parsing (gray-matter + remark). Produces one
  mdast AST, reused for both indexing and rendering — don't add a second, independent
  markdown→HTML renderer.
- `wikilinks.ts` — extracts raw `[[target]]` / `[[target|alias]]` text. Does not
  resolve targets (that needs the full note index).
- `index.ts` — `buildVaultIndex(vaultPath)`: walks the vault, builds notes/links/
  backlinks/graph. **A file that fails to parse is skipped with a `console.warn`, not
  fatal** — this was a real bug found against a real vault (one malformed frontmatter
  block used to 500 the entire `/api/notes` response). Keep it that way; one bad file
  must never take down the whole vault.
- `reader.ts` — reads a single note fresh from disk by id. No caching of full content
  across requests.
- `render.ts` — generic AST → HTML (remark-rehype + rehype-stringify). Deliberately
  has no idea what a wikilink is.
- `wikilink-render.ts` — turns `[[...]]` into real `<a>` links (or a styled dead link
  if unresolved), using the index's already-resolved link data. Called right before
  `render.ts`, not merged into it — keeps the generic renderer generic.
- `service.ts` — `getVaultIndex()` memoizes the index; awaits `bootstrapWorkspace()`
  first so a fresh clone happens before the index is built. In dev, a chokidar watcher
  invalidates the cache on file changes. `invalidateVaultIndex()` drops the cache —
  called by `write.ts` after a commit.
- `sync.ts` — `bootstrapWorkspace()` (clone/init/fetch + sync warnings at boot) and
  `getWorkspaceSyncStatus()` for `GET /api/sync-status`.
- `workspace.ts` — env-based workspace config resolution (single hardcoded workspace
  until P2).
- `write.ts` — `writeToWorkspace(workspaceId, id, content)`, the single write path
  (P1 spike — see `DESIGN.md`'s Git sync section). Per-workspace in-memory lock,
  updates existing notes or creates new ones (`note-id.ts` validates ids on create).
  Git plumbing itself (`ensureWorkingCopy`/`commitAndPush`) lives in
  `@fluffmind/integrations`, not here.

## Config

- `VAULT_PATH` (required) — absolute path to a folder of markdown notes. Also the
  server's Git working copy since P1 — needs to be writable (no `:ro` mount).
- `GIT_REMOTE_URL` (optional) — if unset, writes still commit locally (`git init`'d
  automatically), just never pushed. If set, `writeToWorkspace` pushes and rebases
  automatically on a rejected push.
- `GIT_BRANCH` (optional, default `main`).
- Import convention: **extensionless** relative imports (`./parser`, not
  `./parser.ts`) — this app's own generated tsconfig doesn't set
  `allowImportingTsExtensions` (unlike `packages/*`, see root `AGENTS.md`).
- Importing from `@fluffmind/design-system`: use the plain package entry
  (`@fluffmind/design-system`) for tokens/the Uno preset, and the
  `@fluffmind/design-system/src/components` subpath specifically for Vue components.
  Don't import both from the same barrel — see that package's `AGENTS.md` for why.

## Adding a page or API route

Standard Nuxt file-based routing: `app/pages/**/*.vue`, `server/api/**/*.ts`. Catch-all
routes (note ids contain slashes) use the `[...param]` naming, e.g.
`server/api/notes/[...id].get.ts` / `app/pages/notes/[...slug].vue`.

- **Prefer reading the body off `event.node.req` on write routes** (see
  `server/api/notes/[...id].put.ts`). A root `pnpm.overrides` pins `h3` to Nitro's
  1.x (fixing the duplicate 2.x-rc from `@nuxt/eslint`'s config-inspector that used to
  break the auto-imported `readBody` — see root `pnpm-workspace.yaml` `overrides`), but the manual stream read is kept as defense
  in depth — it bypasses any future `h3` dedup drift and works regardless of which
  copy Nitro's auto-import resolves to.
- **`createError`'s `statusMessage` becomes the raw HTTP reason phrase** — a
  restricted charset that silently mangles non-ASCII characters (e.g. an em dash).
  Keep `statusMessage` short and ASCII-only; put real detail in `message`, which
  flows into the JSON error body untouched.
