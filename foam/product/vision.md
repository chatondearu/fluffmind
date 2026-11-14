# Vision & positioning

#product

## What this product is

Fluffmind is a **self-hostable personal knowledge management (PKM)** app — an
open-source alternative to Obsidian. Plain markdown files with wikilinks stay the
single source of truth (no lock-in). The app adds a modern web experience: custom
block editor, multi-account workspaces, and an MCP server for AI agents.

**Live sync destiny** is a **mesh of peers** (devices, agents, hosted hub replica)
replicating vault files — see [[../architecture/rethink-sync|Rethink sync]] and
[[../../prd/PRD-042-sync-rethink|PRD-042]]. **Git remains history, backup, and
GitHub interop**, not the live write path once a vault is on mesh-live
([[../decisions/ADR-018-sync-transition-dual-mode|ADR-018]] dual-mode during
transition). Today many vaults still use legacy Git-live ([[../decisions/ADR-002-server-side-git-sync|ADR-002]]).

See also [[../architecture/roadmap|Roadmap]] and `DESIGN.md` for architecture rationale.

## Audience

- **Primary users**: knowledge workers who already use Foam/Obsidian-style vaults and
  want a collaborative, self-hosted web UI without proprietary note storage.
- **Operators / admins**: self-hosters (Docker/Coolify) who need Postgres-backed auth,
  workspace isolation, and optional GitHub collaborator sync.

## Non-goals (for now)

- Native desktop/mobile **GUI** apps (still 100% web UI in the browser). A **portable
  solo server package** (embedded Node + Nitro, no Docker/Postgres) is in scope —
  [[../../prd/PRD-032-portable-solo-package|PRD-032]].
- Storing note content in Postgres (identity and membership only — see
  [[../decisions/ADR-001-markdown-git-source-of-truth|ADR-001]]).
- Third-party block editor frameworks (custom editor in P3 — see `DESIGN.md`).
- Multi-disk scale-out (P7b) and static publishing (P7c) under epic [#28](https://github.com/chatondearu/fluffmind/issues/28).
- Character-level same-note CRDT collab in the first sync rethink (PRD-042 non-goal).

## Related

- [[../features/index|Feature catalog]]
- [[../../prd/PRD-023-p2-auth-workspaces|PRD-023 P2 auth & workspaces]] (shipped)
- [[../../prd/PRD-042-sync-rethink|PRD-042 sync rethink]] (in progress — PLAN-042)
- [GitHub Project board](https://github.com/users/chatondearu/projects/3)
