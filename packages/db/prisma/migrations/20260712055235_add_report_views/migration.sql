-- View laporan siap pakai (lihat docs/skema_database_bisnismu_v2.sql §17).
-- Catatan: Prisma migrate mendeteksi "drift" palsu pada stock_opname_items.difference
-- (kolom GENERATED ALWAYS AS ... STORED yang ditambahkan manual di migrasi init_bisnismu)
-- dan ingin menambahkan ALTER TABLE ... SET NOT NULL / DROP DEFAULT — ini SALAH dan akan
-- merusak kolom generated tsb, sehingga sengaja TIDAK disertakan di migrasi ini.

-- Ringkasan penjualan harian per outlet
CREATE VIEW "v_daily_sales" AS
SELECT
    t.business_id,
    t.outlet_id,
    DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') AS sales_date,
    COUNT(*)                          AS transaction_count,
    SUM(t.total)                      AS gross_sales,
    SUM(t.discount_total)             AS total_discounts,
    SUM(t.tax_total)                  AS total_taxes,
    SUM(t.total - t.total_cost)       AS gross_profit
FROM transactions t
WHERE t.status = 'completed' AND t.transaction_type = 'sale'
GROUP BY t.business_id, t.outlet_id, DATE(t.created_at AT TIME ZONE 'Asia/Jakarta');

-- Item terlaris
CREATE VIEW "v_top_items" AS
SELECT
    t.business_id,
    t.outlet_id,
    ti.item_id,
    ti.item_name_snapshot,
    SUM(ti.quantity)  AS total_qty,
    SUM(ti.subtotal)  AS total_revenue
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
WHERE t.status = 'completed'
GROUP BY t.business_id, t.outlet_id, ti.item_id, ti.item_name_snapshot;

-- Stok menipis
CREATE VIEW "v_low_stock" AS
SELECT
    i.outlet_id,
    it.business_id,
    it.name AS item_name,
    v.name  AS variant_name,
    i.quantity_on_hand,
    i.reorder_level
FROM inventory i
JOIN items it ON it.id = i.item_id
LEFT JOIN item_variants v ON v.id = i.variant_id
WHERE it.track_stock = TRUE
  AND i.quantity_on_hand <= i.reorder_level;

-- Piutang pelanggan yang masih outstanding
CREATE VIEW "v_outstanding_receivables" AS
SELECT
    r.business_id,
    c.name  AS customer_name,
    c.phone AS customer_phone,
    r.amount - r.amount_paid AS remaining,
    r.due_date,
    r.created_at
FROM customer_receivables r
JOIN customers c ON c.id = r.customer_id
WHERE r.status IN ('outstanding', 'partially_paid');
