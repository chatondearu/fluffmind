# ADR-011 — Agent tokens, REST surface & CLI

- **Status**: accepted
- **Date**: 2026-07-30
- **Tags**: #auth #agents #cli

## Context

PRD-036 shipped workspace Bearer tokens for MCP (`fm_mcp_…`, `mcpEnabled`). We need
the same auth for a REST API and a CLI/skill path that avoids MCP context cost, without
maintaining two token systems.

## Decision

1. **Generalize** MCP tokens to **agent tokens**: `agent_enabled`, table
   `workspace_agent_token`, new plaintext prefix `fm_agent_…`. Accept legacy
   `fm_mcp_…` on resolve. Keep hash-only storage and `read` | `write` scopes.
2. Add **REST** `/api/agent/*` that calls the same vault handlers as MCP; Bearer-only.
3. Ship **`packages/cli`** (`fluffmind`) as a thin HTTP client; TypeScript first.
4. Keep Streamable HTTP **`/api/mcp`** as the MCP transport (path unchanged).
5. Document a Cursor **skill** that prefers the CLI; MCP remains optional.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Separate `fm_cli_…` tokens | Duplicate revoke/UI/audit for the same trust boundary |
| CLI speaks MCP HTTP | Poor shell ergonomics; heavy client for CI |
| Reuse session `/api/notes` with Bearer | Cookie/workspace-active shaped; not agent-first |
| Expand PRD-036 in place pre-ship | Tokens already shipped on main |

## Consequences

- **Positive**: One secret for MCP + CLI; lighter agent path; ops-friendly CLI.
- **Negative**: Rename migration + UI/docs churn; temporary dual prefix support.
- **Constraint**: `/api/agent/*` never uses session cookies in v1; writes stay on
  `writeToWorkspace`.

## References

- [[../../prd/PRD-037-agent-access-cli-skill|PRD-037]]
- [[../../prd/PRD-036-mcp-workspace-tokens|PRD-036]]
- [[ADR-010-mcp-workspace-tokens|ADR-010]] (naming superseded; hash-only model kept)
- `docs/superpowers/specs/2026-07-30-agent-access-cli-skill-design.md`
