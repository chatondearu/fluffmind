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
- `service.ts` — `getVaultIndex()` memoizes the index; in dev, a chokidar watcher
  invalidates the cache on file changes so external edits show up without a restart.
  `invalidateVaultIndex()` drops the cache — called by `write.ts` after a commit.
- `write.ts` — `writeToWorkspace(workspaceId, id, content)`, the single write path
  (P1 spike — see `DESIGN.md`'s Git sync section). Per-workspace in-memory lock,
  editing existing notes only (no note creation yet). Git plumbing itself
  (`ensureWorkingCopy`/`commitAndPush`) lives in `@fluffmind/integrations`, not here.

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

- **Don't use the auto-imported `readBody` on a route that receives a body.** This
  monorepo resolves two copies of `h3` (Nitro's own 1.x, and a 2.x-rc pulled in
  transitively by `@nuxt/eslint`'s devtools config-inspector) — the auto-import binds
  to the 2.x-rc build, which expects a Web `Request`-style `event.req.text()` that
  doesn't exist on the 1.x Node-based event Nitro actually constructs, crashing with
  `event.req.text is not a function`. Read the body off `event.node.req` directly
  instead (see `server/api/notes/[...id].put.ts`) until the duplicate `h3` resolution
  is fixed at the dependency level.
- **`createError`'s `statusMessage` becomes the raw HTTP reason phrase** — a
  restricted charset that silently mangles non-ASCII characters (e.g. an em dash).
  Keep `statusMessage` short and ASCII-only; put real detail in `message`, which
  flows into the JSON error body untouched.
