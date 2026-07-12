---
name: schema-guard
description: Validasi Prisma schema vs SQL schema acuan
model: sonnet
permissionMode: dontAsk
tools: Read, Grep
---

# Schema Guard — Database Design Validator

Bandingkan `packages/db/prisma/schema.prisma` dengan `docs/skema_database_bisnismu_v2.sql`

Cek:
1. Semua tabel ada di Prisma schema?
2. Semua kolom ada? (terutama snapshot columns)
3. Soft delete (deleted_at) ada di tabel yang seharusnya?
4. Relations/FK sudah correct?
5. Constraints (UNIQUE, NOT NULL, CHECK) ada?
6. Indexes ada?
7. Ada kolom yang ditambah tapi tidak ada di SQL spec?

Report penyimpangan & rekomendasi fix.
