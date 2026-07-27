# MCP for AI agents

Fluffmind exposes vault tools over [Model Context Protocol](https://modelcontextprotocol.io):

| Tool | Description |
| ---- | ----------- |
| `search_notes` | Search by title or id |
| `read_note` | Read markdown + frontmatter |
| `write_note` | Create/update via `writeToWorkspace` |
| `list_backlinks` | Incoming wikilinks |
| `get_graph` | Vault link graph |
| `create_task` | Append `- [ ]` task (default note: `inbox/tasks`) |

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

## Remote (HTTP)

When the Nuxt app is running, agents can connect to **`/api/mcp`** using Streamable
HTTP. If authentication is enabled (`DATABASE_URL` is set and `AUTH_DISABLED` is not
`true`), the client must send the same session cookies as the web UI, or authenticate
first.
