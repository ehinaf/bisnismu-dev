# syntax=docker/dockerfile:1.7
# Image web BisnisMu (Next.js standalone) — dibangun dari root monorepo:
#   docker build -f apps/web/Dockerfile .
# NEXT_PUBLIC_API_URL ditanam saat build; default "/api" karena web & API
# berada di satu domain di balik Caddy.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter @bisnismu/web...
RUN pnpm --filter @bisnismu/web run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
