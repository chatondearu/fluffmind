# ADR-010 — MCP workspace Bearer tokens (hash-only)

- **Status**: accepted
- **Date**: 2026-07-30
- **Tags**: #auth #mcp

## Context

Remote MCP clients need non-interactive auth to `/api/mcp`. Session cookies are
browser-centric. Tokens must be revocable and never recoverable from the database.

## Decision

- Store **SHA-256 hashes** of MCP tokens (`fm_mcp_…`); never persist plaintext.
- Bind each token to one workspace + scope (`read` | `write`).
- Require explicit `mcpEnabled` on the workspace before accepting tokens.
- Keep session-cookie auth as fallback when no Bearer is present.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Encrypt tokens at rest (reversible) | Leak of DB + key recovers secrets |
| User/instance tokens for multi-workspace list | Out of scope for v1 complexity |
| Path `/api/workspaces/:id/mcp` | Token already binds workspace; one URL per instance is simpler for Cursor |

## Consequences

- **Positive**: Agents work against staging/prod; owners control enablement and revocation.
- **Negative**: One Cursor MCP entry per workspace (no discovery).
- **Constraint**: Write tools must check scope; disabled MCP rejects even valid hashes.

## Supersession

Naming (`fm_mcp_…`, `mcpEnabled`, owner `/api/workspaces/mcp`) is **partially superseded**
by [[ADR-011-agent-tokens-and-cli|ADR-011]] (agent tokens + CLI/REST). The hash-only,
workspace-bound, read/write model from this ADR remains in force.

## References

- [[../../prd/PRD-036-mcp-workspace-tokens|PRD-036]]
- `docs/superpowers/specs/2026-07-30-mcp-workspace-tokens-design.md`
- [[ADR-006-better-auth-workspaces|ADR-006]]
- [[ADR-011-agent-tokens-and-cli|ADR-011]]
