# Vault engine (P0)

Read-only markdown vault engine backing the P0 viewer. No file in this directory ever
writes to the vault — Git sync and the single-writer `writeToWorkspace` path land in P1.

- `parser.ts` — markdown + frontmatter parsing (gray-matter + remark), one mdast AST
  reused for indexing and rendering.
- `wikilinks.ts` — extracts raw `[[target]]` / `[[target|alias]]` references from an AST.
- `index.ts` — walks `VAULT_PATH`, builds the in-memory index (notes, resolved links,
  backlinks, graph). A file that fails to parse is skipped with a `console.warn`, not
  fatal to the rest of the vault (found for real against this repo's own vault: a note
  with malformed YAML frontmatter used to 500 the whole `/api/notes` response).
- `reader.ts` — reads a single note fresh from disk by id.
- `wikilink-render.ts` — turns `[[...]]` into real links (or a styled dead link) using
  the index's resolved link data, right before rendering.
- `render.ts` — generic mdast → HTML rendering (remark-rehype + rehype-stringify),
  no wikilink awareness.
- `service.ts` — memoized `getVaultIndex()`, plus a chokidar watcher in dev that
  invalidates the cache on file changes.

## Read-only guarantee (P0-AC-6)

Verified manually: computed sha1 + mtime for every `.md` file in a real vault, ran a
full navigation session against it (list, ~13 individual notes, the graph, a 404), then
re-computed both — zero diff, and `git status` in that vault was unchanged before/after.
