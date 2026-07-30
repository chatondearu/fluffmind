# PRD-036 — MCP workspace tokens

- **Status**: implemented
- **Depends on**: [[PRD-026-p5-mcp-server|PRD-026]] (MCP tools + `/api/mcp`)
- **Design**: `docs/superpowers/specs/2026-07-30-mcp-workspace-tokens-design.md`
- **ADR**: [[../foam/decisions/ADR-010-mcp-workspace-tokens|ADR-010]]

## Goal

Let workspace owners enable MCP for a workspace and issue **named Bearer tokens**
(`read` or `write`) so remote agents (Cursor, Claude Code, etc.) can call
`/api/mcp` without browser session cookies.

## Exit criteria

- [x] Owner can toggle `mcpEnabled` and create/revoke named tokens (secret shown once)
- [x] `Authorization: Bearer fm_mcp_…` resolves workspace + scope on `/api/mcp`
- [x] Write tools denied for `read` scope; MCP off → 403 even with valid token
- [x] Tool `get_workspace` returns id/name/slug/scope
- [x] Session cookie fallback preserved when no Bearer
- [x] Docs updated (guide MCP + README snippet)

## Out of scope (v1)

- Multi-workspace discovery / user-level tokens
- Stdio transport changes
- Fine-grained per-tool OAuth scopes
- Rate limiting
