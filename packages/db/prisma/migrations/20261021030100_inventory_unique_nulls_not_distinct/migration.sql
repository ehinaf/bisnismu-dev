-- Default Postgres: NULL dianggap BERBEDA di UNIQUE, sehingga (outlet_id, item_id, NULL)
-- — item tanpa varian — bisa punya lebih dari satu baris stok di outlet yang sama, dan
-- SELECT ... FOR UPDATE di sales engine akan mengunci/mengurangi salah satunya secara acak.
-- NULLS NOT DISTINCT (PostgreSQL 15+) menutup celah itu. DSL Prisma belum bisa menyatakannya,
-- jadi @@unique([outlet_id, item_id, variant_id]) di schema.prisma tetap seperti semula
-- (pola yang sama dengan partial index idx_transactions_status di migrasi init).
-- Migrasi ini GAGAL bila sudah ada baris ganda — bereskan dulu datanya (gabungkan stok,
-- pindahkan stock_movements) sebelum deploy.

DROP INDEX "inventory_outlet_id_item_id_variant_id_key";

CREATE UNIQUE INDEX "inventory_outlet_id_item_id_variant_id_key"
    ON "inventory"("outlet_id", "item_id", "variant_id") NULLS NOT DISTINCT;
