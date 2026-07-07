# Agent instructions — Fluffmind

Read this before touching code. It covers repo-wide conventions and gotchas that were
expensive to discover once already — don't rediscover them. Package-specific detail
lives in nested `AGENTS.md` files (`apps/web/AGENTS.md`, `packages/design-system/AGENTS.md`)
— read the closest one to whatever you're editing, in addition to this one.

See `DESIGN.md` for *why* the architecture looks like this. This file is about *how* to
work in the repo day to day.

## What this is

Fluffmind is a self-hostable, git-backed PKM app (an open-source alternative to
Obsidian). Full design rationale: `DESIGN.md`. Roadmap and current status: the
[Project board](https://github.com/users/chatondearu/projects/3) and
[milestones](https://github.com/chatondearu/fluffmind/milestones) (P0 → P7).

## Monorepo layout

pnpm workspaces + Turborepo.

- `apps/web` — the Nuxt app. Everything runnable today lives here.
- `packages/design-system` — Reka UI + UnoCSS + Material Design 3 tokens. Has real
  content.
- `packages/editor-blocks`, `packages/db` — still empty shells on purpose (P0
  scaffolding to lock in the monorepo shape; `src/index.ts` says which phase fills
  each in — P3, P2). Don't add content there until that phase's plan says so.
- `packages/integrations` — has real content since P1: Git plumbing
  (`ensureWorkingCopy`/`commitAndPush`, backing `writeToWorkspace`) via `simple-git`.
  GitHub OAuth/API and the MCP SDK wrapper are still unimplemented (P2/P5).

There is deliberately **no separate `vault-engine` package**: that logic lives in
`apps/web/server/vault/` because it currently has exactly one consumer. Don't extract
it preemptively; do extract it the day a second consumer (e.g. a standalone MCP
process) actually needs it.

## Commands

From the repo root (Turborepo fans these out to every package):

```sh
pnpm install
pnpm dev         # turbo run dev
pnpm build       # turbo run build
pnpm lint        # turbo run lint
pnpm typecheck   # turbo run typecheck
```

Or scoped to one package: `pnpm --filter @fluffmind/web run dev`.

Or via Docker: `cp .env.example .env` (set `VAULT_PATH`), then `docker compose up` —
see the Dockerfile/compose files' own comments for what each stage/service is for.

`apps/web` needs a `VAULT_PATH` env var pointing at a folder of markdown notes to do
anything useful (there's no bundled sample vault — point it at any Foam/Obsidian-style
vault, including this repo's own future docs if you add one).

## Cross-cutting gotchas

- **pnpm blocks native build scripts by default.** If a new dependency needs one,
  you'll hit `ERR_PNPM_IGNORED_BUILDS`. Approve it deliberately in
  `pnpm-workspace.yaml`'s `allowBuilds` — don't blanket-allow everything.
- **TypeScript import-extension convention differs by context, and this bit us
  twice:**
  - `packages/*` (except within `apps/web`) run standalone via raw
    `node --experimental-strip-types` for their own scripts (e.g.
    `design-system`'s `generate:css`), which needs the *exact* file extension in
    import specifiers. That's why `tsconfig.base.json` sets
    `allowImportingTsExtensions: true` and why these packages import siblings with
    explicit `.ts` (e.g. `./md3.ts`).
  - `apps/web` is bundled by Vite/Nuxt and uses **its own generated tsconfig**, not
    `tsconfig.base.json` — it does *not* have `allowImportingTsExtensions`. Imports
    there must be extensionless (`./parser`, not `./parser.ts`), or `nuxt typecheck`
    fails with `TS5097`.
  - When in doubt, match the sibling files in the same directory.
- **`turbo prune` doesn't carry shared root config referenced by relative path** from a
  package's own config (e.g. `packages/design-system/tsconfig.json` extends
  `../../tsconfig.base.json`). The Dockerfile copies it in explicitly after pruning —
  if you add another such shared root file, do the same there.
- Don't reach for a full rich-text/CRDT/ProseMirror-style editor engine for
  `editor-blocks` when that phase starts — the PRD deliberately scopes rich text down
  to contenteditable + markdown-as-you-type to contain that risk. Check `DESIGN.md`
  and the P3 milestone before expanding scope.
- **`writeToWorkspace` (P1) shells out to a real `git` binary** via `simple-git` — the
  Alpine-based `dev` and `runner` Dockerfile stages install it explicitly
  (`apk add git`); a new stage that also runs writes needs the same. Every working
  copy also gets a repo-local `user.name`/`user.email` set programmatically (see
  `packages/integrations/src/git.ts`) — don't assume a global git config exists in
  whatever environment the server runs in.
