-- Laporan harian:
-- - Tanggal dari waktu transaksi SELESAI (completed_at), bukan dibuat: open bill
--   yang dibuka kemarin dan dibayar hari ini adalah penjualan hari ini.
--   Transaksi lama tanpa completed_at jatuh kembali ke created_at.
-- - Laba kotor tanpa pajak: pajak milik negara, bukan pendapatan usaha.
--   Service charge & ongkir tetap pendapatan.
-- Kolom & tipe keluaran tidak berubah (syarat CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW "v_daily_sales" AS
SELECT
    t.business_id,
    t.outlet_id,
    DATE(COALESCE(t.completed_at, t.created_at) AT TIME ZONE b.timezone) AS sales_date,
    COUNT(*) FILTER (WHERE t.transaction_type = 'sale') AS transaction_count,
    SUM(t.total)                      AS gross_sales,
    SUM(t.discount_total)             AS total_discounts,
    SUM(t.tax_total)                  AS total_taxes,
    SUM(t.total - t.tax_total - t.total_cost) AS gross_profit
FROM transactions t
JOIN businesses b ON b.id = t.business_id
WHERE t.status IN ('completed', 'refunded', 'partially_refunded')
GROUP BY t.business_id, t.outlet_id, DATE(COALESCE(t.completed_at, t.created_at) AT TIME ZONE b.timezone);
