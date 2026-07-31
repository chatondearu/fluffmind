# Architecture Decision Records

#architecture

| ADR | Title | Status |
| --- | ----- | ------ |
| [[ADR-001-markdown-git-source-of-truth|ADR-001]] | Markdown + Git as note source of truth | accepted |
| [[ADR-002-server-side-git-sync|ADR-002]] | Server-side Git sync (single writer) | accepted |
| [[ADR-003-simple-git-binary|ADR-003]] | simple-git + host `git` binary | accepted |
| [[ADR-004-vault-engine-colocated|ADR-004]] | Vault engine in `apps/web` (for now) | accepted |
| [[ADR-005-design-system-dual-entry|ADR-005]] | design-system dual entry points | accepted |
| [[ADR-006-better-auth-workspaces|ADR-006]] | Better Auth + hybrid GitHub sync | accepted |
| [[ADR-007-distributed-workspace-lock|ADR-007]] | Distributed workspace lock (PG advisory + flock) | accepted |
| [[ADR-008-inline-rich-contenteditable|ADR-008]] | Contenteditable inline marks (markdown-as-you-type) | accepted |
| [[ADR-009-github-app-installations|ADR-009]] | GitHub App installations for repo access (self-host) | accepted |
| [[ADR-010-mcp-workspace-tokens|ADR-010]] | MCP workspace Bearer tokens (hash-only) | accepted |
| [[ADR-011-agent-tokens-and-cli|ADR-011]] | Agent tokens, REST surface & CLI | accepted |
| [[ADR-012-workspace-content-roots|ADR-012]] | Workspace content roots (logical vault subset) | accepted |
| [[ADR-013-admin-dangerous-workspace-ops|ADR-013]] | Instance-admin dangerous workspace operations | accepted |
| [[ADR-014-admin-github-panel|ADR-014]] | Instance-admin GitHub App panel | accepted |

Template: [[ADR-template|ADR-template]]

Distilled from `DESIGN.md`, P0–P2 implementation, P7a lock design, and `docs/superpowers/` specs.
