# syntax=docker/dockerfile:1

# Build context is the repository root: `docker build -f apps/cloud/Dockerfile .`

# Pinned by digest so the base image never moves under this pipeline.
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# Filtered install: the native toolchains the register (better-sqlite3, serialport) and the
# design system's browser tests need are never pulled into this image.
RUN pnpm install --frozen-lockfile --filter @purosur/cloud...
RUN pnpm --filter @purosur/cloud build
RUN pnpm --filter @purosur/cloud deploy --prod /deploy/cloud

FROM base AS build-backoffice
COPY . .
RUN pnpm install --frozen-lockfile --filter @purosur/backoffice...
RUN pnpm --filter @purosur/backoffice build

FROM base AS runtime
# Baked in at build time (the commit SHA); GET /api/health reports it back so a deploy can be verified.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production
WORKDIR /app
# The nightly offsite dump (dist/dump-offsite.js) runs pg_dump piped into age from this same image.
# pg_dump must be at least the server's major version: 18 is the newest this Alpine release ships.
RUN apk add --no-cache postgresql18-client age
COPY --from=build /deploy/cloud ./
# dist/server.js serves the backoffice from ../public when BACKOFFICE_STATIC_DIR is unset.
COPY --from=build-backoffice /repo/apps/backoffice/dist ./public
RUN addgroup -S cloud && adduser -S cloud -G cloud && chown -R cloud:cloud /app
USER cloud
EXPOSE 3000
CMD ["node", "dist/server.js"]
