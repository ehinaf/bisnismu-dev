# syntax=docker/dockerfile:1.7
# Image API BisnisMu (NestJS) — dibangun dari root monorepo:
#   docker build -f apps/api/Dockerfile --target runtime .
# Target `migrate` menjalankan `prisma migrate deploy` (dipakai layanan migrate di compose).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ── Build: client Prisma + kompilasi API ─────────────────────────────────────
FROM base AS build
# prisma.config.ts mensyaratkan DATABASE_URL terdefinisi; generate tidak terhubung ke DB.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm install --frozen-lockfile --filter @bisnismu/api... --filter @bisnismu/db
RUN pnpm --filter @bisnismu/db run build && pnpm --filter @bisnismu/api run build

# ── Migrasi (one-shot) ───────────────────────────────────────────────────────
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Dependensi produksi saja ─────────────────────────────────────────────────
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Semua manifest workspace (bukan hanya api) supaya --frozen-lockfile cocok dengan lockfile.
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --prod --filter @bisnismu/api...

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo ./
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/types packages/types
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
