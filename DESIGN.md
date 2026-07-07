# Design — Fluffmind

Why the architecture looks the way it does. For day-to-day conventions and gotchas,
see `AGENTS.md`. For current status, see the
[Project board](https://github.com/users/chatondearu/projects/3) and
[milestones](https://github.com/chatondearu/fluffmind/milestones).

## Founding principle

> Plain markdown files + frontmatter, stored in a Git repo, are the **only** source of
> truth for note content.

Everything else follows from this:

- Compatible with existing Foam/Obsidian vaults out of the box — no migration.
- Always possible to walk away from the app and keep using the files in any other
  editor — no lock-in.
- Git stays the real history (readable diffs), never a proprietary database.

This does **not** rule out Postgres (see Auth & workspaces below) — Postgres holds
identity, workspace membership, and sync bookkeeping, but **never note content**. If
the database is lost, notes are still fully recoverable from Git; only accounts and
permissions need reconstructing.

## Monorepo shape

```
apps/web/                 Nuxt app (UI + Nitro server)
packages/design-system/   Reka UI + UnoCSS + Material Design 3 tokens
packages/editor-blocks/   Custom block editor (P3)
packages/integrations/    GitHub OAuth/API, Git plumbing, MCP SDK (P1)
packages/db/              Drizzle schema + Better Auth (P2)
```

No separate `vault-engine` package: the markdown/frontmatter parsing, wikilink
extraction, and the in-memory index (`apps/web/server/vault/`) have exactly one
consumer today. It gets extracted into its own package the day a second consumer
(e.g. a standalone MCP process, see below) actually needs it — not before.

## Git sync (P1 — the project's #1 technical risk)

The naive model — every client (browser tab, MCP agent) does its own `git` operations
— doesn't survive multi-account/multi-device: concurrent writers on the same repo risk
corruption or endless conflicts.

Instead: **only the server ever touches Git.** One working copy per workspace, on
persistent disk. Every write (from the web UI, a local MCP agent, or a remote MCP
agent) goes through a single server-side function — `writeToWorkspace` — that:

1. acquires a lock scoped to that workspace,
2. applies the change to the working copy,
3. commits, pushes, and rebases automatically on a rejected push,
4. releases the lock and updates the read index incrementally.

Clients are thin HTTP callers, never a second Git writer. This also makes multi-device
"free": there's nothing device-specific to reconcile, because the server is the only
stateful Git actor.

**Known MVP limit:** this assumes one server instance owns a given workspace at a
time. Scaling out horizontally per workspace would need a distributed lock (Postgres
advisory lock or Redis) — deliberately out of scope until the need is proven (see the
P7 milestone).

**Spike shipped**: `writeToWorkspace` exists (`apps/web/server/vault/write.ts` +
`packages/integrations/src/git.ts`), validated against a disposable GitHub repo —
concurrent writes serialize without loss, a clean external edit rebases automatically,
a real conflict aborts the rebase and surfaces a 409 with the local commit intact
(never lost, only unpushed). Still spike-scoped: a single hardcoded workspace (real
multi-workspace resolution needs P2's Postgres), editing existing notes only (no
creation yet), and no detection of a workspace left in a diverged state across a
server restart.

- **`simple-git` (shells to the real `git` binary), not `isomorphic-git`.** Rebase-on-
  rejected-push needs to be reliable — a real, battle-tested `git` beats trusting
  isomorphic-git's lower-level rebase support. Cost: the runtime image needs the `git`
  binary installed (`apk add git` in the `dev`/`runner` Dockerfile stages), and every
  working copy gets a repo-local `user.name`/`user.email` set explicitly (the server
  commits on behalf of users — it can't assume a human's global git config exists in
  whatever environment it runs in).
- **Commit always happens before push is attempted.** This is what makes "no data
  loss" simple: a rejected push or a real rebase conflict (`git rebase --abort`) never
  discards the commit, it only leaves the workspace unsynced with the remote.

## Auth & workspaces (P2)

Better Auth + Drizzle + Postgres, using Better Auth's `organization` plugin rather
than a hand-rolled workspace schema.

- **Bootstrap:** the first account created on any instance (local or hosted) becomes
  that instance's admin — detected by "no user exists yet," not a separate setup
  wizard.
- **Roles:** three per workspace — `read` / `write` / `owner`.
- **Permission source:** if a workspace is linked to a GitHub repo, its members'
  roles are synced from that repo's GitHub collaborators (GitHub is the source of
  truth while linked — no parallel manual editing). If not linked, an owner/admin
  manages permissions manually.

## Editor (P3 — the project's #2 technical risk)

A from-scratch block editor (`packages/editor-blocks`), not a third-party library —
deliberately, to avoid inheriting a generalist editor's compatibility risk. Design:

- **One block = one Vue component**, registered via `defineBlock()` — block drag &
  drop, custom block types (wikilink, backlinks embed, Kanban card, transclusion) all
  go through the same registry.
- **Rich text scope kept deliberately small**: `contenteditable` + markdown-as-you-type
  parsing for common marks (bold, italic, inline code, links), *not* a full
  ProseMirror-style rich-text engine with marks/selection/IME handling. That's the
  single biggest hidden-cost trap for a "simple" custom editor — scope it down on
  purpose, expand only if a real limitation shows up in use.
- Markdown round-trip has to stay clean enough that a file edited through the block
  UI still opens sanely in VS Code/Obsidian afterwards.

## Design system

Reka UI (headless components) + UnoCSS (styling) + Material Design 3 (color tokens),
all in `packages/design-system`.

- MD3 tokens are generated from a seed color into CSS custom properties
  (`--md-<role>`), light and dark variants both emitted.
- **Transparency needed a real fix, not the obvious one.** UnoCSS's built-in color
  parser only understands literal color syntax (hex, `rgb()`, ...) — a bare
  `var(--md-primary)` theme color makes opacity modifiers (`bg-primary/50`) silently
  no-op. The preset instead uses
  `color-mix(in srgb, var(--md-x) calc(%alpha * 100%), transparent)`, using Uno's
  `%alpha` placeholder (a 0–1 fraction, hence the `* 100%` to satisfy `color-mix()`'s
  percentage requirement).
- `packages/design-system` has **two entry points on purpose**: `index.ts` (tokens,
  Uno preset — Node-safe) and `components.ts` (the Vue components). `uno.config.ts` is
  loaded by `unconfig`/`jiti` in a plain Node context that can't parse `.vue` files —
  mixing both exports in one barrel file breaks the production build. See
  `packages/design-system/AGENTS.md`.

## MCP server (P5)

Handlers (`search_notes`, `read_note`, `write_note`, `list_backlinks`, `create_task`,
`get_graph`) are written **once**, in `apps/web/server`, and reused by two transports:
a stdio bridge for local agents (e.g. Claude Code on the same machine) and an
authenticated HTTP/SSE endpoint for remote agents. Both call the exact same
`writeToWorkspace` path as the web UI — an agent's write is indistinguishable from a
user's, including the single-writer-per-workspace guarantee.

## Deployment

100% web, no native app. The same Docker image runs locally or on a public server
(e.g. Coolify) — see `docker-compose.yml` / `docker-compose.coolify.yml`. Postgres is
part of the stack in both modes, even before P2 lands, so the deployment shape doesn't
need reworking later.

## Roadmap

P0 (foundations — read-only vault engine + viewer + design system) is done. Next:
P1 (Git sync) → P2 (auth/workspaces) → P3 (block editor) → P4 (Kanban) → P5 (MCP) →
P6 (hardening) → P7 (stretch: multi-instance scale-out, static publishing). P1 is
sequenced before P3 despite being less visible, because it's the higher technical
risk of the two.
