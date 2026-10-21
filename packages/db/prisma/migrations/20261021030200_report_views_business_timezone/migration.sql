-- v_daily_sales sebelumnya mengelompokkan per tanggal Asia/Jakarta untuk SEMUA usaha.
-- Sekarang memakai businesses.timezone, supaya usaha di WITA (Bali, Makassar) / WIT
-- (Papua) tidak salah tanggal untuk transaksi di sekitar tengah malam.
-- Kolom & tipe keluaran tidak berubah (CREATE OR REPLACE VIEW mensyaratkan itu),
-- jadi blok `view v_daily_sales` di schema.prisma tidak perlu diubah.

CREATE OR REPLACE VIEW "v_daily_sales" AS
SELECT
    t.business_id,
    t.outlet_id,
    DATE(t.created_at AT TIME ZONE b.timezone) AS sales_date,
    COUNT(*)                          AS transaction_count,
    SUM(t.total)                      AS gross_sales,
    SUM(t.discount_total)             AS total_discounts,
    SUM(t.tax_total)                  AS total_taxes,
    SUM(t.total - t.total_cost)       AS gross_profit
FROM transactions t
JOIN businesses b ON b.id = t.business_id
WHERE t.status = 'completed' AND t.transaction_type = 'sale'
GROUP BY t.business_id, t.outlet_id, DATE(t.created_at AT TIME ZONE b.timezone);
