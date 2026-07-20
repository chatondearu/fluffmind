# Vision & positioning

#product

## What this product is

Fluffmind is a **self-hostable, git-backed personal knowledge management (PKM)** app —
an open-source alternative to Obsidian. Plain markdown files with wikilinks stay the
single source of truth (stored in a Git repo, no lock-in). The app adds a modern web
experience: custom block editor, server-side Git sync, multi-account workspaces, and an
MCP server for AI agents.

See also [[../architecture/roadmap|Roadmap]] and `DESIGN.md` for architecture rationale.

## Audience

- **Primary users**: knowledge workers who already use Foam/Obsidian-style vaults and
  want a collaborative, self-hosted web UI without proprietary note storage.
- **Operators / admins**: self-hosters (Docker/Coolify) who need Postgres-backed auth,
  workspace isolation, and optional GitHub collaborator sync.

## Non-goals (for now)

- Native desktop/mobile apps (100% web).
- Storing note content in Postgres (identity and membership only — see
  [[../decisions/ADR-001-markdown-git-source-of-truth|ADR-001]]).
- Third-party block editor frameworks (custom editor in P3 — see `DESIGN.md`).
- Distributed lock for shared-volume multi-instance: [[../decisions/ADR-007-distributed-workspace-lock|ADR-007]] / [[../../prd/PRD-031-p7-distributed-workspace-lock|PRD-031]] (P7a). Multi-disk scale-out still deferred (P7b).

## Related

- [[../features/index|Feature catalog]]
- [[../../prd/PRD-023-p2-auth-workspaces|PRD-023 P2 auth & workspaces]] (shipped)
- [GitHub Project board](https://github.com/users/chatondearu/projects/3)
