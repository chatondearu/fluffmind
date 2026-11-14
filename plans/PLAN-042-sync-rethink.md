# PLAN-042 — Sync rethink (mesh peers, path ownership)

- **Status**: verify
- **Handoff map**: [[../foam/architecture/sync-architecture|sync-architecture]] (2026-11-14)
- **PRD**: [[../prd/PRD-042-sync-rethink|PRD-042]] (approved 2026-11-14)
- **GitHub**: Explore map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- **Date**: 2026-11-14

## Summary

Replace live Git writes with peer mesh sync (whole-file LWW), enforce
`writers/<id>/` + explicit canonical publish, dual-mode migrate from ADR-002/007
live path, and expose portable daemon + hosted WS facades — per approved PRD-042
and ADR-016…019.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Notes stay Markdown on disk; sync must materialize files |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | Remains live path only for **legacy** dual-mode vaults; superseded as target live path after migrate (ADR-018) |
| [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]] | Keep for non-live jobs; **not** for mesh live apply |
| [[../foam/decisions/ADR-008-inline-rich-contenteditable|ADR-008]] | No CRDT inside the block editor |
| [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]] | Ownership rules apply inside content roots |
| [[../foam/decisions/ADR-016-live-sync-transport|ADR-016]] | Mesh peers + relay; host = hub replica; whole-file LWW; facades daemon / WS |
| [[../foam/decisions/ADR-017-path-ownership-layout|ADR-017]] | Writers prefixes; canonical root via explicit merge only |
| [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]] | Dual-mode; no double live writer; Git export OK on mesh |
| [[../foam/decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]] | Hosted writer = member; WS invalidate; no same-file collab promise |

Do not violate accepted ADRs without superseding them.

## Scope

### In scope

- Sync mode model (legacy Git-live vs mesh-live) + mutual exclusion
- Writer identity + prefix enforcement on apply
- Explicit publish/merge to canonical root
- Host sync peer facade (HTTP/WS) + invalidate push
- Portable/local daemon facade (thin UI)
- Git export/backup path for mesh vaults (not live)
- Migrate/opt-in UX for existing workspaces
- Docs: foam vision wording, env/operator notes, ADR-002 supersede when migration real

### Out of scope

- Character-level CRDT / Loro collab
- Final pick of mesh library if spike chooses a stub first (document spike outcome in ADR)
- Neomind-specific engine packaging
- Removing ADR-007 entirely
- Graph engine rewrite

## Technical approach

Tracer bullets: prove **one vault** end-to-end on mesh-live before widening facades.

1. **Mode bit** — workspace (or solo vault) is `git-live` | `mesh-live`; saving a note
   on `mesh-live` must not Git commit/push.
2. **Apply pipeline** — incoming file updates respect writer prefixes; rejects or
   quarantines illegal canonical overwrites.
3. **Publish** — explicit API/UI moves/copies from `writers/<id>/…` into root with
   auditability; concurrent publishes = LWW.
4. **Host peer** — browsers use session identity as `user:<id>`; WS notifies peers.
5. **Daemon** — local peer for portable; UI remains HTTP client to daemon or host.
6. **Transport spike** — choose initial library (or thin stub + interface) in a
   short ADR addendum; runtime still deferrable if interface is stable.
7. **Dual-mode migrate** — opt-in flips mode; document rollback; legacy keeps locks.

## Tasks

- [x] **T1 — Sync mode seam**  
  Introduce `git-live` | `mesh-live` (name flexible) on the vault/workspace config
  surface. Acceptance: reading the mode is possible from server + one test; default
  remains `git-live` for existing vaults.

- [x] **T2 — Mesh-live note save (no Git)**  
  On `mesh-live`, ordinary note/folder mutation persists files and does **not**
  call live Git commit/push. Acceptance: unit/integration proves Git live path
  skipped; file on disk updated.
  _(Note saves via `writeToWorkspace` covered; folder mutations still Git-live until a follow-up.)_

- [x] **T3 — Writer prefix enforcement**  
  Apply path rejects writes outside the actor’s `writers/<device|agent|user>/`
  prefix (encoding documented). Acceptance: illegal path → typed error; legal
  prefix write succeeds.
  _(Encoding: logical `kind:id` → `writers/<kind>/<id>/`; required on mesh-live note writes.)_

- [x] **T4 — Canonical publish**  
  Explicit publish/merge from writer prefix → vault root (and reverse policy if
  any). Acceptance: sync apply alone cannot change root; publish endpoint/UI
  can; test covers both.
  _(`publishNoteToCanonical` + `POST /api/notes/publish`; default target strips writer prefix; move by default.)_

- [x] **T5 — Hosted WS invalidate**  
  After mesh apply/publish on host, connected browsers receive invalidate/file
  update and can refresh content. Acceptance: test or harness shows event after
  write for a second subscriber.
  _(Hub + `/ws/vault` subscribe; `useVaultInvalidate` client helper; wired from write/publish.)_

- [x] **T6 — Hosted writer = member**  
  Map authenticated workspace member to `user:<id>` writer for hosted sessions.
  Acceptance: two members get distinct prefixes; same member two tabs share one.
  _(Done before T5: note PUT/POST + publish + agent PUT wired; short ids auto-prefixed on mesh-live.)_

- [x] **T7 — Portable daemon facade (thin slice)**  
  Local daemon (or equivalent process boundary) can apply writer-prefixed writes
  for a vault folder the UI talks to. Acceptance: smoke: UI/daemon save round-trip
  without Git-live.
  _(`scripts/fluffmind-daemon.mjs` + `apps/web/server/daemon/`; `--self-check`.)_

- [x] **T8 — Transport spike + interface**  
  Spike mesh transport (iroh-shaped or stub behind interface); record choice in
  short ADR or ADR-016 addendum. Acceptance: two peers (or peer + host) exchange
  at least one file update in a test/smoke.
  _(`MeshSyncTransport` + in-memory hub; ADR-016 addendum; iroh deferred.)_

- [x] **T9 — Dual-mode migrate/opt-in**  
  Operator/user can flip a vault to `mesh-live` (and document rollback to
  `git-live` if supported). Acceptance: cannot enable both live writers;
  Git export still available on mesh-live.
  _(`GET|PATCH /api/workspaces/sync-mode` + settings UI; auth-off = `SYNC_MODE` env.)_

- [x] **T10 — Docs & foam**  
  Update operator/README/.env notes as needed; vision sync wording; tick PRD
  goals when slices land; when first production migrate completes, mark ADR-002
  live path superseded per ADR-018.
  _(2026-11-14: vision + rethink-sync + index + PRD ticks for T1–T6; ADR-002
  supersede deferred until real migrate — T9.)_

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Mesh library churn / Wasm pain | Interface + spike (T8); host/daemon facades first |
| Dual-mode complexity forever | Default new vaults to mesh once stable; migrate checklist |
| Users overwrite root by habit | Publish UX + clear errors on illegal apply |
| LWW drops concurrent canonical publishes | Document non-goal (ADR-019); later CRDT PRD if needed |
| Agents raw-FS bypass | Require agent writes through same apply API |

## Test plan

**Seams under test:**

1. Vault/workspace **sync mode** config read/write
2. **Mutation/apply** boundary (mesh vs Git-live behavior)
3. **Writer authorization** on paths
4. **Publish/merge** to canonical
5. **Host WS** notify after apply
6. **Transport** peer file exchange (spike)

- [ ] Automated tests on seams 1–5 (project vitest / web filter conventions)
- [x] Smoke for T7 + T8 (daemon `--self-check` + mesh vitest two peers)
- [ ] Manual: dual-mode flip on a throwaway vault _(API/UI ready — operator smoke)_

## Verification

- [x] Lint / typecheck / focused tests via Mise (`mise exec -- pnpm …`) _(focused vitest + daemon self-check 2026-11-14)_
- [x] PRD-042 checkboxes updated as slices ship
- [x] Foam / ADR updates if spike changes transport choice _(ADR-016 addendum)_
- [x] Comment on [#141](https://github.com/chatondearu/fluffmind/issues/141) when PLAN tasks start (claim implementation issues as needed)
