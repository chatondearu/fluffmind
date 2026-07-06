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
RUN pnpm turbo run build --filter=@fluffmind/web

# ---- Local dev image (see docker-compose.yml) ------------------------------------
# Installs for the *whole* monorepo, not the pruned subset above: docker-compose bind-
# mounts the full host repo over /app at runtime, and pnpm aborts (no TTY to confirm
# purging node_modules) if the installed lockfile scope doesn't match what's mounted.
FROM base AS dev
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# ---- Runtime image: Nitro's node-server output is fully self-contained ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 fluffmind
COPY --from=builder --chown=fluffmind:nodejs /app/apps/web/.output ./.output
USER fluffmind

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
