# ADR-004 — Vault engine colocated in apps/web (for now)

- **Status**: accepted
- **Date**: 2026-07-06
- **Tags**: #architecture

## Context

The markdown parser, wikilink index, and reader currently have exactly one consumer
(the Nuxt server).

## Decision

Keep vault engine code in `apps/web/server/vault/`. Do **not** extract a
`packages/vault-engine` until a second consumer exists (e.g. standalone MCP process).

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Premature `vault-engine` package | YAGNI; extra publish/version overhead |

## Consequences

- **Positive**: Simpler monorepo; faster iteration in P0–P2.
- **Constraint**: Revisit when P5 MCP might run outside the web process.

## References

- `AGENTS.md` § Monorepo layout
- `DESIGN.md` § Monorepo shape
