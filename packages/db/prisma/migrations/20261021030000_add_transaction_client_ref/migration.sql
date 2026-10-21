-- Idempotency key checkout (schema.prisma: Transaction.client_ref). Request ulang
-- dengan client_ref yang sama mengembalikan transaksi lama, bukan membuat duplikat.
-- UNIQUE biasa (NULL tetap boleh banyak) — transaksi lama/tanpa client_ref tidak terpengaruh.
--
-- Catatan: `prisma migrate diff` juga mengusulkan
--   ALTER TABLE "stock_opname_items" ALTER COLUMN "difference" DROP DEFAULT;
-- itu drift palsu dari kolom GENERATED (lihat migrasi add_report_views) — sengaja TIDAK disertakan.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "client_ref" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_business_id_client_ref_key" ON "transactions"("business_id", "client_ref");
