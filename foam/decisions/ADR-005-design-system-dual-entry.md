# ADR-005 — design-system dual entry points (index vs components)

- **Status**: accepted
- **Date**: 2026-07-06
- **Tags**: #architecture

## Context

UnoCSS config is loaded by `unconfig`/`jiti` in plain Node — it cannot parse `.vue`
files. A single barrel exporting Vue components breaks production token generation.

## Decision

`packages/design-system` exposes:

- `index.ts` — tokens, Uno preset (Node-safe)
- `components.ts` — Vue components (Reka UI wrappers)

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Single barrel export | Breaks `uno.config.ts` in Node context |

## Consequences

- Import paths must match context (see `packages/design-system/AGENTS.md`).
- Transparency uses `color-mix` + `%alpha` because Uno cannot parse bare `var(--md-*)`.

## References

- `DESIGN.md` § Design system
- `packages/design-system/AGENTS.md`
