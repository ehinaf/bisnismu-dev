-- Sprint 2 tahap 2: refund sebagian/penuh.
-- Refund disimpan sebagai transaksi transaction_type='refund' bernilai NEGATIF
-- yang menunjuk penjualan asli; penjualan asli berstatus refunded/partially_refunded.

-- Baris refund → baris penjualan asli (jumlah yang sudah di-refund per baris).
ALTER TABLE "transaction_items" ADD COLUMN     "refunded_item_id" UUID;

CREATE INDEX "transaction_items_refunded_item_id_idx" ON "transaction_items"("refunded_item_id");

ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_refunded_item_id_fkey" FOREIGN KEY ("refunded_item_id") REFERENCES "transaction_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Penjualan yang (sebagian) di-refund tetap dihitung, dan transaksi refund
-- (negatif) ikut dijumlah → angka harian menjadi penjualan BERSIH. Jumlah
-- transaksi tetap hanya menghitung penjualan. Kolom & tipe keluaran tidak
-- berubah (syarat CREATE OR REPLACE VIEW), jadi blok view di schema.prisma tetap.
CREATE OR REPLACE VIEW "v_daily_sales" AS
SELECT
    t.business_id,
    t.outlet_id,
    DATE(t.created_at AT TIME ZONE b.timezone) AS sales_date,
    COUNT(*) FILTER (WHERE t.transaction_type = 'sale') AS transaction_count,
    SUM(t.total)                      AS gross_sales,
    SUM(t.discount_total)             AS total_discounts,
    SUM(t.tax_total)                  AS total_taxes,
    SUM(t.total - t.total_cost)       AS gross_profit
FROM transactions t
JOIN businesses b ON b.id = t.business_id
WHERE t.status IN ('completed', 'refunded', 'partially_refunded')
GROUP BY t.business_id, t.outlet_id, DATE(t.created_at AT TIME ZONE b.timezone);
