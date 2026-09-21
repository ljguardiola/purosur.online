# syntax=docker/dockerfile:1
#
# Build context is the repository root (a pnpm workspace): `docker build -f apps/cloud/Dockerfile .`

# node:24-alpine, pinned by digest so the base image never moves under this pipeline. Resolved
# with `docker buildx imagetools inspect node:24-alpine`.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# Filtered install: only @purosur/cloud and its dependencies are linked, so the native toolchains
# the register (better-sqlite3, serialport) and the design system's browser tests need are never
# pulled into this image.
RUN pnpm install --frozen-lockfile --filter @purosur/cloud...
RUN pnpm --filter @purosur/cloud build
RUN pnpm --filter @purosur/cloud deploy --prod /deploy/cloud

# A second, independent stage: the backoffice's own build tooling (Vite, Tailwind, React) has
# nothing to do with the cloud service's dependency graph, so it gets its own filtered install
# instead of widening the one above. Both stages only depend on `base`, so a BuildKit builder runs
# them in parallel.
FROM base AS build-backoffice
COPY . .
RUN pnpm install --frozen-lockfile --filter @purosur/backoffice...
RUN pnpm --filter @purosur/backoffice build

FROM base AS runtime
# Baked in at build time (the commit SHA); GET /health reports it back so a deploy can be verified.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/cloud ./
# server.ts's default BACKOFFICE_STATIC_DIR resolves to <this file's dir>/../public, i.e.
# /app/public from dist/server.js - matched here, so no env var is needed in the common case.
COPY --from=build-backoffice /repo/apps/backoffice/dist ./public
RUN addgroup -S cloud && adduser -S cloud -G cloud && chown -R cloud:cloud /app
USER cloud
EXPOSE 3000
CMD ["node", "dist/server.js"]
