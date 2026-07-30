# MCP workspace tokens — design

**Date:** 2026-07-30  
**PRD:** [[../../../prd/PRD-036-mcp-workspace-tokens|PRD-036]]  
**ADR:** [[../../../foam/decisions/ADR-010-mcp-workspace-tokens|ADR-010]]

## Problem

P5 MCP HTTP auth uses Better Auth **session cookies** and the **active workspace**.
Remote MCP clients (Cursor, Claude Code) cannot send those cookies reliably.

## Solution (v1)

1. Owner enables MCP on a workspace (`workspace_config.mcpEnabled`).
2. Owner creates named tokens with scope `read` | `write`.
3. Plaintext `fm_mcp_<prefix>_<secret>` shown once; only SHA-256 hash stored.
4. Client calls `https://<host>/api/mcp` with `Authorization: Bearer <token>`.
5. Server resolves workspace + scope from hash; rejects if disabled/revoked.
6. Tool `get_workspace` confirms context. No multi-workspace listing in v1.

## Auth resolution order on `/api/mcp`

1. Bearer `fm_mcp_…` → token auth
2. Else session + `requireWorkspacePermission(note:write)` (existing)
3. Else auth disabled → `default` workspace (existing)

## Token format

`fm_mcp_<8-char-prefix>_<32+ hex secret>`

- Prefix stored for UI (`fm_mcp_ab12cd34…`)
- Hash = SHA-256 of full token string (hex)

## APIs (owner-only)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/workspaces/mcp` | Status + token list (no secrets) |
| PATCH | `/api/workspaces/mcp` | `{ mcpEnabled: boolean }` |
| POST | `/api/workspaces/mcp/tokens` | `{ name, scope }` → `{ token, … }` once |
| DELETE | `/api/workspaces/mcp/tokens/:id` | Revoke |

## UI

Settings → workspace → section MCP: toggle, create form, token table, Cursor snippet.
