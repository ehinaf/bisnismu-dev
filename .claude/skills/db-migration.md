---
name: db-migration
description: Prosedur ubah database via Prisma
---

# Database Migration

1. Edit packages/db/prisma/schema.prisma
2. pnpm db:migrate -- --name deskripsi_perubahan
3. Periksa SQL migrasi sebelum apply
4. Update seeder jika ada tabel baru
5. Test: pnpm test
