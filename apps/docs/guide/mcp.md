# MCP for AI agents

Fluffmind exposes vault tools over [Model Context Protocol](https://modelcontextprotocol.io):

| Tool | Description |
| ---- | ----------- |
| `get_workspace` | Confirm bound workspace + token scope |
| `search_notes` | Search by title or id |
| `read_note` | Read markdown + frontmatter |
| `write_note` | Create/update via `writeToWorkspace` (write scope) |
| `list_backlinks` | Incoming wikilinks |
| `get_graph` | Vault link graph |
| `create_task` | Append `- [ ]` task (write scope; default note: `inbox/tasks`) |

## Remote HTTP (recommended for staging / production)

1. Sign in as a workspace **owner**.
2. Open **Settings → workspace → MCP**.
3. Enable MCP, create a named token (`read` or `write`).
4. Copy the secret once and configure your client:

```json
{
  "mcpServers": {
    "fluffmind": {
      "url": "https://your-fluffmind.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer fm_mcp_…"
      }
    }
  }
}
```

The Bearer token binds the agent to **that workspace**. Revoke tokens from the same
settings page. Disabling MCP rejects tokens even if they are still valid hashes.

Session cookies still work as a fallback when no Bearer header is sent (browser).

## Local (stdio)

For Claude Code, Cursor, or another stdio MCP client on the same machine:

```sh
VAULT_PATH=/absolute/path/to/your/vault pnpm --filter @fluffmind/web mcp:stdio
```

Example Cursor config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fluffmind": {
      "command": "pnpm",
      "args": ["--filter", "@fluffmind/web", "mcp:stdio"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

See [PRD-036](https://github.com/chatondearu/fluffmind/blob/main/prd/PRD-036-mcp-workspace-tokens.md)
and [ADR-010](https://github.com/chatondearu/fluffmind/blob/main/foam/decisions/ADR-010-mcp-workspace-tokens.md).
