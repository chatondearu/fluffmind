# syntax=docker/dockerfile:1
#
# Multi-stage build for @fluffmind/web, following Turborepo's documented pattern for
# pnpm monorepos (https://turborepo.com/docs/guides/tools/docker): `turbo prune`
# extracts just the subset of the workspace apps/web actually depends on, so the
# production install layer only pulls in what's needed instead of the whole monorepo.

FROM node:22-alpine AS base
RUN corepack enable

# ---- Prune the workspace down to apps/web's dependency subset -------------------
FROM base AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @fluffmind/web --docker

# ---- Install deps (cacheable layer) + copy pruned source ------------------------
FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune only keeps files referenced by a package's package.json — shared root
# config referenced by relative path from a package's own config (like this one) isn't
# picked up automatically and has to be copied in explicitly.
COPY tsconfig.base.json ./tsconfig.base.json

# ---- Production build -------------------------------------------------------------
FROM installer AS builder
ENV NUXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@fluffmind/web

# ---- Local dev image (see docker-compose.yml) ------------------------------------
# Installs for the *whole* monorepo, not the pruned subset above: docker-compose bind-
# mounts the full host repo over /app at runtime, and pnpm aborts (no TTY to confirm
# purging node_modules) if the installed lockfile scope doesn't match what's mounted.
FROM base AS dev
RUN apk add --no-cache libc6-compat git
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# ---- Sync daemon (ADR-020 §9): static musl binary, separate `sync` compose service ----
# Build with `--target daemon`. Declared before `runner` so a plain `docker build .`
# (no --target, e.g. Coolify) still resolves to the web image, the last stage.
FROM rust:1.99.1-alpine AS daemon-builder
# build-base: `ring` compiles C/asm; musl-dev alone has no compiler.
RUN apk add --no-cache build-base
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p fluffmind-daemon

FROM alpine:3.22 AS daemon
# Same uid/gid as the web image: both services share the /data volumes. Dirs are created
# here so a fresh named volume inherits the ownership whichever service mounts it first.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs fluffmind \
  && mkdir -p /data/daemon /data/vault /data/workspaces \
  && chown -R fluffmind:nodejs /data
COPY --from=daemon-builder /src/target/release/fluffmind-daemon /usr/local/bin/fluffmind-daemon
USER fluffmind
# Node key (node.key) + per-vault mesh state: mount a volume, the key is the peer identity.
ENV FLUFFMIND_DAEMON_DATA=/data/daemon
EXPOSE 8787
# Off-loopback bind: FLUFFMIND_DAEMON_TOKEN is required (the daemon refuses to start without).
ENTRYPOINT ["fluffmind-daemon"]
CMD ["--host", "0.0.0.0", "--vault", "/data/vault"]

# ---- Self-hosted iroh relay (ADR-020 §8): keep the tag equal to the `iroh` pin in
# crates/fluffmind-daemon/Cargo.toml. Plain HTTP behind the Coolify proxy (TLS there).
FROM n0computer/iroh-relay:v1.4.1 AS relay
COPY deploy/iroh-relay.toml /etc/iroh-relay.toml
ENTRYPOINT ["/iroh-relay"]
CMD ["--config-path", "/etc/iroh-relay.toml"]

# ---- Runtime image: Nitro's node-server output is fully self-contained ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# writeToWorkspace shells out to the real git binary (via simple-git) — not part of
# Nitro's self-contained output, has to be installed explicitly.
RUN apk add --no-cache git su-exec
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 fluffmind
COPY --from=builder --chown=fluffmind:nodejs /app/apps/web/.output ./.output
# Nitro only traces the drizzle-orm files the server imports — not
# `drizzle-orm/node-postgres/migrator`. Node ESM also ignores NODE_PATH, so a
# tiny dedicated install is required for the entrypoint migrator.
WORKDIR /app/migrate
COPY scripts/migrate/package.json ./package.json
RUN npm install --omit=dev \
  && chown -R fluffmind:nodejs /app/migrate
COPY --chown=fluffmind:nodejs scripts/run-migrations.mjs ./run-migrations.mjs
COPY --from=builder --chown=fluffmind:nodejs /app/packages/db/drizzle ./drizzle
WORKDIR /app
COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
