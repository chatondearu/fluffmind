# Agent access: MCP, CLI & skill

Fluffmind exposes three ways for an AI agent (or a script, or CI) to work with a
remote vault. All three sit on the exact same auth (workspace **agent tokens**,
`fm_agent_…`) and the same server-side vault handlers — pick the surface that
matches your client, not a different capability set.

| Surface | Best for | Auth | Docs |
| ------- | -------- | ---- | ---- |
| **MCP** (`/api/mcp`, stdio) | Native MCP tool-calling clients (Cursor, Claude Code) | Bearer agent token or session | [MCP for AI agents](/guide/mcp) |
| **CLI** (`fluffmind`) | Shell scripts, CI, agents that shell out | `FLUFFMIND_URL` + `FLUFFMIND_TOKEN` | below |
| **Skill** (`skills/fluffmind/SKILL.md`) | Coding agents that read skills and prefer low-context tool use | same as CLI (it just invokes the CLI) | below |

Prefer the **CLI or skill** for agent workflows — a single process call with a
small JSON response is far cheaper in context than loading full MCP tool schemas.
Reach for **MCP** when the client already has a native tool-calling UI that pays
that schema cost once, for every server (e.g. Cursor's own MCP panel).

> **Prerequisite: auth must be enabled.** Agent tokens live in Postgres and are
> checked against `workspaceConfig`, so this whole surface (`Settings → Agents`,
> `/api/agent/*`, `/api/mcp` with a Bearer token) requires `DATABASE_URL` to be
> set **and** `AUTH_DISABLED` to **not** be `true`. In P1 no-auth mode (no
> `DATABASE_URL`, or `AUTH_DISABLED=true`) there is no owner/workspace concept
> to attach a token to, so token creation and remote CLI/MCP access don't work —
> only the local, unauthenticated MCP connection with implicit write scope on
> the default workspace is available.

## 1. Create an agent token

1. Sign in as a workspace **owner**.
2. Open **Settings → workspace → Agents**.
3. Enable agent access, create a named token (`read` or `write` scope).
4. Copy the secret once — it starts with `fm_agent_…`. Legacy `fm_mcp_…` tokens
   from before this rename still work.

The same token authenticates MCP, the REST `/api/agent/*` routes, and the CLI —
there's only one token model to manage and revoke.

## 2. Install the CLI

```sh
curl -fsSL https://raw.githubusercontent.com/chatondearu/fluffmind/main/scripts/install-cli.sh | bash
```

`@fluffmind/cli` is not published on npm yet (still a private workspace
package), so this writes a `~/.local/bin/fluffmind` wrapper against a local
monorepo checkout instead — set `FLUFFMIND_ROOT` if the script can't detect it
(e.g. when piped through `curl | bash`, which can't see its own path on disk).
See `scripts/install-cli.sh` for override env vars (`FLUFFMIND_INSTALL_MODE`,
`FLUFFMIND_BIN_DIR`). A Nix flake package is also available:
`nix run github:chatondearu/fluffmind#fluffmind-cli`.

The CLI requires **Node 22.6+** (for `--experimental-strip-types`, since the
package ships TypeScript source directly). Its shebang uses `env -S`, which
Alpine's default busybox `env` doesn't support — on Alpine, either install GNU
coreutils' `env`, or run it via `pnpm --filter @fluffmind/cli start` instead of
the `fluffmind` binary directly.

## 3. Configure and use it

```sh
export FLUFFMIND_URL=https://your-fluffmind.example.com
export FLUFFMIND_TOKEN=fm_agent_...
fluffmind whoami
```

Config precedence: `--url`/`--token` flags > `FLUFFMIND_URL`/`FLUFFMIND_TOKEN` env
vars > `~/.config/fluffmind/config.json`.

```sh
fluffmind search "<query>" [--limit N]
fluffmind read <note-id>
fluffmind write <note-id> [--file path | --stdin]
fluffmind backlinks <note-id>
fluffmind graph
fluffmind task "<text>" [--note inbox/tasks]
fluffmind config
```

Output is JSON by default (`--pretty` for humans). Exit codes: `0` ok, `1`
business error, `2` auth/config, `3` network/server error.

## 4. Install the skill (for coding agents)

Copy `skills/fluffmind/SKILL.md` from the
[Fluffmind repo](https://github.com/chatondearu/fluffmind/blob/main/skills/fluffmind/SKILL.md)
into your agent's skills directory (e.g. `.cursor/skills/fluffmind/SKILL.md` or
`~/.cursor/skills/fluffmind/SKILL.md`). It documents the same setup and commands
above, plus hard rules the agent must follow: never invent endpoints, never commit
tokens, and when to fall back to MCP instead.

## REST reference

The CLI and skill call `/api/agent/*` under the hood — a JSON mirror of the MCP
tools, Bearer-only (no session-cookie fallback):

| Method | Path | Min scope |
| ------ | ---- | --------- |
| GET | `/api/agent/workspace` | read |
| GET | `/api/agent/notes/search?q=&limit=` | read |
| GET | `/api/agent/notes/:id` | read |
| PUT | `/api/agent/notes/:id` (`{ content }`) | write |
| GET | `/api/agent/notes/:id/backlinks` | read |
| GET | `/api/agent/graph` | read |
| POST | `/api/agent/tasks` (`{ content, noteId? }`) | write |

See [PRD-037](https://github.com/chatondearu/fluffmind/blob/main/prd/PRD-037-agent-access-cli-skill.md)
and [ADR-011](https://github.com/chatondearu/fluffmind/blob/main/foam/decisions/ADR-011-agent-tokens-and-cli.md).
