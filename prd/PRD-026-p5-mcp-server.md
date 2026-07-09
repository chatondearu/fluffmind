# PRD-026 — MCP server (P5)

- **Status**: approved
- **GitHub**: [#26](https://github.com/chatondearu/fluffmind/issues/26) (epic)
- **Milestone**: P5 — MCP server

## Goal

Expose the vault to AI agents via Model Context Protocol: tool handlers written once in
`apps/web/server/mcp`, reused by a **stdio bridge** (local agents, e.g. Claude Code)
and an **authenticated Streamable HTTP** endpoint (`/api/mcp`) for remote deployment.

All writes call `writeToWorkspace` — same path as the web UI and REST API.

## Exit criteria

- [x] MCP tools: `search_notes`, `read_note`, `write_note`, `list_backlinks`, `get_graph`, `create_task`
- [x] Local stdio server runs against `VAULT_PATH` (auth disabled / single-workspace dev)
- [x] Remote `/api/mcp` requires session when auth is enabled
- [x] Handler unit tests with temp vault fixtures
- [x] README / `.env.example` document MCP setup for Cursor and Claude Code

## Tools (P5 scope)

| Tool | Description |
| ---- | ----------- |
| `search_notes` | Search note titles and ids (case-insensitive) |
| `read_note` | Full markdown body + frontmatter metadata |
| `write_note` | Create or update a note via `writeToWorkspace` |
| `list_backlinks` | Notes linking to a given note id |
| `get_graph` | Vault link graph (nodes + edges) |
| `create_task` | Append `- [ ] task` to a note (default `inbox/tasks`) |

## Out of scope (P5)

- MCP resources / prompts beyond minimal server instructions
- Per-tool OAuth scopes (session + workspace membership is enough)
- Multi-workspace vault index switching (reads use current `VAULT_PATH` like REST today)
- Standalone MCP process outside the web repo (stdio entry lives in `apps/web`)

## Architecture constraints

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Notes remain markdown on disk |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | `writeToWorkspace` only |
| [[../foam/decisions/ADR-004-vault-engine-colocated|ADR-004]] | Handlers colocated in `apps/web/server` |
| `DESIGN.md` § MCP | Handlers once, two transports |

## Issue breakdown

| Issue | Scope |
| ----- | ----- |
| #73 | Vault MCP tool handlers |
| #74 | Handler unit tests |
| #75 | Stdio bridge (`pnpm mcp:stdio`) |
| #76 | Authenticated `/api/mcp` Streamable HTTP route |
| #77 | Docs: README, `.env.example`, example Cursor config |
