# PRD-037 — Agent access (CLI, skill & REST)

- **Status**: approved
- **Date**: 2026-07-30
- **Depends on**: [[PRD-036-mcp-workspace-tokens|PRD-036]] (shipped)
- **Design**: `docs/superpowers/specs/2026-07-30-agent-access-cli-skill-design.md`
- **Plan**: `docs/superpowers/plans/2026-07-30-agent-access-cli-skill.md`
- **ADR**: [[../foam/decisions/ADR-011-agent-tokens-and-cli|ADR-011]]
- **Tags**: #product #agents

## Problem

MCP tools work for Cursor-native agents but consume a lot of context. Operators and
CI need a shell CLI. Agents that prefer skills need a documented, low-context path
that shells out to that CLI. Auth today is named and shaped as MCP-only (`fm_mcp_…`).

## Goals

- [x] Generalize workspace tokens to **agent tokens** (`fm_agent_…`) with compat for `fm_mcp_…`
- [x] Expose REST `/api/agent/*` mirroring MCP tools via the same handlers
- [x] Ship `fluffmind` CLI (`packages/cli`) against that REST API
- [x] Ship installable skill + `scripts/install-cli.sh` + flake package `fluffmind-cli`
- [x] Keep `/api/mcp` working; document CLI vs MCP choice

## Non-goals

- Compiled single binary (deferred)
- Multi-workspace discovery / user-level tokens
- Session cookies on `/api/agent/*`
- Removing MCP

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Operator | `fluffmind search` / `write` from shell or CI with a token |
| Coding agent | Follows skill → runs CLI; avoids loading full MCP tool schemas |
| Cursor power user | Keeps MCP HTTP + Bearer token for native tools |

## Requirements

### Functional

- [x] Rename `mcp_enabled` → `agent_enabled`, table → `workspace_agent_token`
- [x] Issue `fm_agent_…`; accept `fm_agent_…` and `fm_mcp_…` on resolve
- [x] Owner APIs under `/api/workspaces/agent`
- [x] REST agent routes for workspace, search, read, write, backlinks, graph, tasks
- [x] CLI commands: whoami, search, read, write, backlinks, graph, task, config
- [x] Skill at `skills/fluffmind/SKILL.md` + docs how to copy it

### Non-functional

- [x] Writes only via `writeToWorkspace`
- [x] JSON stdout default on CLI; stable exit codes
- [x] Unit tests for token compat + agent route scope + CLI HTTP client mocks

## Related project memory

- ADRs: [[../foam/decisions/ADR-010-mcp-workspace-tokens|ADR-010]], [[../foam/decisions/ADR-011-agent-tokens-and-cli|ADR-011]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]]
- Prior: [[PRD-026-p5-mcp-server|PRD-026]]

## Success metrics

- Agent can search/read/write a remote vault via CLI without MCP enabled in the client
- Existing `fm_mcp_…` tokens still authenticate until rotated
- Docs list three surfaces: MCP, CLI, skill
