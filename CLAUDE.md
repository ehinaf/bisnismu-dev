# BisnisMu — POS Universal untuk UMKM Indonesia

## Konteks
POS web multi-tenant untuk retail/F&B/jasa/grosir.
Dokumentasi: docs/PRD_bisnismu.md, docs/skema_database_bisnismu_v2.sql

## Stack
- Backend: NestJS + Prisma + PostgreSQL 16 (modular monolith)
- Frontend: Next.js 15 + TypeScript + Tailwind
- Monorepo: pnpm workspaces
- Deploy: Docker Compose

## Aturan Wajib
1. UANG: selalu Decimal/NUMERIC — JANGAN PERNAH float/Number
2. TRANSAKSI PENJUALAN: semua dalam satu prisma.$transaction (atomik)
3. MULTI-TENANT: setiap query WAJIB filter business_id
4. SNAPSHOT: tabel transaction_* simpan nama/harga saat transaksi
5. SOFT DELETE: gunakan deleted_at, jangan hard delete
6. Migrasi: hanya via Prisma Migrate, jangan ALTER TABLE manual
7. AUDIT: aksi sensitif (void, refund, ubah harga) tercatat di audit_logs

## Perintah
- pnpm dev            # jalankan api + web
- pnpm test           # unit test
- pnpm db:migrate     # prisma migration
- pnpm lint && pnpm typecheck

## Workflow
- Plan Mode (Shift+Tab) untuk pekerjaan multi-file
- Test sebelum selesai: pnpm test && pnpm typecheck
- Commit message: feat(module), fix(module), docs(module)

## Fase 0 Workflow (Automatic Execution)

### Saat prompt: "Start Fase 0 Step 2"
1. Baca docs/BISNISMU_START_HERE.md bagian Fase 0
2. Execute setiap step secara berurutan:
   - Create folder/file
   - Verify
   - Test jika perlu
   - Commit jika done
3. Jika ada blocker → tanya (pause)
4. Continue ke step berikutnya
5. Report progress setiap step

### Autonomous Execution Checklist
- [ ] Baca requirement docs dulu
- [ ] Buat plan otomatis (jangan tanya)
- [ ] Execute step-by-step
- [ ] Verify output setelah tiap step
- [ ] Commit ketika milestone selesai
- [ ] Report status (DONE/BLOCKER/WAITING)
