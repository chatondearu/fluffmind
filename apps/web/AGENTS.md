# Agent instructions — apps/web

See the root `AGENTS.md` and `DESIGN.md` first. This file covers this app specifically.

## Vault engine (`server/vault/`)

Strictly read-only — **no write function exists anywhere in this module**, on
purpose. Git sync and the single-writer `writeToWorkspace` path land in P1; don't add
a write path here before then without checking `DESIGN.md`'s Git sync section first.

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

## Config

- `VAULT_PATH` (required) — absolute path to a folder of markdown notes.
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
