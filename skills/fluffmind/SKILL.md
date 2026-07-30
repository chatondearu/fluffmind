---
name: fluffmind
description: >-
  Search, read, write notes, list backlinks, get the link graph, and create
  tasks in a remote Fluffmind vault via the `fluffmind` CLI. Use when the user
  asks to search, read, edit, or create notes/tasks in a Fluffmind workspace,
  or mentions FLUFFMIND_URL/FLUFFMIND_TOKEN.
---

# Fluffmind agent access

Fluffmind is a git-backed PKM app. Agents talk to a remote workspace over a small
REST API (`/api/agent/*`), fronted by the `fluffmind` CLI.

**Prefer the CLI over MCP.** The CLI is a single JSON-in/JSON-out process call —
far cheaper in context than loading MCP tool schemas. Only reach for MCP (see
"When MCP is appropriate" below) when the client is a native MCP tool-calling UI
(e.g. Cursor's own MCP panel) that already pays that cost for other servers too.

## Setup

**Prerequisite:** the Fluffmind server must have auth enabled (`DATABASE_URL`
set and `AUTH_DISABLED` not `true`) — agent tokens and `/api/agent/*` don't
exist in no-auth (P1) mode. If `fluffmind whoami` fails with a config/auth
error, ask the workspace owner to confirm auth is enabled before creating a
token.

Requires two environment variables (get them from workspace **Settings → Agents**
in the Fluffmind app — the owner creates a named token there once):

```sh
export FLUFFMIND_URL=https://your-fluffmind.example.com
export FLUFFMIND_TOKEN=fm_agent_...
```

If `fluffmind` isn't on `PATH` yet, install it first — don't hand-roll HTTP calls.
Requires **Node 22.6+**; if the install script can't find its own repo checkout
(e.g. curl-piped with no local clone), set `FLUFFMIND_ROOT` to a clone of the
repo:

```sh
curl -fsSL https://raw.githubusercontent.com/chatondearu/fluffmind/main/scripts/install-cli.sh | bash
```

Verify setup:

```sh
fluffmind whoami
```

## Commands

All commands print JSON to stdout by default (add `--pretty` for human-readable
output) and use stable exit codes: `0` ok, `1` business error (e.g. 404), `2`
missing/invalid config or auth (401/403), `3` network/server error.

```sh
fluffmind whoami                                   # confirm workspace + token scope
fluffmind search "<query>" [--limit N]              # search by title/id
fluffmind read <note-id>                            # read markdown + frontmatter
fluffmind write <note-id> [--file path | --stdin]   # create/update (needs write scope)
fluffmind backlinks <note-id>                       # incoming wikilinks
fluffmind graph                                     # vault link graph
fluffmind task "<text>" [--note inbox/tasks]        # append a task (needs write scope)
fluffmind config                                    # show resolved url/token (redacted)
```

Note ids are vault-relative paths without extension (e.g. `projects/roadmap`, not
`projects/roadmap.md`). `write` content precedence is `--file` > `--stdin` >
positional argument — pipe large content instead of quoting it inline:

```sh
echo "# New note" | fluffmind write projects/new-note --stdin
```

## Hard rules

- **Never invent endpoints or flags.** If a task needs something not listed above,
  say so instead of guessing at an undocumented `/api/agent/*` route or CLI flag.
- **Never commit, print in a PR/issue, or paste into chat logs** the value of
  `FLUFFMIND_TOKEN` or any `fm_agent_…`/`fm_mcp_…` string. Treat it like a
  password — env var or local config file only.
- All writes go through the server's `writeToWorkspace` — there is no local git
  step for the agent to perform.

## When MCP is appropriate

Use the MCP server (`/api/mcp`, same Bearer token) instead of the CLI when:

- The client is a native MCP tool-calling surface (e.g. Cursor's MCP panel) that
  already has the tool schemas loaded — no extra context cost in that case.
- The workflow benefits from the client's built-in MCP UI (approval prompts, tool
  call rendering) rather than raw shell output.

Setup: see [MCP for AI agents](https://chatondearu.github.io/fluffmind/guide/mcp)
on the Fluffmind docs site.
