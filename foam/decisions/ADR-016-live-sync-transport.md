# ADR-016 — Live sync transport (mesh peers, not Git)

- **Status**: accepted
- **Date**: 2026-11-13
- **Tags**: #architecture #data #sync

## Context

[[ADR-002-server-side-git-sync|ADR-002]] made Git the live write path (single server
writer + locks). That stack grew ops-heavy ([[ADR-007-distributed-workspace-lock|ADR-007]],
admin repair). Explore map
[#141](https://github.com/chatondearu/fluffmind/issues/141) locked: Git stays
history/backup/GitHub interop only; live sync must cover solo/portable **and**
hosted multi-workspace. Ticket
[#142](https://github.com/chatondearu/fluffmind/issues/142).

Product shape: local **clients** attach one or more vault folders (projects);
an optional **host** instance is always-on so those projects appear there too;
web hosted talks to the host without requiring a daemon on the user's machine.

## Decision

1. **Live sync** uses a **mesh/P2P-style** protocol (iroh-shaped transport +
   relay for NAT/browsers). Peers replicate vault files. Choosing a concrete
   library is deferred with runtime (explore 6C).
2. **Host is a hub replica**, not an authoritative master. Conflict/authority
   follows **path ownership** (layout ticket / future ADR), not “server wins”.
3. **Facades**: portable/solo → local daemon + thin UI; hosted web → HTTP/WS to
   the instance’s always-on sync peer. Same protocol underneath (**2C**).
4. **Granularity for the first PRD**: whole-file sync with last-writer-wins per
   path (fits path-owned writers / agents). Character-level CRDT (Loro) stays
   out until a later ticket proves same-note collab need.
5. **Git** remains export/history/GitHub interop only — not the live protocol.
   [[ADR-002-server-side-git-sync|ADR-002]] / [[ADR-007-distributed-workspace-lock|ADR-007]]
   stay the *current* implementation until the transition ticket
   ([#144](https://github.com/chatondearu/fluffmind/issues/144)) supersedes them.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Central non-Git blob store first, mesh later | Two live protocols; breaks “solo + hosted one redesign” |
| Daemon required even for hosted web | Blocks Coolify/browser-only users |
| Server (or client) always wins on conflict | Reintroduces a single-writer master; contradicts path ownership |
| CRDT text in the first PRD | Premature given layout anti-conflict; editor keeps CRDT out of UI ([[ADR-008-inline-rich-contenteditable|ADR-008]]) |

## Consequences

- **Positive**: One mental model (peers + optional host); solo without server stays
  possible; hosted web stays install-free.
- **Negative**: Need relay (or accept NAT pain); Wasm browser mesh stays heavy —
  prefer daemon or host peer facades.
- **Constraint**: Upcoming sync PRD must not reintroduce Git as live transport;
  must not treat host as master of path content.

## References

- Explore: [#141](https://github.com/chatondearu/fluffmind/issues/141),
  [#142](https://github.com/chatondearu/fluffmind/issues/142)
- Research: [#145](https://github.com/chatondearu/fluffmind/issues/145),
  `research/peervault-iroh-loro` branch
- [[../architecture/rethink-sync|Rethink sync]]

## Addendum — T8 transport spike (2026-11-14)

**Spike outcome:** ship a thin `MeshSyncTransport` interface plus an
**in-memory stub** (`InMemoryMeshHub`) under
`packages/integrations/src/mesh/`. Real **iroh** (or other Wasm/native mesh
library) is **deferred** until a later ticket; the stub proves two peers can
exchange whole-file updates in Vitest without locking the runtime choice.

**Import path** (package barrel `packages/integrations/src/index.ts` was not
re-exported in this spike — path-owned by other work):

```ts
import {
  createInMemoryMeshHub,
  type MeshSyncTransport,
  type MeshFileUpdate,
} from '@fluffmind/integrations/src/mesh'
```

Or relative: `packages/integrations/src/mesh` → `./mesh` / `./mesh/index.ts`.

**Interface names:** `MeshFileUpdate`, `MeshFileUpdateHandler`,
`MeshSyncTransport`, `InMemoryMeshHub`, `createInMemoryMeshHub`.

## Addendum — H2 hardening transport (2026-11-14)

**Spike outcome:** **iroh still deferred.** `@number0/iroh` ships optional
platform binaries (incl. `linux-x64-musl`) but pulling it needs a new package
dependency + `pnpm-workspace.yaml` `allowBuilds` / lockfile changes outside the
mesh path lock for this ticket. Instead we landed a **localhost TCP hub**
(`startTcpMeshHub` + `connectTcpMeshPeer`) using Node `net` only: two peers
talk over real sockets (line-delimited JSON), still behind `MeshSyncTransport`.
`InMemoryMeshHub` remains for in-process unit tests.

**New names:** `TcpMeshHubHandle`, `startTcpMeshHub`, `connectTcpMeshPeer`.

**Proven:** Vitest `tcp-hub.test.ts` — cross-socket whole-file update between
two Node peers connected to the same hub.
