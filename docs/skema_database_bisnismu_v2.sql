-- =====================================================================
-- SKEMA DATABASE v2: BISNISMU — SISTEM BISNIS UNIVERSAL UNTUK UMKM
-- Database: PostgreSQL 14+
--
-- Mendukung jenis usaha:
--   Retail (toko/kelontong/fashion), F&B (warung/kafe/resto),
--   Jasa (salon/bengkel/laundry), Grosir (harga bertingkat)
--
-- Perbaikan dari v1:
--   + Meja & tipe order (dine-in/takeaway/delivery) + open bill
--   + Kasbon / piutang pelanggan (umum di warung Indonesia)
--   + Booking / janji temu untuk usaha jasa
--   + Paket / bundle item
--   + Resep / bahan baku (BOM) untuk F&B
--   + Voucher berkode unik
--   + Riwayat poin loyalty + program loyalty
--   + Pengeluaran operasional & kas keluar-masuk laci
--   + Komisi karyawan (salon/barbershop)
--   + Dokumen transfer stok antar outlet
--   + Konfigurasi channel pembayaran (biaya MDR QRIS, dsb)
--   + Soft delete (deleted_at) & pembulatan (rounding)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. BUSINESS, SETTINGS, USERS (Multi-tenant + RBAC)
-- =====================================================================

CREATE TABLE businesses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    business_type   VARCHAR(50),              -- retail, fnb, jasa, grosir, campuran
    email           VARCHAR(150),
    phone           VARCHAR(30),
    address         TEXT,
    currency        VARCHAR(10) DEFAULT 'IDR',
    timezone        VARCHAR(50) DEFAULT 'Asia/Jakarta',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ                -- soft delete
);

CREATE TYPE rounding_mode AS ENUM ('none', 'nearest_100', 'nearest_500', 'nearest_1000', 'up_100', 'up_500');

CREATE TABLE business_settings (
    business_id         UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    receipt_header      TEXT,
    receipt_footer      TEXT,
    logo_url            TEXT,
    default_tax_id      UUID,                  -- FK ditambahkan setelah taxes dibuat
    rounding            rounding_mode DEFAULT 'none',
    low_stock_alert     BOOLEAN DEFAULT TRUE,
    enable_tables       BOOLEAN DEFAULT FALSE, -- fitur meja (F&B) bisa on/off
    enable_bookings     BOOLEAN DEFAULT FALSE, -- fitur booking (jasa) bisa on/off
    enable_kasbon       BOOLEAN DEFAULT FALSE, -- fitur piutang pelanggan bisa on/off
    enable_loyalty      BOOLEAN DEFAULT FALSE,
    enable_commission   BOOLEAN DEFAULT FALSE, -- komisi karyawan (salon dsb)
    receipt_via_whatsapp BOOLEAN DEFAULT TRUE,
    updated_at          TIMESTAMPTZ DEFAULT now()
);
-- Catatan: kolom enable_* di atas membuat SATU codebase bisa melayani
-- semua jenis usaha — fitur cukup diaktifkan sesuai kebutuhan tenant.

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'cashier', 'staff');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150),
    phone           VARCHAR(30),
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'cashier',
    pin_code        VARCHAR(255),              -- login cepat kasir (hashed)
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (business_id, email)
);
CREATE INDEX idx_users_business ON users(business_id);

-- Izin granular per user (melengkapi role dasar).
-- Contoh permission_key: 'void_transaction', 'give_discount', 'view_reports',
-- 'manage_items', 'manage_stock', 'open_drawer_without_sale'
CREATE TABLE user_permissions (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key  VARCHAR(60) NOT NULL,
    PRIMARY KEY (user_id, permission_key)
);

-- =====================================================================
-- 2. OUTLETS, PERANGKAT, MEJA (F&B)
-- =====================================================================

CREATE TABLE outlets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    address         TEXT,
    phone           VARCHAR(30),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_outlets_business ON outlets(business_id);

CREATE TABLE user_outlets (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, outlet_id)
);

-- Perangkat terdaftar (tablet kasir, printer thermal, cash drawer fisik)
CREATE TYPE device_type AS ENUM ('pos_terminal', 'printer', 'cash_drawer', 'barcode_scanner', 'kds_screen');

CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    device_type     device_type NOT NULL,
    name            VARCHAR(100) NOT NULL,     -- "Kasir Depan", "Printer Dapur"
    identifier      VARCHAR(150),              -- MAC address / IP / serial
    config          JSONB DEFAULT '{}'::jsonb, -- lebar kertas, dsb
    is_active       BOOLEAN DEFAULT TRUE
);

-- Meja untuk usaha F&B dine-in
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'reserved', 'inactive');

CREATE TABLE dining_tables (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,      -- "Meja 1", "VIP A"
    area            VARCHAR(50),               -- "Indoor", "Outdoor", "Lantai 2"
    capacity        INT DEFAULT 4,
    status          table_status DEFAULT 'available',
    UNIQUE (outlet_id, name)
);

-- =====================================================================
-- 3. KATEGORI, SATUAN, PRODUK/JASA (GENERIK & FLEKSIBEL)
-- =====================================================================

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL,
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_categories_business ON categories(business_id);

CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,      -- Pieces, Kilogram, Jam, Porsi
    symbol          VARCHAR(10) NOT NULL,      -- pcs, kg, jam, porsi
    allow_decimal   BOOLEAN DEFAULT FALSE,     -- kg boleh 0.5; pcs tidak
    UNIQUE (business_id, symbol)
);

CREATE TYPE item_type AS ENUM (
    'product',      -- barang fisik biasa
    'service',      -- jasa (tidak butuh stok)
    'bundle',       -- paket berisi beberapa item lain
    'ingredient'    -- bahan baku (tidak dijual langsung, dipakai resep)
);
CREATE TYPE pricing_type AS ENUM ('fixed', 'per_unit', 'per_duration', 'tiered', 'open');
-- 'open' = harga diinput bebas oleh kasir saat transaksi (jasa custom, barang bekas)

CREATE TABLE items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
    unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
    sku             VARCHAR(60),
    barcode         VARCHAR(60),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    item_type       item_type NOT NULL DEFAULT 'product',
    pricing_type    pricing_type NOT NULL DEFAULT 'fixed',
    base_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_price      NUMERIC(14,2) DEFAULT 0,
    track_stock     BOOLEAN DEFAULT TRUE,
    use_recipe      BOOLEAN DEFAULT FALSE,     -- jika TRUE, penjualan mengurangi stok bahan (BOM)
    duration_minutes INT,                      -- untuk pricing_type = per_duration
    commission_type VARCHAR(20),               -- 'percentage' / 'fixed' (komisi karyawan per item jasa)
    commission_value NUMERIC(14,2) DEFAULT 0,
    image_url       TEXT,
    attributes      JSONB DEFAULT '{}'::jsonb,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (business_id, sku)
);
CREATE INDEX idx_items_business ON items(business_id);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_barcode ON items(barcode);
CREATE INDEX idx_items_attributes ON items USING GIN (attributes);

CREATE TABLE item_variants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    sku_suffix      VARCHAR(30),
    barcode         VARCHAR(60),
    price_adjustment NUMERIC(14,2) DEFAULT 0,
    cost_adjustment  NUMERIC(14,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_variants_item ON item_variants(item_id);

-- Harga bertingkat (grosir): beli >= 12 pcs harga turun, dst
CREATE TABLE price_tiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    variant_id      UUID REFERENCES item_variants(id) ON DELETE CASCADE,
    min_qty         NUMERIC(12,3) NOT NULL,
    max_qty         NUMERIC(12,3),
    price           NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_price_tiers_item ON price_tiers(item_id);

-- Override harga per outlet
CREATE TABLE outlet_item_prices (
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    variant_id      UUID REFERENCES item_variants(id) ON DELETE CASCADE,
    price           NUMERIC(14,2) NOT NULL,
    PRIMARY KEY (outlet_id, item_id, variant_id)
);

-- Item mana yang tersedia di outlet mana (menu bisa beda antar cabang)
CREATE TABLE outlet_items (
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    is_available    BOOLEAN DEFAULT TRUE,      -- "habis" sementara tanpa menonaktifkan global
    PRIMARY KEY (outlet_id, item_id)
);

-- =====================================================================
-- 4. BUNDLE/PAKET & RESEP/BAHAN BAKU (BOM)
-- =====================================================================

-- Isi paket: item bertipe 'bundle' terdiri dari item-item lain
-- Contoh: "Paket Hemat A" = 1 Nasi + 1 Ayam Goreng + 1 Es Teh
CREATE TABLE bundle_components (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    component_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    component_variant_id UUID REFERENCES item_variants(id),
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 1,
    CHECK (bundle_item_id <> component_item_id)
);
CREATE INDEX idx_bundle_components ON bundle_components(bundle_item_id);

-- Resep / Bill of Materials: item jadi terbuat dari bahan baku
-- Contoh: 1 "Es Teh Manis" = 5g teh + 20g gula + 1 cup plastik
-- Saat terjual, stok BAHAN yang berkurang (bukan stok "Es Teh")
CREATE TABLE recipes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id             UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    variant_id          UUID REFERENCES item_variants(id) ON DELETE CASCADE,
    ingredient_item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity_used       NUMERIC(12,4) NOT NULL,   -- jumlah bahan per 1 unit terjual
    CHECK (item_id <> ingredient_item_id)
);
CREATE INDEX idx_recipes_item ON recipes(item_id);

-- =====================================================================
-- 5. MODIFIER (Topping, Level Pedas, Add-on Jasa)
-- =====================================================================

CREATE TYPE modifier_selection_type AS ENUM ('single', 'multiple');

CREATE TABLE modifier_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    selection_type  modifier_selection_type NOT NULL DEFAULT 'single',
    is_required     BOOLEAN DEFAULT FALSE,
    min_select      INT DEFAULT 0,
    max_select      INT DEFAULT 1,
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE modifiers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modifier_group_id   UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    price_adjustment    NUMERIC(14,2) DEFAULT 0,
    -- modifier juga bisa mengurangi stok bahan (misal topping keju):
    ingredient_item_id  UUID REFERENCES items(id),
    ingredient_qty      NUMERIC(12,4),
    is_active           BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_modifiers_group ON modifiers(modifier_group_id);

CREATE TABLE item_modifier_groups (
    item_id             UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    modifier_group_id   UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, modifier_group_id)
);

-- =====================================================================
-- 6. INVENTORY, STOCK MOVEMENT, TRANSFER ANTAR OUTLET
-- =====================================================================

CREATE TABLE inventory (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id           UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    item_id             UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    variant_id          UUID REFERENCES item_variants(id) ON DELETE CASCADE,
    quantity_on_hand    NUMERIC(14,3) NOT NULL DEFAULT 0,
    reorder_level       NUMERIC(14,3) DEFAULT 0,
    avg_cost            NUMERIC(14,2) DEFAULT 0,   -- moving average cost utk laporan laba akurat
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (outlet_id, item_id, variant_id)
);
CREATE INDEX idx_inventory_outlet ON inventory(outlet_id);

CREATE TYPE stock_movement_type AS ENUM (
    'purchase_in', 'sale_out', 'recipe_out', 'adjustment',
    'return_in', 'return_out', 'transfer_in', 'transfer_out',
    'waste', 'production_in'
);

CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id    UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    movement_type   stock_movement_type NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL,       -- positif=masuk, negatif=keluar
    unit_cost       NUMERIC(14,2),
    reference_type  VARCHAR(50),                   -- 'transaction','purchase_order','stock_transfer','manual'
    reference_id    UUID,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stock_movements_inventory ON stock_movements(inventory_id);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- Dokumen transfer stok antar outlet
CREATE TYPE transfer_status AS ENUM ('draft', 'sent', 'received', 'cancelled');

CREATE TABLE stock_transfers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    from_outlet_id  UUID NOT NULL REFERENCES outlets(id),
    to_outlet_id    UUID NOT NULL REFERENCES outlets(id),
    transfer_number VARCHAR(60) NOT NULL,
    status          transfer_status DEFAULT 'draft',
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    received_at     TIMESTAMPTZ,
    CHECK (from_outlet_id <> to_outlet_id)
);

CREATE TABLE stock_transfer_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    item_id             UUID NOT NULL REFERENCES items(id),
    variant_id          UUID REFERENCES item_variants(id),
    quantity            NUMERIC(14,3) NOT NULL
);

-- Stock opname (penghitungan fisik berkala)
CREATE TABLE stock_opnames (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    opname_number   VARCHAR(60) NOT NULL,
    status          VARCHAR(20) DEFAULT 'draft',   -- draft, completed
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE stock_opname_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_opname_id UUID NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id),
    variant_id      UUID REFERENCES item_variants(id),
    system_qty      NUMERIC(14,3) NOT NULL,    -- stok menurut sistem
    counted_qty     NUMERIC(14,3) NOT NULL,    -- stok hasil hitung fisik
    difference      NUMERIC(14,3) GENERATED ALWAYS AS (counted_qty - system_qty) STORED
);

-- =====================================================================
-- 7. SUPPLIER & PURCHASE ORDER
-- =====================================================================

CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(100),
    phone           VARCHAR(30),
    email           VARCHAR(150),
    address         TEXT,
    deleted_at      TIMESTAMPTZ
);

CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    supplier_id     UUID REFERENCES suppliers(id),
    po_number       VARCHAR(60) NOT NULL,
    status          po_status DEFAULT 'draft',
    total_amount    NUMERIC(14,2) DEFAULT 0,
    amount_paid     NUMERIC(14,2) DEFAULT 0,    -- mendukung utang ke supplier
    due_date        DATE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    received_at     TIMESTAMPTZ
);

CREATE TABLE purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id             UUID NOT NULL REFERENCES items(id),
    variant_id          UUID REFERENCES item_variants(id),
    quantity_ordered    NUMERIC(14,3) NOT NULL,
    quantity_received   NUMERIC(14,3) DEFAULT 0,
    unit_cost           NUMERIC(14,2) NOT NULL
);

-- =====================================================================
-- 8. CUSTOMER, LOYALTY, KASBON (PIUTANG)
-- =====================================================================

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(150),
    phone           VARCHAR(30),
    email           VARCHAR(150),
    address         TEXT,
    birthday        DATE,                       -- promo ulang tahun
    loyalty_points  INT DEFAULT 0,
    total_spent     NUMERIC(14,2) DEFAULT 0,
    visit_count     INT DEFAULT 0,
    credit_limit    NUMERIC(14,2) DEFAULT 0,    -- batas maksimal kasbon
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_customers_business ON customers(business_id);
CREATE INDEX idx_customers_phone ON customers(phone);

-- Konfigurasi program loyalty per business
CREATE TABLE loyalty_programs (
    business_id         UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    points_per_amount   NUMERIC(14,2) DEFAULT 10000,  -- dapat 1 poin tiap belanja Rp10.000
    point_value         NUMERIC(14,2) DEFAULT 100,    -- 1 poin = Rp100 saat ditukar
    min_redeem_points   INT DEFAULT 10,
    is_active           BOOLEAN DEFAULT TRUE
);

-- Riwayat poin masuk/keluar (jangan hanya simpan saldo)
CREATE TYPE loyalty_entry_type AS ENUM ('earn', 'redeem', 'adjustment', 'expired');

CREATE TABLE loyalty_point_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_type      loyalty_entry_type NOT NULL,
    points          INT NOT NULL,               -- positif=masuk, negatif=keluar
    transaction_id  UUID,                        -- FK ke transactions (ditambah belakangan)
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_loyalty_entries_customer ON loyalty_point_entries(customer_id);

-- KASBON / PIUTANG PELANGGAN — sangat umum di warung Indonesia
CREATE TYPE receivable_status AS ENUM ('outstanding', 'partially_paid', 'paid', 'written_off');

CREATE TABLE customer_receivables (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id),
    transaction_id  UUID,                        -- transaksi asal kasbon
    amount          NUMERIC(14,2) NOT NULL,
    amount_paid     NUMERIC(14,2) DEFAULT 0,
    status          receivable_status DEFAULT 'outstanding',
    due_date        DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_receivables_customer ON customer_receivables(customer_id);

-- Cicilan pembayaran kasbon
CREATE TABLE receivable_payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receivable_id   UUID NOT NULL REFERENCES customer_receivables(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL,
    payment_method  VARCHAR(30) NOT NULL DEFAULT 'cash',
    received_by     UUID REFERENCES users(id),
    paid_at         TIMESTAMPTZ DEFAULT now(),
    notes           TEXT
);

-- =====================================================================
-- 9. PAJAK, BIAYA LAYANAN, DISKON, VOUCHER
-- =====================================================================

CREATE TABLE taxes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,      -- "PPN 11%", "Service Charge 5%"
    rate            NUMERIC(5,2) NOT NULL,
    is_inclusive    BOOLEAN DEFAULT FALSE,
    tax_kind        VARCHAR(20) DEFAULT 'tax',  -- 'tax' | 'service_charge'
    is_active       BOOLEAN DEFAULT TRUE
);

ALTER TABLE business_settings
    ADD CONSTRAINT fk_default_tax FOREIGN KEY (default_tax_id) REFERENCES taxes(id);

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE discount_scope AS ENUM ('all_items', 'category', 'specific_items', 'min_purchase');

-- Diskon otomatis / promo berjadwal
CREATE TABLE discounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    discount_type   discount_type NOT NULL,
    value           NUMERIC(14,2) NOT NULL,
    scope           discount_scope DEFAULT 'all_items',
    conditions      JSONB DEFAULT '{}'::jsonb,
    -- contoh conditions:
    -- {"category_ids": [...], "min_amount": 50000,
    --  "days_of_week": [5,6], "hour_start": "14:00", "hour_end": "17:00"}
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Voucher berkode unik (beda dari diskon otomatis)
CREATE TABLE vouchers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code            VARCHAR(30) NOT NULL,
    discount_type   discount_type NOT NULL,
    value           NUMERIC(14,2) NOT NULL,
    min_purchase    NUMERIC(14,2) DEFAULT 0,
    max_discount    NUMERIC(14,2),              -- batas maksimal potongan utk tipe persen
    usage_limit     INT,                         -- total pemakaian, NULL = tak terbatas
    usage_count     INT DEFAULT 0,
    per_customer_limit INT DEFAULT 1,
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE (business_id, code)
);

CREATE TABLE voucher_redemptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id      UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    transaction_id  UUID,                        -- FK ditambah setelah transactions dibuat
    customer_id     UUID REFERENCES customers(id),
    amount_applied  NUMERIC(14,2) NOT NULL,
    redeemed_at     TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 10. CHANNEL PEMBAYARAN (konfigurasi per business)
-- =====================================================================

-- Konfigurasi metode bayar yang tersedia + biaya MDR-nya
CREATE TABLE payment_channels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(60) NOT NULL,       -- "Tunai", "QRIS BCA", "GoPay", "Transfer BRI"
    channel_type    VARCHAR(30) NOT NULL,       -- cash, qris, e_wallet, bank_transfer, debit, credit
    fee_percentage  NUMERIC(5,3) DEFAULT 0,     -- MDR, misal 0.7% untuk QRIS
    fee_fixed       NUMERIC(14,2) DEFAULT 0,
    account_info    JSONB DEFAULT '{}'::jsonb,  -- no rekening, nama, dsb (utk tampil di struk)
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INT DEFAULT 0
);

-- =====================================================================
-- 11. SHIFT, CASH DRAWER, KAS MASUK/KELUAR, PENGELUARAN
-- =====================================================================

CREATE TYPE drawer_status AS ENUM ('open', 'closed');

CREATE TABLE cash_drawer_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    opened_by       UUID NOT NULL REFERENCES users(id),
    closed_by       UUID REFERENCES users(id),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(14,2),
    expected_balance NUMERIC(14,2),
    status          drawer_status DEFAULT 'open',
    opened_at       TIMESTAMPTZ DEFAULT now(),
    closed_at       TIMESTAMPTZ,
    notes           TEXT
);
CREATE INDEX idx_drawer_outlet ON cash_drawer_sessions(outlet_id);

-- Kas masuk/keluar laci di luar transaksi penjualan
-- (setor modal, ambil uang pribadi/prive, bayar parkir, dll)
CREATE TYPE cash_flow_type AS ENUM ('cash_in', 'cash_out');

CREATE TABLE cash_drawer_movements (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cash_drawer_session_id  UUID NOT NULL REFERENCES cash_drawer_sessions(id) ON DELETE CASCADE,
    flow_type               cash_flow_type NOT NULL,
    amount                  NUMERIC(14,2) NOT NULL,
    reason                  VARCHAR(150) NOT NULL,   -- "Setor modal", "Prive", "Beli galon"
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ DEFAULT now()
);

-- Pengeluaran operasional (biaya usaha, terpisah dari kas laci)
CREATE TABLE expense_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL       -- "Listrik", "Sewa", "Gaji", "Bahan Baku"
);

CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    outlet_id       UUID REFERENCES outlets(id),
    category_id     UUID REFERENCES expense_categories(id),
    amount          NUMERIC(14,2) NOT NULL,
    description     TEXT,
    expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_url     TEXT,                        -- foto nota
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_expenses_business_date ON expenses(business_id, expense_date);

CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    clock_in        TIMESTAMPTZ NOT NULL DEFAULT now(),
    clock_out       TIMESTAMPTZ
);

-- =====================================================================
-- 12. BOOKING / JANJI TEMU (usaha jasa: salon, bengkel, laundry)
-- =====================================================================

CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');

CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    customer_id     UUID REFERENCES customers(id),
    assigned_to     UUID REFERENCES users(id),   -- karyawan yang menangani
    booking_number  VARCHAR(60) NOT NULL,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_minutes INT DEFAULT 60,
    status          booking_status DEFAULT 'pending',
    transaction_id  UUID,                        -- terisi setelah booking dibayar
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_bookings_outlet_schedule ON bookings(outlet_id, scheduled_at);

CREATE TABLE booking_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id),
    variant_id      UUID REFERENCES item_variants(id),
    quantity        NUMERIC(12,3) DEFAULT 1
);

-- =====================================================================
-- 13. TRANSAKSI / ORDER (INTI SISTEM)
-- =====================================================================

CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery', 'retail', 'service');
CREATE TYPE transaction_status AS ENUM (
    'open',         -- open bill: pesanan aktif, belum dibayar (dine-in / tab)
    'pending',      -- menunggu pembayaran
    'completed',
    'void',
    'refunded',
    'partially_refunded'
);
CREATE TYPE transaction_type AS ENUM ('sale', 'refund');

CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    outlet_id           UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    cashier_id          UUID NOT NULL REFERENCES users(id),
    customer_id         UUID REFERENCES customers(id),
    dining_table_id     UUID REFERENCES dining_tables(id),   -- untuk dine-in
    booking_id          UUID REFERENCES bookings(id),
    cash_drawer_session_id UUID REFERENCES cash_drawer_sessions(id),
    transaction_number  VARCHAR(60) NOT NULL,
    order_type          order_type DEFAULT 'retail',
    transaction_type    transaction_type DEFAULT 'sale',
    status              transaction_status DEFAULT 'completed',
    guest_count         INT,                                  -- jumlah tamu (F&B)
    subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    service_charge_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    rounding_adjustment NUMERIC(14,2) DEFAULT 0,
    total               NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_paid         NUMERIC(14,2) NOT NULL DEFAULT 0,
    change_due          NUMERIC(14,2) DEFAULT 0,
    total_cost          NUMERIC(14,2) DEFAULT 0,   -- HPP total, utk laporan laba cepat
    void_reason         TEXT,
    voided_by           UUID REFERENCES users(id),
    reference_transaction_id UUID REFERENCES transactions(id),
    delivery_address    TEXT,                       -- untuk order_type = delivery
    delivery_fee        NUMERIC(14,2) DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    UNIQUE (business_id, transaction_number)
);
CREATE INDEX idx_transactions_outlet_date ON transactions(outlet_id, created_at);
CREATE INDEX idx_transactions_business_date ON transactions(business_id, created_at);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(outlet_id, status)
    WHERE status = 'open';   -- partial index: cari open bill dengan cepat

CREATE TABLE transaction_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_id             UUID REFERENCES items(id),
    variant_id          UUID REFERENCES item_variants(id),
    served_by           UUID REFERENCES users(id),   -- karyawan yg mengerjakan (basis komisi)
    item_name_snapshot  VARCHAR(150) NOT NULL,
    variant_name_snapshot VARCHAR(100),
    quantity            NUMERIC(14,3) NOT NULL,
    unit_price          NUMERIC(14,2) NOT NULL,
    unit_cost_snapshot  NUMERIC(14,2) DEFAULT 0,     -- HPP saat itu
    line_discount       NUMERIC(14,2) DEFAULT 0,
    subtotal            NUMERIC(14,2) NOT NULL,
    is_refunded         BOOLEAN DEFAULT FALSE,
    notes               TEXT                          -- "tanpa bawang", dsb
);
CREATE INDEX idx_txn_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_txn_items_item ON transaction_items(item_id);

CREATE TABLE transaction_item_modifiers (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_item_id     UUID NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    modifier_id             UUID REFERENCES modifiers(id),
    modifier_name_snapshot  VARCHAR(100) NOT NULL,
    price_adjustment_snapshot NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE transaction_discounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    discount_id     UUID REFERENCES discounts(id),
    discount_name_snapshot VARCHAR(100),
    amount_applied  NUMERIC(14,2) NOT NULL
);

CREATE TABLE transaction_taxes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tax_id          UUID REFERENCES taxes(id),
    tax_name_snapshot VARCHAR(100),
    rate_snapshot   NUMERIC(5,2),
    amount          NUMERIC(14,2) NOT NULL
);

-- Tambahkan FK yang sebelumnya tertunda (circular reference)
ALTER TABLE loyalty_point_entries
    ADD CONSTRAINT fk_loyalty_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE voucher_redemptions
    ADD CONSTRAINT fk_voucher_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE customer_receivables
    ADD CONSTRAINT fk_receivable_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE bookings
    ADD CONSTRAINT fk_booking_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);

-- =====================================================================
-- 14. PEMBAYARAN (multi-metode per transaksi, termasuk kasbon)
-- =====================================================================

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    payment_channel_id  UUID REFERENCES payment_channels(id),
    channel_name_snapshot VARCHAR(60) NOT NULL,   -- "Tunai", "QRIS BCA"
    amount              NUMERIC(14,2) NOT NULL,
    fee_amount          NUMERIC(14,2) DEFAULT 0,  -- MDR terhitung, utk laporan net revenue
    reference_number    VARCHAR(100),
    is_receivable       BOOLEAN DEFAULT FALSE,    -- TRUE = dibayar sebagai kasbon/piutang
    paid_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payments_transaction ON payments(transaction_id);

-- =====================================================================
-- 15. KOMISI KARYAWAN (salon, barbershop, bengkel)
-- =====================================================================

CREATE TABLE commission_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id),
    transaction_item_id UUID NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    amount              NUMERIC(14,2) NOT NULL,
    is_paid             BOOLEAN DEFAULT FALSE,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_commission_user ON commission_entries(user_id, is_paid);

-- =====================================================================
-- 16. AUDIT LOG & NOMOR URUT DOKUMEN
-- =====================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_business_date ON audit_logs(business_id, created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- Penomoran dokumen atomik (struk, PO, transfer) per outlet per hari
-- Hindari race condition dua kasir bikin nomor struk sama.
CREATE TABLE document_counters (
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    doc_type        VARCHAR(30) NOT NULL,       -- 'transaction', 'po', 'transfer', 'booking'
    period          DATE NOT NULL,               -- reset harian
    last_number     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (business_id, outlet_id, doc_type, period)
);
-- Penggunaan (di dalam satu transaksi DB):
--   UPDATE document_counters SET last_number = last_number + 1
--   WHERE ... RETURNING last_number;

-- =====================================================================
-- 17. VIEW LAPORAN SIAP PAKAI
-- =====================================================================

-- Ringkasan penjualan harian per outlet
CREATE VIEW v_daily_sales AS
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
CREATE VIEW v_top_items AS
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
CREATE VIEW v_low_stock AS
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
CREATE VIEW v_outstanding_receivables AS
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

-- =====================================================================
-- CATATAN DESAIN v2
-- =====================================================================
-- 1. REUSABILITAS lintas jenis usaha diatur oleh 3 lapis:
--    a. Kolom item_type + pricing_type + track_stock + use_recipe di items
--    b. Feature flags di business_settings (enable_tables, enable_bookings,
--       enable_kasbon, dst) — satu codebase, fitur menyala sesuai tenant
--    c. Kolom JSONB (attributes, conditions, config) untuk kebutuhan
--       spesifik tanpa mengubah struktur
--
-- 2. Status 'open' pada transactions = OPEN BILL: pesanan dine-in yang
--    berjalan bisa ditambah item terus sebelum dibayar. Ini juga bisa
--    dipakai untuk "parkir" transaksi (hold order) di retail.
--
-- 3. Alur pengurangan stok saat penjualan:
--    - item biasa (track_stock=TRUE, use_recipe=FALSE): kurangi stok item
--    - item resep (use_recipe=TRUE): kurangi stok tiap ingredient di recipes
--    - bundle: kurangi stok tiap komponen di bundle_components
--    - service (track_stock=FALSE): tidak menyentuh stok
--
-- 4. Semua nilai historis di tabel transaksi disimpan sebagai SNAPSHOT
--    (nama, harga, HPP, rate pajak) — data laporan tidak berubah ketika
--    master data diedit.
--
-- 5. document_counters mencegah nomor struk duplikat saat multi-kasir
--    (race condition), tanpa bergantung pada sequence global.
--
-- 6. Untuk keamanan multi-tenant di level database, pertimbangkan
--    Row Level Security (RLS) PostgreSQL dengan policy per business_id.
--
-- 7. Rekomendasi berikutnya (di level aplikasi, bukan skema):
--    - Semua operasi penjualan dibungkus DB transaction (BEGIN..COMMIT)
--    - Gunakan optimistic locking / SELECT FOR UPDATE saat kurangi stok
--    - Backup otomatis harian (pg_dump) — mudah dijadwalkan di Proxmox
-- =====================================================================
